"""Daily and 7-day sales attendance & outlet visit recap for Monday evaluation."""
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from crm.access import active_sales, customers_for, role_of
from crm.models import Activity, ConsignmentVisitEntry

DAY_NAMES_ID = ('Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu')


def sales_attendance_recap(actor, as_of=None, selected_sales=None):
    """Build daily and 7-day ('Presensi Kunjungan Sales' / Rapat Senin) outlet visit recap.
    Sales only sees their own attendance; Manager sees all sales (or filtered sales).
    """
    role = role_of(actor)
    if role == 'WAREHOUSE':
        return []
    as_of = as_of or timezone.localdate()
    yesterday = as_of - timedelta(days=1)
    week_start = as_of - timedelta(days=6)

    if role == 'SALES':
        sales_users = [actor]
    else:
        qs = active_sales().order_by('username')
        if selected_sales:
            qs = qs.filter(pk=selected_sales)
        sales_users = list(qs)

    customer_scope = customers_for(actor)
    activities = list(
        Activity.objects.filter(
            customer__in=customer_scope,
            sales__in=sales_users,
        )
        .filter(
            Q(status='DONE', completed_at__date__gte=week_start, completed_at__date__lte=as_of)
            | Q(scheduled_date__gte=week_start, scheduled_date__lte=as_of)
        )
        .select_related('customer', 'sales')
        .order_by('-completed_at', '-created_at', '-pk')
    )
    consign_entries = list(
        ConsignmentVisitEntry.objects.filter(
            customer__in=customer_scope,
            sales__in=sales_users,
            visit_date__gte=week_start,
            visit_date__lte=as_of,
        )
        .select_related('customer', 'product', 'sales')
        .order_by('-visit_date', '-created_at', '-pk')
    )

    recaps = []
    for sales_user in sales_users:
        by_day = {
            week_start + timedelta(days=offset): {}
            for offset in range(7)
        }
        for entry in consign_entries:
            if entry.sales_id != sales_user.pk or entry.visit_date not in by_day:
                continue
            day_map = by_day[entry.visit_date]
            item = day_map.setdefault(entry.customer_id, {
                'customer_id': str(entry.customer_id),
                'code': entry.customer.code,
                'name': entry.customer.name,
                'status': 'DONE',
                'notes': [],
            })
            detail = f'{entry.product.name}: laku {entry.sold_quantity}, sisa {entry.remaining_stock}'
            if entry.added_quantity:
                detail += f', +titip {entry.added_quantity}'
            if entry.returned_quantity:
                detail += f', tarik {entry.returned_quantity}'
            item['notes'].append(detail)

        for act in activities:
            if act.customer.owner_id != sales_user.pk and act.sales_id != sales_user.pk:
                continue
            act_day = timezone.localdate(act.completed_at) if act.completed_at else act.scheduled_date
            if act_day not in by_day:
                continue
            day_map = by_day[act_day]
            item = day_map.setdefault(act.customer_id, {
                'customer_id': str(act.customer_id),
                'code': act.customer.code,
                'name': act.customer.name,
                'status': act.status,
                'notes': [],
            })
            if act.status == 'DONE':
                item['status'] = 'DONE'
            summary_text = (act.result or act.note or act.get_kind_display()).strip()
            if summary_text and summary_text not in item['notes']:
                item['notes'].append(summary_text)

        days_list = []
        all_week_outlets = set()
        total_day_visits = 0
        for offset in range(6, -1, -1):
            day_date = week_start + timedelta(days=offset)
            outlets = list(by_day[day_date].values())
            for o in outlets:
                o['summary'] = ' · '.join(o.pop('notes')[:2])
                all_week_outlets.add(o['customer_id'])
            total_day_visits += len(outlets)
            days_list.append({
                'date': day_date.isoformat(),
                'day_name': DAY_NAMES_ID[day_date.weekday()],
                'is_today': day_date == as_of,
                'is_yesterday': day_date == yesterday,
                'outlet_count': len(outlets),
                'outlet_names': ', '.join(o['name'] for o in outlets) if outlets else 'Belum ada kunjungan tercatat',
                'outlets': outlets,
            })

        today_row = next((d for d in days_list if d['is_today']), None)
        yesterday_row = next((d for d in days_list if d['is_yesterday']), None)
        recaps.append({
            'sales_id': str(sales_user.pk),
            'sales_username': sales_user.username,
            'sales_name': sales_user.get_full_name() or sales_user.username,
            'today_count': today_row['outlet_count'] if today_row else 0,
            'today_outlets': today_row['outlets'] if today_row else [],
            'today_names': today_row['outlet_names'] if today_row else 'Belum ada kunjungan tercatat',
            'yesterday_count': yesterday_row['outlet_count'] if yesterday_row else 0,
            'yesterday_outlets': yesterday_row['outlets'] if yesterday_row else [],
            'yesterday_names': yesterday_row['outlet_names'] if yesterday_row else 'Belum ada kunjungan tercatat',
            'week_unique_outlets': len(all_week_outlets),
            'week_total_visits': total_day_visits,
            'days': days_list,
        })
    return recaps
