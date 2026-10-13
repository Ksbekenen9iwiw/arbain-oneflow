# Bukti verifikasi Arbain OneFlow

Status: MVP awal dan review-nya selesai. Pembaruan Edit produk/harga serta tampilan katalog/dashboard selesai dan diverifikasi oleh implementer. Minor teks kosong pusat tindakan dari review awal juga telah diperbaiki. Review independen awal tidak mencakup pembaruan ini.

Tanggal: 11 Oktober 2026. Lingkungan verifikasi: Linux, Python 3.12.14, Django 5.2.18, SQLite bawaan Python. Panduan Windows disertakan; eksekusi langsung pada Windows belum diuji.

| Pemeriksaan | Bukti aktual |
|---|---|
| Sistem Django | manage.py check: tidak ada masalah |
| Migration | makemigrations --check --dry-run: tidak ada perubahan |
| Seluruh suite | 85 test lulus, 0 gagal (38,884 detik sesudah pembaruan Edit produk/harga) |
| Konkurensi | Dua koneksi, masing-masing 8 dari stok 10: satu CONFIRMED, satu ditolak; diulang tiga kali dan lulus |
| Demo | (10,0,10) → (10,8,2) → penolakan tanpa perubahan → (2,0,2) → (12,0,12) |
| Idempotensi | Reservasi/batal/kirim dan ID mutasi tidak memperbarui saldo dua kali |
| Evaluator | 20/20 kasus expected sesuai actual; database aplikasi tidak berubah pada uji fingerprint |
| Baseline A / B / OneFlow | Penawaran tidak layak: 2 / 2 / 0 pada 20 kasus sintetis |
| Sensitivitas bobot | 1,0/0,0 tercatat; 0 kasus berubah urutan (mayoritas satu pelanggan, belum memvalidasi pilihan bobot) |
| Halaman data seed | HTTP Hari Ini/Pesanan/Stok: 200 untuk empat akun; Pelanggan: 403 bagi gudang, 200 bagi sales/manajer |
| JavaScript | node --check lulus |
| Edit produk | Manajer/gudang HTTP 200 dan dapat menyimpan; sales HTTP 403 meski role dipalsukan; CSRF diuji |
| Harga dan stok | Harga lama Rp50.000 tetap pada pesanan tersimpan; draft baru memakai Rp75.000 setelah edit; saldo 10/2/8 tetap, tanpa mutasi stok tambahan |
| Validasi edit | Harga negatif/pecahan/teks/kosong/di atas rentang integer ditolak; nama kosong dan minimum stok tidak valid ditolak |
| Seed pada tampilan baru | 16 pemeriksaan HTTP pada database sementara: Hari Ini/Stok/Pesanan 200 untuk empat akun; edit 403 untuk dua sales, 200 untuk gudang/manajer |

Laporan lengkap actual, expected, pembanding, dan sensitivitas: evaluation-synthetic.json. Angka di atas merupakan hasil perangkat lunak/data sintetis, bukan waktu tugas manusia atau dampak bisnis CV Arbain.

Browser rendering ukuran 390×844/1366×768, klik interaktif JavaScript, eksekusi pada Windows, uji lima peserta, dan pilot mitra belum dilakukan. Checklist terdapat pada demo.md dan protokol manusia pada usability_protocol.md.

Perintah verifikasi akhir:

```bash
.venv/bin/python manage.py test crm -v 2 --noinput
.venv/bin/python manage.py check
.venv/bin/python manage.py makemigrations --check --dry-run
git diff --check
node --check crm/static/crm/app.js
```

## Pembaruan Edit produk/harga

13 test tambahan berada pada `crm/tests/test_products.py`. Sebelum implementasi, 12 perilaku baru menghasilkan kegagalan yang sesuai (19 failure dengan subtest), sedangkan satu kontrol routing produk tidak ditemukan sudah lulus. Sesudah implementasi, 13/13 test lulus (6,034 detik), lalu seluruh suite 85/85 lulus. Baseline sebelum perubahan: 72/72 lulus (32,316 detik).

Form hanya memperbarui nama, harga, batas minimum, dan status aktif. SKU/satuan dari payload tambahan tidak dipakai. Harga asal ditangkap sebelum validasi ModelForm sehingga perbandingan harga tetap benar saat field lain gagal validasi. Pesanan memakai snapshot harga, dan edit tidak mengubah saldo atau ledger stok. Tidak diperlukan migration baru.

Pembaruan visual: tema madu/krem; kartu produk dan ringkasan stok aktual; navigasi dengan ikon SVG lokal; form edit dengan perbandingan harga; pusat tindakan sebelum tabel capaian. Tidak ada dependency baru untuk menjalankan aplikasi. JavaScript hanya diperiksa sintaksnya; pratinjau dinamis, ukuran layar, fokus dan hasil visual tetap memerlukan browser QA. Pemeriksa CSS tambahan tidak tersedia pada runtime dan tidak dipasang. Tidak ada server/browser yang dijalankan.

