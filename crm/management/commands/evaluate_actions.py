import json
import os
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Jalankan 20 kasus sintetis dalam database test sementara dan simpan hasil aktual.'
    requires_system_checks = []

    def add_arguments(self, parser):
        parser.add_argument('--output', default='runtime/evaluation.json')

    def handle(self, *args, **options):
        output = Path(options['output']).resolve()
        if output.suffix.lower() != '.json':
            raise CommandError('Pilih file output berakhiran .json.')
        if output.exists():
            raise CommandError('File output sudah ada. Pilih nama baru agar laporan lama tidak tertimpa.')
        output.parent.mkdir(parents=True, exist_ok=True)
        with TemporaryDirectory(prefix='oneflow-evaluation-') as folder:
            environment = os.environ.copy()
            environment.update(ONEFLOW_DB=str(Path(folder) / 'bootstrap.sqlite3'), ONEFLOW_TEST_DB=str(Path(folder) / 'cases.sqlite3'), ONEFLOW_EVALUATION_OUTPUT=str(output), PYTHONIOENCODING='utf-8')
            result = subprocess.run([sys.executable, str(settings.BASE_DIR / 'manage.py'), 'test', 'crm.tests.test_actions.ActionCaseEvaluationTests', '--noinput', '--verbosity=1'], cwd=settings.BASE_DIR, env=environment, capture_output=True, text=True, encoding='utf-8')
        if result.returncode:
            self.stderr.write(result.stdout + result.stderr)
            raise CommandError(f'Evaluasi gagal (exit {result.returncode}); hasil tidak boleh diklaim lulus.')
        if not output.exists():
            raise CommandError('Runner tidak menghasilkan laporan.')
        report = json.loads(output.read_text(encoding='utf-8'))
        if report.get('case_count') != 20 or report.get('passed_cases') != 20:
            raise CommandError('Hasil tidak memenuhi 20 kasus yang diharapkan.')
        self.stdout.write(self.style.SUCCESS(f"OneFlow: {report['passed_cases']}/{report['case_count']} kasus sesuai expected."))
        for method, metrics in report['methods'].items():
            self.stdout.write(f"{method}: {metrics['invalid_offers']} penawaran pemenuhan tidak layak.")
        self.stdout.write(f'Laporan: {output}')
