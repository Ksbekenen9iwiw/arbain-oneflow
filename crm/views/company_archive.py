from pathlib import PurePosixPath

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied
from django.core.paginator import Paginator
from django.db.models import Q, Sum
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.utils.http import content_disposition_header
from django.views.decorators.http import require_GET

from crm.access import require_role
from crm.frontend import render_page
from crm.models import CompanyReport, CompanyReportRow

REPORT_PAGE_SIZE = 25


def archive_access(request):
    require_role(request.user, {'MANAGER'})
    if not settings.ONEFLOW_COMPANY_ARCHIVE:
        raise PermissionDenied


@login_required
@require_GET
def company_archive(request):
    archive_access(request)
    reports = CompanyReport.objects.defer('content')
    periods = list(reports.order_by('-period').values_list('period', flat=True).distinct())
    months = [period.strftime('%Y-%m') for period in periods]
    requested_month = request.GET.get('month', '')
    month = requested_month if requested_month in months else (months[0] if months else '')
    sources = reports.filter(period=periods[months.index(month)]) if month else reports.none()
    rows = CompanyReportRow.objects.filter(report__in=sources)
    kinds = CompanyReportRow.Kind
    tab = request.GET.get('tab', kinds.SALES)
    tab = tab if tab in kinds.values + ['sources'] else kinds.SALES
    search = request.GET.get('q', '').strip()[:160]
    sales, region = request.GET.get('sales', ''), request.GET.get('region', '')
    flagged = request.GET.get('review') == '1'
    available = rows.filter(kind=tab)
    all_sales = sorted(set(available.exclude(sales='').values_list('sales', flat=True)))
    all_regions = sorted(set(available.exclude(region='').values_list('region', flat=True)))
    sales = sales if sales in all_sales else ''
    region = region if region in all_regions else ''
    if sales:
        available = available.filter(sales=sales)
    if region:
        available = available.filter(region=region)
    if search:
        query = Q()
        for part in search.split():
            query &= (Q(outlet__icontains=part) | Q(product__icontains=part) | Q(sales__icontains=part) |
                      Q(region__icontains=part) | Q(details__icontains=part))
        available = available.filter(query)
    if flagged:
        available = available.exclude(issue='')
    summary = (
        available.aggregate(quantity=Sum('quantity'), returned=Sum('returned'), sold=Sum('sold'))
        if tab == kinds.SALES else {}
    )
    result = Paginator(available, REPORT_PAGE_SIZE).get_page(request.GET.get('page'))
    records = [
        dict(row, source_url=reverse('company_archive_file', args=[row['report_id']]) + f"#page={row['page']}")
        for row in result.object_list.values(
            'id', 'sales', 'outlet', 'product', 'region', 'observed_date', 'quantity', 'returned', 'sold',
            'details', 'issue', 'page', 'source_row', 'report_id'
        )
    ]
    source_records = [
        dict(id=s.pk, name=PurePosixPath(s.path).name, path=s.path, url=reverse('company_archive_file', args=[s.pk]))
        for s in sources
    ]
    data = dict(
        heading='Data perusahaan', month=month, months=months, tabs=[*kinds.choices, ('sources', 'Dokumen asli')],
        tab=tab, sales=sales, region=region, all_sales=all_sales, all_regions=all_regions, search=search, flagged=flagged,
        rows=records, sources=source_records, summary=summary, total=result.paginator.count,
        page_number=result.number, page_size=REPORT_PAGE_SIZE, source_count=len(source_records),
        issue_count=rows.exclude(issue='').count(),
    )
    return render_page(request, 'crm/company_archive.html', data)


@login_required
@require_GET
def company_archive_file(request, report_id):
    archive_access(request)
    source = get_object_or_404(CompanyReport, pk=report_id)
    filename = PurePosixPath(source.path).name
    is_pdf = filename.lower().endswith('.pdf')
    mime = 'application/pdf' if is_pdf else 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    response = HttpResponse(bytes(source.content), content_type=mime)
    response['Content-Disposition'] = content_disposition_header(not is_pdf, filename)
    response['Cache-Control'] = 'private, no-store'
    response['X-Content-Type-Options'] = 'nosniff'
    return response
