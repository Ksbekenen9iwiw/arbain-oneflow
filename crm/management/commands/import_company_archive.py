"""Validate and import a private historical report package."""
import hashlib
import json
from datetime import date
from pathlib import Path

from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from crm.models import CompanyReport, CompanyReportRow

ROW_FIELDS = {
    'kind', 'page', 'source_row', 'sales', 'outlet', 'product', 'region',
    'observed_date', 'quantity', 'returned', 'sold', 'details', 'issue',
}


class Command(BaseCommand):
    help = 'Validasi paket laporan perusahaan. Tambahkan --apply untuk menyimpan ke database yang aktif.'

    def add_arguments(self, parser):
        parser.add_argument('manifest', type=Path)
        parser.add_argument('source_folder', type=Path)
        parser.add_argument('--apply', action='store_true')

    def handle(self, *args, manifest, source_folder, apply, **options):
        try:
            package = json.loads(manifest.read_text(encoding='utf-8'))
            period = date.fromisoformat(package['period'] + '-01')
            root = source_folder.resolve(strict=True)
            files = package['files']
            if not isinstance(files, list) or not files:
                raise ValueError('Paket tidak berisi dokumen.')
            seen = set()
            saved = 0
            with transaction.atomic():
                for item in files:
                    relative = item['path']
                    path = (root / relative).resolve(strict=True)
                    if not path.is_relative_to(root) or not path.is_file() or path.relative_to(root).as_posix() != relative:
                        raise ValueError('Path dokumen tidak valid.')
                    if relative in seen or len(relative) > 350 or path.suffix.lower() not in {'.pdf', '.docx'}:
                        raise ValueError(f'Nama atau format dokumen tidak valid: {relative}')
                    seen.add(relative)
                    if path.stat().st_size > 20 * 1024 * 1024:
                        raise ValueError(f'Dokumen melebihi 20 MB: {relative}')
                    content = path.read_bytes()
                    digest = hashlib.sha256(content).hexdigest()
                    if digest != item['sha256']:
                        raise ValueError(f'File sumber berubah setelah ekstraksi: {relative}')
                    reports = CompanyReport.objects.defer('content')
                    report = reports.filter(period=period, path=relative).first()
                    if report and report.checksum != digest:
                        raise ValueError(f'Dokumen berbeda sudah tersimpan untuk periode ini: {relative}')
                    rows = self.validate_rows(item['rows'], relative)
                    if report:
                        expected = [self.row_snapshot(row) for row in rows]
                        actual = [self.row_snapshot(row) for row in report.rows.order_by('id')]
                        if actual != expected:
                            raise ValueError(f'Hasil ekstraksi berbeda dari arsip tersimpan: {relative}')
                    elif apply:
                        report = reports.create(period=period, path=relative, checksum=digest, content=content)
                        for row in rows:
                            row.report = report
                        CompanyReportRow.objects.bulk_create(rows, batch_size=400)
                        saved += 1
                    self.stdout.write(f'{relative}: {len(rows)} baris, {sum(bool(r.issue) for r in rows)} perlu tinjau')
        except (OSError, ValueError, TypeError, KeyError, ValidationError) as error:
            raise CommandError(f'Impor dibatalkan. {error}') from error
        self.stdout.write(self.style.SUCCESS(
            f'{saved} dokumen baru tersimpan.' if apply else 'Validasi selesai. Jalankan dengan --apply untuk menyimpan.'
        ))

    @staticmethod
    def row_snapshot(row):
        return {name: getattr(row, name) for name in ROW_FIELDS}

    @staticmethod
    def validate_rows(data, relative):
        if not isinstance(data, list) or not data:
            raise ValueError(f'Tidak ada baris: {relative}')
        rows, keys = [], set()
        for fields in data:
            if not isinstance(fields, dict) or fields.keys() - ROW_FIELDS:
                raise ValueError(f'Format baris tidak dikenal: {relative}')
            if not isinstance(fields.get('details'), dict) or not all(
                isinstance(k, str) and isinstance(v, str) for k, v in fields['details'].items()
            ):
                raise ValueError(f'Detail baris harus berupa kolom sumber: {relative}')
            row = CompanyReportRow(**fields)
            row.clean_fields(exclude={'report'})
            key = (row.page, row.source_row, row.kind)
            if row.page < 1 or not row.source_row or key in keys:
                raise ValueError(f'Posisi baris ganda atau tidak valid: {relative} {key}')
            keys.add(key)
            rows.append(row)
        return rows
