# Reseed data sintetis realistis

Backend repo ini adalah Django 5.2. Database lokal memakai SQLite di
`runtime/oneflow.sqlite3`. Jika `DATABASE_URL` terisi, aplikasi memakai PostgreSQL;
`render.yaml` menyiapkan PostgreSQL untuk deployment Render. `DATABASE_URL`
mengalahkan `ONEFLOW_DB`, jadi kosongkan variabel itu ketika latihan lokal.

## Dataset baru

Tanggal acuan default mengikuti hari ini di Asia/Jakarta. Dengan
`--as-of 2026-11-06 --seed 20261106`, dataset berisi:

- 48 pelanggan fiktif di enam wilayah Solo Raya, terbagi ke Nadia dan Rafi.
- Enam segmen: toko herbal, apotek, grosir, gerai perawatan, toko oleh-oleh,
  dan reseller. Empat pelanggan tidak aktif; beberapa prospek belum membeli.
- 8 SKU yang tetap cocok dengan foto produk aplikasi. Harga Rp26.000–Rp58.000.
- 335 pesanan: riwayat sekitar 180 hari, keranjang campuran, jumlah sesuai
  segmen, jeda pembelian bervariasi, draft, antrean kirim, dan pembatalan.
- 13 pengajuan sampel: membeli, mengevaluasi, tidak berminat, tanpa tanggapan,
  penolakan pemberian berulang, serta antrean persetujuan/pengiriman.
- 74 pengadaan: penerimaan reguler per batch, keterlambatan pemasok, pengadaan
  berjalan, dan satu penerimaan sebagian. Ada lot ditahan/kedaluwarsa dan lot
  yang sisa masa simpannya tidak memenuhi syarat pengiriman.
- Target bulanan, hasil interaksi, serta tindak lanjut terlambat dan mendatang.

Nama, alamat, harga, permintaan, masa simpan, dan target merupakan asumsi
simulasi; bukan data, harga resmi, kebijakan, atau pengukuran CV Arbain.
Kontak sengaja memakai `DEMO-0821-XXXX-…`, sehingga bukan nomor yang dapat
dihubungi. Tidak ada klaim kesehatan/khasiat produk dalam catatan pelanggan.
Jumlah pengadaan diturunkan dari permintaan sintetis per siklus ditambah
cadangan; bukan model prediksi pemasok atau bukti kinerja bisnis nyata.

## Memakai database lokal baru

Dari folder repo, setelah dependensi terpasang:

```bash
export DATABASE_URL=''
export ONEFLOW_DB="$PWD/runtime/realistic-2026-11-06.sqlite3"
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_realistic --as-of 2026-11-06 --show-demo-credentials
.venv/bin/python manage.py runserver 127.0.0.1:8000
```

Di PowerShell gunakan `$env:DATABASE_URL = ''`,
`$env:ONEFLOW_DB = "$PWD\runtime\realistic-2026-11-06.sqlite3"`, dan
`.venv\Scripts\python.exe`. Untuk tanggal demo terbaru, hilangkan `--as-of`.
Simpan sandi yang dicetak pada pembuatan akun pertama. Akun demo yang sudah
ada dan memiliki peran sesuai akan dipakai kembali tanpa mengganti sandinya.
Jika sandi tidak disimpan, gunakan `manage.py changepassword <username>`.

Seed menolak database CRM terisi. Perintah lama `seed_demo` tetap tersedia
untuk skenario presentasi 12 pelanggan yang sudah didokumentasikan sebelumnya.

## Mengganti data demo lama, termasuk PostgreSQL online

**Untuk pemegang akun Render:** terapkan berkas dalam paket perubahan ke repo
dan deploy source-nya. Database tidak otomatis di-reset saat deploy.
Jika layanan menyediakan Shell, jalankan command di bagian ini dari Shell.
Layanan web Render **Free tidak menyediakan Shell/SSH**; untuk paket Free,
jalankan command dari komputer pemegang akun dengan koneksi eksternal database
seperti petunjuk di bawah. Tidak perlu membagikan password database di chat.

Pastikan target memang aplikasi simulasi yang hendak diganti. Hentikan akses
tulis/server selama reseed dan pemulihan. Deploy dahulu source yang memuat
perintah baru ini; redeploy saja tidak mengganti database yang sudah terisi.
Jalankan dari lingkungan server yang sudah memiliki koneksi database target:

```bash
python manage.py migrate --noinput
python manage.py reseed_realistic \
  --confirm-demo-reset \
  --as-of 2026-11-06 \
  --backup /path/to/persistent-backups/oneflow-before-reseed-20261106.json
```

Ganti path backup dengan direktori privat yang persisten dan benar-benar
tersedia di lingkungan tersebut; contoh di atas bukan path siap pakai.
Gunakan `.venv/bin/python` untuk instalasi lokal. `ONEFLOW_DEMO` harus `1`.
Untuk demo di tanggal lain, hilangkan `--as-of` atau ganti nilainya.

Perintah ini mengganti **seluruh baris aplikasi CRM**, termasuk data yang
ditambahkan lewat antarmuka sejak seed sebelumnya. Tidak menghapus akun,
grup, password, migrasi, atau sesi. Tidak menjalankan `flush`, tidak mengubah
skema, dan tidak memanggil layanan pengiriman pesan. Akun `nadia`, `rafi`,
`gudang`, `manajer` yang sudah ada harus aktif dan memiliki peran demo yang
sesuai; akun staff/superuser dengan nama tersebut ditolak.

