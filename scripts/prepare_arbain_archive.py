"""Extract the October 2026 Arbain report layouts with pdfplumber and python-docx."""
import argparse
import hashlib
import json
import re
from datetime import datetime
from pathlib import Path

import pdfplumber
from docx import Document

PERIOD = '2026-10'
SALES_NAMES = {'endri': 'Endri', 'monic': 'Monic'}
RECORD_COLUMNS = ('A', 'M', 'R', 'L', 'S')


def clean(value):
    return ' '.join((value or '').split())


def number(value):
    value = clean(value)
    return int(value) if value.isascii() and value.isdecimal() and len(value) <= 12 else None


def date_cell(value, *, vertical=False):
    raw = ''.join((value or '').split())
    if vertical and re.fullmatch(r'\d{4}/\d{2}/\d{2}', raw):
        raw = raw[::-1]
    try:
        return datetime.strptime(raw, '%d/%m/%Y').date().isoformat()
    except ValueError:
        return None


def record(kind, page, table, row, group=0, **fields):
    return dict(kind=kind, page=page, source_row=f'{table}.{row}.{group}', **fields)


def visit_rows(page, table, grid, pn, tn):
    sales = SALES_NAMES.get(clean(grid[0][0]).lower())
    if not sales or [clean(c).lower() for c in grid[1][:4]] != ['no', 'outlet', 'alamat', 'tgl']:
        return
    date_cells = [(cells.cells[3], date_cell(row[3], vertical=True))
                  for cells, row in zip(table.rows[2:], grid[2:]) if len(cells.cells) > 3 and cells.cells[3]]
    for ix, row in enumerate(grid[2:], 2):
        if number(row[0]) is None or not clean(row[1]):
            continue
        bbox = table.rows[ix].cells[0]
        center = (bbox[1] + bbox[3]) / 2 if bbox else -1
        observed = next((day for cell, day in date_cells if cell[1] <= center < cell[3]), None)
        issue = '' if observed and observed.startswith(PERIOD) else 'Tanggal kunjungan perlu ditinjau'
        yield record('visits', pn, tn, ix+1, sales=sales, outlet=clean(row[1]), observed_date=observed,
                     details={'Alamat': clean(row[2]), 'No. sumber': clean(row[0])}, issue=issue)


def grouped_rows(grid, pn, tn, sales, kind, region=''):
    regional = kind == 'ledger'
    start = 4 if regional else 2
    keys = RECORD_COLUMNS if regional else ('jmh', 'rt', 'lk')
    header_index = next((i for i in range(min(4, len(grid))) if tuple(clean(v).lower() for v in grid[i][start:start+len(keys)]) == tuple(k.lower() for k in keys)), None)
    if header_index is None:
        return
    product = ''
    groups = []
    for col in range(start, len(grid[header_index])-len(keys)+1, len(keys)):
        if tuple(clean(v).lower() for v in grid[header_index][col:col+len(keys)]) != tuple(k.lower() for k in keys):
            raise ValueError(f'Struktur kolom berubah di halaman {pn}, tabel {tn}, kolom {col}')
        product = clean(grid[0][col]) or product
        variant = clean(grid[1][col]) if header_index == 2 else ''
        name = ' '.join(filter(None, [product, variant]))
        groups.append((col, name))
    for ix, row in enumerate(grid[header_index+1:], header_index+2):
        outlet = clean(row[1])
        if not outlet or outlet.lower() == 'total':
            continue
        original = clean(row[0])
        if not original.isdecimal() and not any(clean(v) for v in row[start:]):
            continue
        row_issue = 'Nama atau nomor outlet perlu ditinjau' if not original.isdecimal() or int(original) > 750 or re.search(r'\b(aapp|ttaakkoo)\b', outlet, re.I) else ''
        for col, name in groups:
            raw = [clean(v) for v in row[col:col+len(keys)]]
            if not any(raw):
                continue
            if regional and all(v in {'', '0'} for v in raw):
                continue
            values = dict(zip(keys, map(number, raw)))
            issues = [row_issue] if row_issue else []
            if not name:
                issues.append('Judul produk tidak terbaca pada halaman ini')
            if any(value and number(value) is None for value in raw):
                issues.append('Nilai bukan angka di dokumen')
            if regional:
                observed = date_cell(row[2])
                if clean(row[2]) and not observed or clean(row[3]) and not date_cell(row[3]):
                    issues.append('Tanggal setor/ambil perlu ditinjau')
                yield record(kind, pn, tn, ix, col, sales=sales, outlet=outlet, product=name or 'Kolom produk '+str(col), region=region, observed_date=observed,
                             sold=values['L'], returned=values['R'], quantity=values['S'],
                             details={'No. sumber': original, 'Tanggal setor': clean(row[2]), 'Tanggal ambil': clean(row[3]), **dict(zip(keys, raw))},
                             issue='; '.join(issues))
            else:
                quantity, returned, sold = (values[key] for key in keys)
                if quantity is not None and all(v is None or v.isdecimal() for v in [*raw[1:]]) and quantity != (returned or 0)+(sold or 0):
                    issues.append('Jumlah berbeda dari retur + laku pada sumber')
                yield record(kind, pn, tn, ix, col, sales=sales, outlet=outlet, product=name or 'Kolom produk '+str(col), quantity=quantity, returned=returned,
                             sold=sold, details={'No. sumber': original, **dict(zip(keys, raw))}, issue='; '.join(issues))


