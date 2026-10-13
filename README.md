# Arbain OneFlow

MVP lokal untuk tantangan ARB-02 UMS: profil pelanggan, aktivitas sales, pesanan, reservasi stok, pengiriman, dan pusat tindakan dalam satu aplikasi. Data demo sepenuhnya sintetis. Produk, nama pelanggan, dan alamat contoh tidak mewakili data CV Arbain.

**Mulai dari file ini.** Python 3.12 dibutuhkan; tidak ada Node.js, CDN, layanan AI, atau akun eksternal yang diperlukan untuk menjalankan aplikasi. Instalasi pertama memerlukan koneksi internet untuk paket Python. Sesudahnya demo dapat berjalan lokal.

## Jalankan di Windows

Ekstrak paket, buka PowerShell atau Command Prompt di folder yang berisi `manage.py`, lalu jalankan:

```powershell
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.lock
.venv\Scripts\python.exe manage.py migrate
.venv\Scripts\python.exe manage.py seed_demo --show-demo-credentials
.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

Buka http://127.0.0.1:8000/. Tidak perlu mengaktifkan virtualenv atau mengubah execution policy PowerShell.

`seed_demo` memakai tanggal hari ini dalam WIB. Simpan empat password acak yang tampil saat seed, khusus untuk latihan lokal Anda. Password tidak disimpan dalam source atau laporan. Jika lupa, atur ulang akun dengan `.venv\Scripts\python.exe manage.py changepassword nadia`; ulangi untuk akun yang diperlukan. Seed tidak dapat dipakai untuk mengambil ulang password.

| Akun | Peran | Pekerjaan |
|---|---|---|
| nadia | Sales A | Pelanggan CUS001–CUS006, aktivitas, draft/konfirmasi |
| rafi | Sales B | Pelanggan CUS007–CUS012, aktivitas, draft/konfirmasi |
| gudang | Gudang | Barang masuk, hitung fisik, pengiriman/pembatalan pesanan dikonfirmasi |
| manajer | Manajer | Seluruh data operasional, owner pelanggan baru, target bulanan |

Semua password berbeda. Seed menolak database bisnis yang sudah terisi; tidak menghapus atau menimpa data.

## Jalankan di Linux/macOS

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_demo --show-demo-credentials
.venv/bin/python manage.py runserver 127.0.0.1:8000
```

## Alur kerja

- **Hari Ini:** prioritas tindak lanjut, rekomendasi pembelian ulang, hasil tindakan, ringkasan sesuai peran.
- **Pelanggan:** profil, riwayat pesanan, tahap prospek, jadwal, catatan, dan hasil interaksi.
- **Pesanan:** draft → dikonfirmasi → terkirim, atau dibatalkan sebelum kirim.
- **Stok:** jumlah fisik tercatat, reservasi, tersedia, batas minimum, mutasi dan koreksi dengan alasan. Sales mendapat saldo tersedia; gudang/manajer mengubah stok.

## Edit produk dan harga

Masuk sebagai **manajer** atau **gudang**, buka **Produk & Stok**, lalu klik **Edit produk/harga** pada kartu produk. Anda dapat mengubah nama, harga jual per satuan, batas minimum stok, dan status aktif. Panel kanan menampilkan harga tersimpan, harga baru, dan selisihnya sebelum disimpan.

Masukkan harga dalam angka rupiah tanpa pemisah ribuan, misalnya `75000`. Harga dan batas minimum harus bilangan bulat nonnegatif. SKU dan satuan dikunci agar arti jumlah stok serta riwayat transaksi konsisten. Sales dapat membaca katalog dan ketersediaan; akses edit dibatasi oleh server.

Harga baru dipakai saat membuat **draft baru**. Draft/pesanan yang sudah tersimpan tetap memakai harga ketika dibuat. Contoh: pesanan 8 botol pada Rp50.000 tetap Rp400.000 meskipun harga katalog menjadi Rp55.000; draft baru 8 botol menjadi Rp440.000. Mengedit produk tidak membuat mutasi stok atau mengubah reservasi.