## Hasil tinjauan independen

Reviewer meninjau perubahan MVP awal dari baseline `383772b41b806181c67a3ae6622c3e4b9b25243a` sampai `13ad0a05d9529907c23fe19e4b4f2e4962bb9fd6`. Reviewer mereproduksi tiga temuan melalui database sementara terpisah dan Django HTTP client; tidak mengubah source atau database demo. Tidak ditemukan temuan Critical. Reviewer tidak menjalankan ulang seluruh suite; run 72 test setelah perbaikan awal dan run 85 test setelah pembaruan produk dilakukan oleh implementer.

| Temuan | Penilaian akhir | Penanganan dan bukti |
|---|---|---|
| ID ≥1000 berubah menjadi 1.000 dalam URL riwayat dan query pelanggan | Important | URL path memakai reverse; query ID memakai unlocalize. Tiga test tautan gagal sebelum perbaikan dan lulus sesudahnya. Link riwayat kembali HTTP 200; pelanggan tetap terpilih pada draft. |
| Baris pesanan dihapus muncul kembali sesudah validasi gagal, tetapi tetap ditandai DELETE | Important, dinaikkan dari Minor | Keadaan tersembunyi dirender dari nilai DELETE. Test invalid POST gagal sebelum perbaikan, lulus sesudahnya; koreksi jumlah menghasilkan satu baris yang memang dipertahankan. |
| Pusat tindakan kosong mengatakan seluruh prioritas tertangani, meski kunjungan bisa masih terlambat | Minor, ditunda pada MVP awal; diperbaiki saat pembaruan produk | Teks kini menjelaskan ketiadaan rekomendasi dan mengarahkan pengguna memeriksa aktivitas. Test kunjungan terlambat tanpa rekomendasi gagal sebelum perubahan dan lulus sesudahnya. |

Uji regresi berada pada `crm/tests/test_review_regressions.py`. Seluruh empat test tersebut diamati gagal untuk masalah sebenarnya sebelum kode diperbaiki, lalu lulus. Perbaikan dilakukan dalam satu pass; tidak dilakukan tinjauan kedua. Branch `feat/oneflow-mvp` dan worktree dipertahankan untuk penyerahan source lokal.

## Keputusan pelaksanaan yang dicatat

- Ruling: bundled task-start/task-done/sdd-workspace/review-package/code-reviewer resources are unavailable through the skill provider after exact and alternate resource lookups — use a local equivalent for briefs, BASE, test logs, completion ledger, and final review brief — cost if wrong: workflow bookkeeping could differ; application gates and git ranges remain independently checked.

- Task 4: Ruling: CLI tests use --noinput on the dedicated generated test database after a leftover file caused an input prompt; settings reject using the application DB as test DB — cost if wrong: a wrongly configured test file could be replaced, so the path guard is mandatory.

- Task 8: Ruling: managed Linux has no control-browser capability; Sites explicitly forbids an alternate preview/browser path — skip browser and 390x844/1366x768 visual QA, complete HTTP/HTML workflow checks, and deliver a human checklist — cost if wrong: clipping, focus, or browser-specific problems remain unverified.

- Task 9: Ruling: spec section 6.3 asks for urgency-only sensitivity but plan evaluation names only A/B/OneFlow — include measured 1.0/0.0 scores/order comparison in the JSON report without changing production priorities — cost if wrong: the report schema has an extra field; no claim that these mostly single-customer cases validate the weights.

- Final: Ruling: reviewer declined browser interaction/rendering, Windows execution, human usability, and partner pilot effectiveness — accept the bounded local MVP with automated HTTP/business tests and explicit unperformed checks/protocols; no impact claims — cost if wrong: platform, UI, and real-work outcomes remain unverified.

- Final: Ruling: writing-good-tests.md is unavailable through the skill provider at both referenced paths — use the main TDD instructions (name the real failure, reproduce first, no mocks) — cost if wrong: auxiliary test guidance is unavailable; RED→GREEN and the full suite remain required.

- Final: Ruling: delivery is an authorized local source ZIP, with no remote repository or integration request — preserve feat/oneflow-mvp and its worktree, skip the finishing skill integration menu, and hand over the package — cost if wrong: repository integration remains a separate user decision.

Daftar keputusan di atas lengkap sesuai ledger pelaksanaan MVP awal. Minor yang ditunda saat itu telah diperbaiki pada pembaruan produk. Pembaruan mengikuti permintaan pengguna untuk menambahkan edit serta meningkatkan tampilan; model dan arsitektur MVP dipertahankan.