def extract_pdf(path, kind, owner, region):
    with pdfplumber.open(path) as pdf:
        for pn, page in enumerate(pdf.pages, 1):
            for tn, table in enumerate(page.find_tables(), 1):
                grid = table.extract()
                if kind == 'visits':
                    yield from visit_rows(page, table, grid, pn, tn)
                elif kind in {'outlet_sales', 'ledger'}:
                    yield from grouped_rows(grid, pn, tn, owner, kind, region)
                elif kind == 'sales' and [clean(v).lower() for v in grid[0][:5]] == ['no','nama barang','j','r','l']:
                    sales = 'Endri' if table.bbox[0] < page.width/2 else 'Monic'
                    for ix, row in enumerate(grid[1:], 2):
                        if number(row[0]) is None or not clean(row[1]):
                            continue
                        quantity, returned, sold = map(number, row[2:5])
                        issue = ''
                        if None in (quantity, returned, sold) or quantity != returned + sold:
                            issue = 'Jumlah berbeda dari retur + laku pada sumber' if None not in (quantity, returned, sold) else 'Nilai penjualan perlu ditinjau'
                        yield record(kind, pn, tn, ix, sales=sales, product=clean(row[1]), quantity=quantity, returned=returned,
                                     sold=sold, details={'No. sumber': clean(row[0]), **dict(zip('JRL', map(clean, row[2:5])))}, issue=issue)
                elif kind == 'stock' and len(grid) > 2 and clean(grid[1][0]).upper() == 'NO' and clean(grid[1][2]).upper() == 'JUMLAH':
                    scope = clean(grid[0][0])
                    sales = owner or SALES_NAMES[scope.lower()]
                    for ix, row in enumerate(grid[2:], 3):
                        if number(row[0]) is not None and clean(row[1]):
                            yield record(kind, pn, tn, ix, sales=sales, region=scope.title() if owner else '', product=clean(row[1]),
                                         quantity=number(row[2]), details={'Cakupan': 'Wilayah' if owner else 'Global', 'Jumlah': clean(row[2])},
                                         issue='' if number(row[2]) is not None else 'Jumlah perlu ditinjau')
        return len(pdf.pages)


def classify(path):
    stem = path.stem.upper()
    owner = next((name for name in SALES_NAMES.values() if name.upper() in stem or name.upper() in path.parent.name.upper()), '')
    if stem.startswith('REKAP PENJUALAN'):
        return 'sales', '', ''
    if stem.startswith('KUNJUNGAN'):
        return 'visits', '', ''
    if stem.startswith('OUTLET SETOR'):
        return 'outlet_sales', owner, ''
    if stem.startswith(('UPDATE STOK OUTLET', 'LAPORAN UPDATE GLOBAL')):
        return 'stock', owner, ''
    if owner and 'RECORD' in path.parent.name.upper():
        return 'ledger', owner, path.stem.title()
    raise ValueError(f'Jenis dokumen belum dikenali: {path.name}')


def prepare(root):
    files = []
    for path in sorted(p for p in root.rglob('*') if p.suffix.lower() in {'.pdf', '.docx'}):
        if path.suffix.lower() == '.docx':
            document = Document(path)
            rows = [record('notes', 1, 1, i, details={'Catatan': p.text.strip()})
                    for i, p in enumerate(document.paragraphs, 1) if p.text.strip()]
            for tn, table in enumerate(document.tables, 2):
                rows.extend(record('notes', 1, tn, ix, details={'Catatan': ' · '.join(dict.fromkeys(cell.text.strip() for cell in row.cells if cell.text.strip()))})
                            for ix, row in enumerate(table.rows, 1) if any(cell.text.strip() for cell in row.cells))
        else:
            try:
                rows = list(extract_pdf(path, *classify(path)))
            except (ValueError, KeyError, IndexError) as error:
                raise ValueError(f'{path.relative_to(root)}: {error}') from error
        if not rows:
            raise ValueError(f'Tidak ada tabel yang dikenali: {path.name}')
        files.append(dict(path=path.relative_to(root).as_posix(), sha256=hashlib.sha256(path.read_bytes()).hexdigest(), rows=rows))
    if not files:
        raise ValueError('Folder tidak berisi dokumen')
    return dict(period=PERIOD, files=files)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folder', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    result = prepare(args.folder)
    args.output.write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
    for f in result['files']:
        print(f"{len(f['rows']):5} baris | {sum(bool(r.get('issue')) for r in f['rows']):3} tinjau | {f['path']}")