Tampilan memakai tema madu/krem, kartu katalog, ringkasan stok dari data aktual, ikon lokal, dan form edit dengan pratinjau harga. Pusat tindakan tampil sebelum tabel capaian agar prioritas sales lebih cepat ditemukan. Pratinjau interaktif dan tampilan browser/Windows belum diuji langsung; checklist ada pada `docs/demo.md`.

**Memperbarui instalasi sebelumnya:** hentikan server, backup folder `runtime`, lalu salin source dari ZIP terbaru ke folder aplikasi yang sama. Pertahankan `runtime` dan `.venv` milik instalasi Anda. Fitur ini tidak menambah migration; tidak perlu menjalankan seed ulang pada database yang sudah terisi. Jalankan kembali server dan muat ulang browser dengan Ctrl+F5 agar CSS/JavaScript terbaru digunakan.

Harga pesanan berasal dari katalog server dan disimpan sebagai snapshot. Semua jumlah memakai satu satuan per SKU. Draft tidak mengubah saldo. Konfirmasi menambah reservasi. Pengiriman penuh mengurangi fisik dan reservasi. Pembatalan melepas reservasi satu kali. Koreksi fisik di bawah reservasi menampilkan konflik dan memblokir konfirmasi baru SKU tersebut.

Sales hanya membuka pelanggan dan pesanan dalam cakupannya. Kontak pelanggan untuk gudang tersedia melalui pesanan dikonfirmasi/terkirim. Peran berasal dari Group akun, dengan tepat satu `SALES`, `WAREHOUSE`, atau `MANAGER`; nilai peran dari form tidak dipakai.

**Skenario unggulan:** dua sales masing-masing memesan 8 unit MADU01 dari stok 10. Pesanan pertama mereservasi 8; pesanan kedua ditolak. Gudang mengirim yang pertama dan mencatat 10 barang masuk. Tersedia berubah 10 → 2 → 2 → 12. Langkah presentasi ada di [docs/demo.md](docs/demo.md).

## Arti rekomendasi dan metrik

Tindak lanjut berasal dari aktivitas belum selesai yang telah jatuh tempo. Pembelian ulang memerlukan sedikitnya tiga tanggal pembelian berbeda; pembelian pada hari sama digabung, interval dihitung dari enam tanggal terakhir, dan jumlah indikatif dari tiga jumlah harian terakhir. Median interval dibulatkan half-up.

Prioritas = pembulatan 100 × (0,8 × urgensi + 0,2 × nilai relatif pelanggan). Urgensi dibatasi tujuh hari; nilai relatif memakai barang terkirim selama 90 hari inklusif dalam kelompok pengguna. Ini skor urutan kerja berbasis aturan, **bukan probabilitas membeli atau model ML terlatih**. Stok setelah reservasi menentukan kesiapan penawaran. Pesanan dikonfirmasi yang belum dikirim menghilangkan kandidat pembelian ulang yang sama.

Satu kartu per pelanggan; tindak lanjut eksplisit didahulukan. Tampilkan lima teratas atau buka daftar lengkap. Selesai memerlukan hasil interaksi atau pesanan terkait; tunda memerlukan tanggal setelah hari ini; tolak memerlukan alasan. Pemicu yang selesai tidak muncul kembali tanpa kejadian baru.

| Metrik | Definisi |
|---|---|
| Nilai/jumlah terkirim | Pesanan SHIPPED pada bulan berjalan sampai hari ini menurut tanggal WIB |
| Capaian target | Nilai barang terkirim dibagi target sales/bulan; target nol/belum ada ditampilkan tanpa persentase |
| Aktivitas belum selesai/selesai | Status aktivitas dari seluruh catatan dalam cakupan pengguna |
| Melewati jadwal | Aktivitas belum selesai dengan tanggal kunjungan atau tindak lanjut sebelum hari ini |
| Menunggu pengiriman | Pesanan CONFIRMED saat halaman dimuat |
| Produk di bawah minimum | Produk aktif dengan tersedia < batas minimum manual |