Backup JSON dibuat sebelum penghapusan, tidak boleh menimpa file lama, dan
memuat seluruh model CRM beserta akun/grup dengan izin file `0600` di Unix.
Backup mengandung hash password dan data lama: simpan privat, jangan commit.
Ini backup data aplikasi, bukan salinan lengkap PostgreSQL: sessions,
permissions bawaan dan django_migrations tidak diekspor. Untuk pemulihan
seluruh instalasi beserta sesi, ambil backup database asli dengan fasilitas
hosting/`pg_dump` juga. Salin backup keluar container sebelum restart/deploy.

Penghapusan dan seed berjalan dalam satu transaksi. PostgreSQL mengunci
tabel CRM; SQLite memakai transaksi IMMEDIATE. Jika validasi gagal, seluruh
perubahan data CRM dibatalkan. Setelah berhasil, proses server bisa dijalankan
kembali. Jangan menjalankan reseed paralel dengan perubahan akun/izin.

### Render Free: jalankan dari komputer pemegang akun

1. Siapkan salinan repo dengan paket perubahan ini dan dependensi Python dari
   `requirements.lock`. Frontend tidak perlu dibangun untuk menjalankan reseed.
2. Di dashboard Render, buka database PostgreSQL milik aplikasi, lalu bagian
   koneksi dan salin **External Database URL**. Pastikan database masih aktif.
3. Jika koneksi eksternal dibatasi (repo ini memakai `ipAllowList: []`), pemilik
   akun perlu mengizinkan IP publik komputernya saja untuk proses ini, kemudian
   mengembalikan pembatasan sesudah selesai. Jangan membuka akses semua IP.
4. Hentikan aktivitas tulis aplikasi, lalu jalankan skrip berikut dari folder
   repo. URL diminta secara tersembunyi, tidak ditulis ke source atau history.
   Periksa nama host dan database yang ditampilkan sebelum mengetik `RESET DEMO`.

```bash
.venv/bin/python scripts/reseed_render.py
```

Di Windows: `.venv\Scripts\python.exe scripts\reseed_render.py`.
Backup disimpan pada komputer pemegang akun, di `runtime/backups/`; ini lebih
mudah dipertahankan dibanding file di container sementara. Skrip meminta TLS
untuk koneksi eksternal. Setelah selesai, jalankan kembali aplikasi dan periksa
dashboard, pesanan, stok, serta sampel. Password akun demo lama tetap berlaku.

Rujukan: [akses Shell Render](https://render.com/docs/ssh) dan
[koneksi PostgreSQL eksternal](https://render.com/docs/postgresql-creating-connecting).

## Memulihkan backup data aplikasi

Gunakan database **baru dan kosong**, source dengan skema yang sama, serta
koneksi yang menunjuk database pemulihan. Jangan load fixture ke database
yang masih berisi data sintetis baru karena ID/natural key bisa bertabrakan.

```bash
python manage.py migrate --noinput
python manage.py loaddata /path/to/oneflow-before-reseed-20261106.json
```

Setelah memeriksa data dan login, alihkan koneksi aplikasi ke database hasil
pemulihan. Akun dan hash password lama ikut dipulihkan; pengguna login ulang.

## Query pemeriksaan dan pengujian

`scripts/check_synthetic.sql` berisi SQL baca saja untuk SQLite/PostgreSQL:
jumlah data, nominal pesanan, saldo batch, dan reservasi. Untuk membuat atau
mengganti data, gunakan perintah Django di atas: INSERT ke tabel pesanan saja
tidak membentuk alokasi batch, mutasi stok, atau jejak keputusan sampel.

```bash
.venv/bin/python manage.py check
.venv/bin/python manage.py test crm.tests.test_realistic_seed --noinput
.venv/bin/python manage.py shell -c 'from crm.synthetic_validation import validate_synthetic; validate_synthetic()'
```

Validasi otomatis mengecek saldo historis tidak negatif, total pesanan,
saldo produk versus batch, reservasi pesanan dan sampel, mutasi penerimaan PO,
urutan draft/konfirmasi/kirim, serta kesesuaian SKU dan tanggal pembelian dari
sampel. Kegagalan salah satu pemeriksaan membatalkan seed. `--seed` yang sama
dan `--as-of` yang sama menghasilkan riwayat bisnis yang sama; ID database dan
password acak tidak dijamin sama. Jam simulasi hanya berlaku di proses command
dan tidak mengubah jam server web.

## Hasil verifikasi 6 November 2026

- 8 tes reseed lulus pada SQLite dan pada PostgreSQL 15 lokal terpisah, termasuk
  penggantian seed lama dengan semua skenario opsional, password tetap,
  rollback ketika gagal, backup tidak tertimpa, dan pemulihan ke database baru.
- Semua query ketidaksesuaian SQL mengembalikan nol baris pada dataset lokal.
- Pemeriksaan Django dan pemeriksaan perubahan skema lulus; tidak ada migrasi baru.
- Pemeriksaan TypeScript/build produksi lulus. 21 tes frontend lulus setelah
  bundle dibangun. 16 kombinasi halaman/peran merespons HTTP 200 dengan data baru.
- Suite aplikasi yang lebih luas masih memiliki dua tes lama di
  `crm.tests.test_reorder` yang memakai tanggal tetap 11 Oktober 2026 dan mencoba
  membuat PO bertanggal 21 Oktober; validasi aplikasi menolak tanggal lampau
  ketika dijalankan 6 November. Source dan tes lama itu tidak diubah oleh paket ini.
- Belum dijalankan pada Render milik pemilik proyek; akses hosting dikelola teman
  pengguna. Paket ini tidak memuat database, password, atau connection string.