Nilai barang terkirim tidak membuktikan pembayaran, laba, kualitas sales, atau kenaikan omzet.

## Pengujian dan laporan

```powershell
.venv\Scripts\python.exe manage.py check
.venv\Scripts\python.exe manage.py makemigrations --check --dry-run
.venv\Scripts\python.exe manage.py test crm -v 2
.venv\Scripts\python.exe manage.py evaluate_actions --output runtime/evaluation-01.json
```

Test memakai file terpisah `runtime/test_oneflow.sqlite3`. Bila runner menemukan file test tersisa, ia meminta konfirmasi penghapusan **file test**; periksa path sebelum menjawab. Jangan memakai database bisnis sebagai database test. Konfigurasi menolak bila dua path tersebut sama.

Evaluator otomatis membuat database sementara baru, menjalankan 20 kasus dengan expected yang sudah ditentukan, lalu menghasilkan JSON actual. Database demo tidak dipakai sebagai database evaluator. Pilih nama output baru jika laporan sebelumnya sudah ada.

Bagian sensitivity mencatat bobot 1,0/0,0 dan perubahan urutan aktual; sebagian besar kasus hanya memiliki satu pelanggan sehingga belum cukup untuk memvalidasi pilihan bobot.

Pembanding A memakai pembelian terakhir paling lama dan jumlah/SKU terakhir. Pembanding B memakai aturan OneFlow tanpa pemeriksaan stok. Penawaran tidak layak berarti state READY dengan jumlah acuan melebihi tersedia. Laporan ini menguji kontribusi aturan stok pada data sintetis; belum membuktikan dampak bisnis atau keunggulan atas CRM komersial.

Uji dua koneksi ada dalam `crm.tests.test_orders.OrderConcurrencyTests`. Semua test menggunakan runner Django dan standard library. [docs/usability_protocol.md](docs/usability_protocol.md) berisi uji lima peserta; kolom hasil sengaja kosong karena belum ada pengukuran manusia. Status verifikasi aktual dicatat pada `docs/verification.md`.

## Data lokal dan latihan ulang

Default database `runtime/oneflow.sqlite3`. Kunci session acak dibuat pada `runtime/secret_key.txt` dan tidak disertakan dalam paket. Database, password, environment, dan virtualenv diabaikan git. Salin database untuk backup saat server berhenti.

Untuk latihan baru, pilih database baru sambil mempertahankan yang lama. Contoh PowerShell:

```powershell
$env:ONEFLOW_DB = "$PWD\runtime\latihan-02.sqlite3"
.venv\Scripts\python.exe manage.py migrate
.venv\Scripts\python.exe manage.py seed_demo --show-demo-credentials
.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

Gunakan environment yang sama untuk ketiga perintah. Jangan menjalankan seed pada database mitra. `ONEFLOW_DEMO=0` hanya mematikan penanda simulasi; tidak mengubah atau membersihkan data.

## Batas MVP

Satu organisasi, satu gudang, produk jadi, pengiriman penuh. Belum ada maklon/produksi, batch/FEFO/kedaluwarsa, retur, pengiriman sebagian, pajak, pembayaran, akuntansi, impor CSV, pengiriman WhatsApp, atau model ML. Koreksi dan jejak stok tersedia, tetapi kondisi fisik tetap memerlukan pemeriksaan gudang.

SQLite IMMEDIATE menserialisasi transaksi tulis singkat; perubahan dari pengguna lain terlihat setelah memuat ulang. Untuk pilot dengan banyak penulis, evaluasi PostgreSQL dan penguncian baris. Server pengembangan ini ditujukan untuk demo localhost. Paket ini belum dikonfigurasi sebagai layanan produksi atau diterbitkan.

Rancangan dan rencana awal tetap disertakan dalam `docs/superpowers/`. Untuk status aplikasi yang sekarang, gunakan README dan laporan verifikasi. Inventaris komponen pihak ketiga ada di [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); tim perlu mencatat kontribusi pencipta yang sebenarnya serta mengikuti aturan lomba mengenai penggunaan AI.
