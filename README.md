# Arbain OneFlow

MVP lokal untuk tantangan ARB-02 UMS: profil pelanggan, aktivitas sales, pesanan, reservasi stok, pengiriman, dan pusat tindakan dalam satu aplikasi. Data demo sepenuhnya sintetis. Produk, nama pelanggan, dan alamat contoh tidak mewakili data CV Arbain.

**Mulai dari file ini.** Backend memakai Python 3.12 dan Django. Frontend memakai React 19, TypeScript, Vite 8, serta komponen dan template resmi Astryx 0.7 (theme Neutral). Node.js 22.12+ diperlukan untuk membangun frontend. Paket, ikon, dan font Figtree dibundel lokal; sesudah instalasi dan build, demo dapat berjalan tanpa CDN atau layanan eksternal.

## Jalankan di Windows

Ekstrak paket, buka PowerShell atau Command Prompt di folder yang berisi `manage.py`, lalu jalankan:

```powershell
npm ci
npm run build
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.lock
.venv\Scripts\python.exe manage.py migrate
.venv\Scripts\python.exe manage.py seed_demo --show-demo-credentials
.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

Buka http://127.0.0.1:8000/. Tidak perlu mengaktifkan virtualenv atau mengubah execution policy PowerShell.

`seed_demo` memakai tanggal hari ini dalam WIB. Simpan empat password acak yang tampil saat seed, khusus untuk latihan lokal Anda. Password acak dari seed tidak disimpan dalam source atau laporan. Mode penilaian opsional di bawah memakai kredensial demo publik yang disediakan tim. Jika lupa, atur ulang akun dengan `.venv\Scripts\python.exe manage.py changepassword nadia`; ulangi untuk akun yang diperlukan. Seed tidak dapat dipakai untuk mengambil ulang password.

| Akun | Peran | Pekerjaan |
|---|---|---|
| nadia | Sales A | Pelanggan CUS001–CUS006, aktivitas, draft/konfirmasi |
| rafi | Sales B | Pelanggan CUS007–CUS012, aktivitas, draft/konfirmasi |
| gudang | Gudang | Barang masuk, hitung fisik, pengiriman/pembatalan pesanan dikonfirmasi |
| manajer | Manajer | Seluruh data operasional, owner pelanggan baru, target bulanan |

Semua password berbeda. Seed menolak database bisnis yang sudah terisi; tidak menghapus atau menimpa data.

## Jalankan di Linux/macOS

```bash
npm ci
npm run build
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_demo --show-demo-credentials
.venv/bin/python manage.py runserver 127.0.0.1:8000
```

## Pengembangan frontend

Jalankan Django seperti biasa, lalu `npm run dev` di terminal kedua. Perintah ini membangun ulang bundle saat file React berubah; muat ulang browser setelah build selesai. Django menyajikan frontend dan backend dari origin yang sama di `http://127.0.0.1:8000/`.

- `npm run check`: pemeriksaan TypeScript dan build produksi.
- `npm run test:frontend`: tes alur wizard, navigasi, kuantitas, motion, dan panduan.
- `npm run format`: format source frontend.
- `frontend/templates/`: template Astryx yang sudah diadaptasi untuk seluruh screen.
- `frontend/Walkthrough.tsx` dan `frontend/tourSteps.ts`: panduan interaktif dari sidebar. Undangan muncul pada kunjungan pertama ke dashboard; status pernah dilihat disimpan per akun/peran di browser ini. Jalur gudang tidak membuka CRM. Langkah tindakan menunggu klik pada elemen asli dan respons halaman. Setelah detail terbuka, langkah overview menyorot area konten dan menunggu tombol Lanjut. Tombol Kembali pada overview memulihkan langkah beserta URL/tab asal yang telah dikunjungi; panduan tidak mengirim transaksi. Esc atau tombol tutup mengakhiri panduan, dan menu Panduan aplikasi dapat mengulangnya dari halaman baca.
- `crm/frontend.py`: serializer data halaman dan formulir; semua POST tetap memakai view, CSRF, form, akses peran, dan layanan transaksi Django.
- `crm/static/crm/react/`: hasil build ber-hash beserta manifest Vite (tidak masuk Git). Jalankan build sebelum packaging atau `collectstatic`.

Navigasi internal memakai respons JSON dari URL Django yang sama. Refresh, direct link, login, dan tombol Back tetap didukung. Error validasi mempertahankan input, formulir yang belum disimpan memberi konfirmasi sebelum berpindah, dan operasi stok tetap idempoten. Template HTML lama dipertahankan sebagai fallback tanpa JavaScript; tanpa hasil build, Django menampilkan fallback tersebut.

## Akses penilaian dan fitur operasional baru

Halaman masuk menyediakan **Akses demo untuk juri** saat `ONEFLOW_DEMO=1` dan kredensial demo cocok dengan akun aktif. Pilih peran, lihat atau salin username/sandi, lalu gunakan akun untuk mengisi formulir masuk. Autentikasi tetap melalui Django; tidak ada login otomatis atau pengubahan sandi saat halaman dibuka. Akun staff/superuser tidak ditawarkan.

Untuk database **simulasi** yang sudah berisi empat akun demo, pengaturan berikut secara eksplisit mengganti sandinya dengan kredensial publik penilaian dari tim:

```bash
ONEFLOW_DEMO=1 .venv/bin/python manage.py configure_judging_accounts --confirm-demo-reset
```

Di Windows, gunakan `.venv\Scripts\python.exe` sebagai pengganti `.venv/bin/python`. Jangan menjalankan pengaturan akun juri pada database operasional. `ONEFLOW_DEMO=0` menghilangkan akses juri. Instalasi demo lain dapat menggunakan `ONEFLOW_DEMO_ACCOUNTS` berupa JSON array dengan `username`, `password`, `name`, `role`, dan `description`; akun hanya ditampilkan jika sandinya cocok.

Untuk mencoba semua skenario pada **database baru yang kosong**, jalankan seed dengan `--fefo-demo --samples-demo --supply-demo --reorder-demo`. Jangan seed ulang database yang sudah berisi data.

- **Produk & stok → Pengadaan:** urutan risiko, stok layak, pengadaan berjalan, saran tambahan, dan akses ke perhitungan setiap produk. Hanya manajer/gudang.
- **Detail produk:** tab Batch & kedaluwarsa, Pengadaan, Riwayat mutasi, dan Reservasi. Stok bebas tetap dibedakan dari kelayakan kirim per batch.
- **Pengajuan sampel:** status pengajuan, pencarian pelanggan/nomor, filter lanjutan, dan tindakan sesuai peran. Detail memisahkan produk, bukti riwayat pelanggan, serta jejak proses. Keputusan manajer ditampilkan terpisah dari rekomendasi sistem.
- **Detail pelanggan:** perkiraan pembelian ulang menyertakan dasar perhitungan yang bisa dibuka, stok bebas, dan tindakan penjadwalan. Stok kurang tidak menyembunyikan pengingat.
- **Dashboard:** pintasan tugas sampel dan kebutuhan pengadaan sesuai peran, selain aktivitas dan pesanan. Panduan aplikasi mencakup halaman sampel dan penjelasan setelah navigasi.
- Kesalahan validasi pengadaan/sampel membuka kembali dialog dengan isian yang sama. URL kembali ke halaman detail yang dapat di-refresh.

Riset desktop melalui Mobbin: [Shopify inventory](https://mobbin.com/screens/d9deb551-88bf-4c93-91b3-43ef6659ccef) untuk pemisahan saldo stok; [Shopify purchase orders](https://mobbin.com/flows/bdbc79e6-cbf8-45a8-b3a6-86ae24bf1827) untuk alur pencatatan sampai penerimaan; [Airwallex approvals](https://mobbin.com/screens/68f1a7f7-0e87-49a9-a9a9-6ec913167bf0) untuk bukti dan alasan keputusan; [Calendly contact activity](https://mobbin.com/screens/8158ffb0-f197-4691-8149-271f7a1ab997) untuk riwayat yang terhubung ke tindakan berikutnya. Implementasi mempertahankan frame `table-page`, `detail-page`, `form-two-column`, `login-split`, serta komponen asli Astryx; aturan bisnis tetap dari Django.

## Alur kerja

- **Dashboard:** prioritas tindak lanjut, rekomendasi pembelian ulang, hasil tindakan, ringkasan sesuai peran.
- **Pelanggan:** profil, riwayat pesanan, tahap prospek, jadwal, catatan, dan hasil interaksi.
- **Pesanan:** draft → dikonfirmasi → terkirim, atau dibatalkan sebelum kirim.
- **Stok:** jumlah fisik tercatat, reservasi, tersedia, batas minimum, mutasi dan koreksi dengan alasan. Sales mendapat saldo tersedia; gudang/manajer mengubah stok.

## Edit produk dan harga

Masuk sebagai **manajer** atau **gudang**, buka **Produk & stok**, lalu klik **Edit** pada baris produk. Anda dapat mengubah nama, harga jual per satuan, batas minimum stok, dan status aktif. Panel konteks menampilkan identitas produk, saldo, dan harga yang tersimpan.

Masukkan harga dalam angka rupiah tanpa pemisah ribuan, misalnya `75000`. Harga dan batas minimum harus bilangan bulat nonnegatif. SKU dan satuan dikunci agar arti jumlah stok serta riwayat transaksi konsisten. Sales dapat membaca katalog dan ketersediaan; akses edit dibatasi oleh server.

Harga baru dipakai saat membuat **draft baru**. Draft/pesanan yang sudah tersimpan tetap memakai harga ketika dibuat. Contoh: pesanan 8 botol pada Rp50.000 tetap Rp400.000 meskipun harga katalog menjadi Rp55.000; draft baru 8 botol menjadi Rp440.000. Mengedit produk tidak membuat mutasi stok atau mengubah reservasi.

Tampilan desktop menggunakan sidebar Astryx, tabel untuk data operasional, panel konteks pada detail, serta dialog konfirmasi. Theme Neutral mengikuti mode terang/gelap sistem. Halaman menggunakan template resmi `shell-side-nav`, `dashboard-scorecard`, `table-page`, `detail-page`, `form-two-column`, dan `login`, dengan konten demo template diganti data Django. Browser desktop diuji secara lokal; Windows belum diuji langsung.

**Memperbarui instalasi sebelumnya:** hentikan server, backup folder `runtime`, lalu salin source dari ZIP terbaru ke folder aplikasi yang sama. Pertahankan `runtime` dan `.venv` milik instalasi Anda. Jalankan `npm ci`, `npm run build`, dan `python manage.py migrate` memakai Python virtualenv Anda sebelum menyalakan server kembali. Pembaruan ini menyertakan migrasi `0006_activity_history_links`; tidak perlu menjalankan seed ulang pada database yang sudah terisi.

Harga pesanan berasal dari katalog server dan disimpan sebagai snapshot. Semua jumlah memakai satu satuan per SKU. Draft tidak mengubah saldo. Konfirmasi menambah reservasi. Pengiriman penuh mengurangi fisik dan reservasi. Pembatalan melepas reservasi satu kali. Koreksi fisik di bawah reservasi menampilkan konflik dan memblokir konfirmasi baru SKU tersebut.

Sales hanya membuka pelanggan dan pesanan dalam cakupannya. Kontak pelanggan untuk gudang tersedia melalui pesanan dikonfirmasi/terkirim. Peran berasal dari Group akun, dengan tepat satu `SALES`, `WAREHOUSE`, atau `MANAGER`; nilai peran dari form tidak dipakai.

**Skenario unggulan:** dua sales masing-masing memesan 8 unit MADU01 dari stok 10. Pesanan pertama mereservasi 8; pesanan kedua ditolak. Gudang mengirim yang pertama dan mencatat 10 barang masuk. Tersedia berubah 10 → 2 → 2 → 12. Langkah presentasi ada di [docs/demo.md](docs/demo.md).

## Arti rekomendasi dan metrik

Tindak lanjut berasal dari aktivitas belum selesai yang telah jatuh tempo. Pembelian ulang memerlukan sedikitnya tiga tanggal pembelian berbeda; pembelian pada hari sama digabung, interval dihitung dari enam tanggal terakhir, dan jumlah indikatif dari tiga jumlah harian terakhir. Median interval dibulatkan half-up.

Prioritas = pembulatan 100 × (0,8 × urgensi + 0,2 × nilai relatif pelanggan). Urgensi dibatasi tujuh hari; nilai relatif memakai barang terkirim selama 90 hari inklusif dalam kelompok pengguna. Ini skor urutan kerja berbasis aturan, **bukan probabilitas membeli atau model ML terlatih**. Stok setelah reservasi menentukan kesiapan penawaran. Pesanan dikonfirmasi yang belum dikirim menghilangkan kandidat pembelian ulang yang sama.

Satu tindakan per pelanggan; tindak lanjut eksplisit didahulukan. Tampilkan lima teratas atau buka daftar lengkap. Selesai memerlukan hasil interaksi atau pesanan terkait; tunda memerlukan tanggal setelah hari ini; tolak memerlukan alasan. Pemicu yang selesai tidak muncul kembali tanpa kejadian baru.

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

### Wizard buat pesanan

`/orders/new/` memakai template asli Astryx `form-wizard`: Pelanggan → Produk & jumlah → Tinjau pesanan. Progres dan navigasi tetap terlihat saat isi tahap di-scroll. Kembali/ubah tahap mempertahankan isian; payload seluruh tahap dikirim ke formset Django hanya saat **Simpan draft**. Rekomendasi tetap mengisi pelanggan/produk awal, harga ditetapkan server, dan stok baru direservasi setelah konfirmasi.

Jalankan `npm run test:wizard` untuk validasi, perhitungan bilangan besar, payload antar-tahap, penghapusan baris, serta pemulihan error server.


### Penyempurnaan desktop setelah audit

- Dashboard menampilkan ringkasan dan capaian bulanan di atas antrean kerja. `TabList` Astryx memisahkan aktivitas, rekomendasi, dan pengiriman; tautan seluruh rekomendasi mempertahankan tab serta cakupan sales.
- Form tunggal memakai area baca terpusat dan footer tindakan tetap. Penyelesaian aktivitas menampilkan pelanggan, jadwal, sales, dan catatan sebelumnya dari kontrak Django yang tetap dibatasi hak akses.
- Dialog menjaga isian ketika pengguna membatalkan penutupan; membuang isian menghapus status perubahan yang belum disimpan. Navigasi, browser back, dan keluar akun juga melindungi perubahan.
- Detail pesanan membedakan stok bebas untuk draft dengan jumlah yang dialokasikan pada pesanan dikonfirmasi. Riwayat terkirim tidak menampilkan stok katalog saat ini sebagai data pesanan lama.
- Tabel memakai kepadatan balanced, pengurutan Astryx dengan perbandingan integer presisi, filter sales untuk manajer, dan reset hasil pencarian kosong. Target memakai pemilih bulan/tahun; label komponen utama dilokalkan ke Indonesia.

Referensi pola interaksi: [Attio — detail record](https://mobbin.com/screens/297adfeb-8312-496b-8acf-41839a6cf775), [HubSpot — dashboard pekerjaan](https://mobbin.com/screens/976d47f8-7030-4e19-b6cd-253e26d05908), [Shopify — fulfillment](https://mobbin.com/screens/922543bc-0a8b-4529-a06d-72ec5a201f3a), dan [Shopify — pembatalan pesanan](https://mobbin.com/flows/5679e76d-3f78-430b-bed9-803e3aa6afaa). Implementasi visual tetap memakai komponen asli Astryx dan frame template yang sudah ada.


### Redesign dashboard desktop

Dashboard mengadaptasi template asli Astryx 0.7 `dashboard` dan `dashboard-scorecard`: KPI ringkas, grafik nilai barang terkirim, progress target bulanan, perhatian persediaan, dan antrean maksimal lima baris dengan akses ke seluruh data. Grafik memakai Recharts seperti template asli, dimuat terpisah saat diperlukan. Komponen dan token visual tetap dari Astryx.

- Manajer dapat memilih seluruh tim atau satu sales; KPI, grafik, aktivitas, rekomendasi, dan pengiriman mengikuti cakupan tersebut. Persediaan diberi label **seluruh gudang** karena stok digunakan bersama. Sales melihat data miliknya. Gudang melihat pengiriman, stok menipis, dan konflik reservasi.
- Grafik 7 hari / 30 hari / bulan berjalan dihitung dari `Order.shipped_at` dalam WIB dan hanya status SHIPPED. Hari tanpa pengiriman bernilai nol. Pilihan periode hanya mengubah grafik, bukan antrean atau target bulan ini. Tabel data harian dan tooltip menyimpan nominal integer presisi; konversi angka hanya untuk koordinat grafik.
- Target yang belum diatur dibedakan dari target Rp 0. Capaian gabungan tidak dihitung ketika target tim belum lengkap. Tidak ada persentase pertumbuhan atau grafik aktivitas selesai yang dibuat tanpa data pendukung.
- KPI nilai terkirim membuka daftar pesanan pada tanggal pengiriman dan sales yang sama. Antrean aktivitas diurutkan dari jadwal terawal, dapat difilter terlambat / hari ini / mendatang dan tanpa jadwal. Semua endpoint tulis Django tetap digunakan.
- Footer dialog konfirmasi perubahan memakai identitas terpisah agar **Lanjut mengisi** tidak berubah menjadi tombol submit saat render berganti.

Referensi riset dashboard: [HubSpot Sales Home](https://mobbin.com/screens/91ad0652-0bcd-4bfe-b1bf-c421c8d50642), [Shopify Home](https://mobbin.com/screens/6d8dfdf6-e1ab-42be-bf96-491d3ecaf0be), [Astryx dashboard](https://astryx.atmeta.com/templates?preview=dashboard), dan [Astryx scorecard](https://astryx.atmeta.com/templates?preview=dashboard-scorecard).

Verifikasi: 117 tes Django dan 5 tes wizard lolos, typecheck/build lolos, serta browser desktop 1280×800 dan 1440×1000 untuk manajer, sales, dan gudang. QA browser menggunakan salinan SQLite terpisah. Bundle utama masih menghasilkan peringatan ukuran Vite; grafik sudah dipisahkan dengan lazy loading.

### Redesign workspace pelanggan desktop

Halaman pelanggan mengadaptasi `table-page`, `detail-page`, dan frame `form-two-column` Astryx 0.7.0 dengan komponen asli `Table`, `TabList`, `Selector`, `List`, `DateInput`, serta layout dan tipografi Astryx.

- Pencarian nama/kode/telepon, sales (manajer), status aktif, prioritas aktivitas, dan urutan tabel diproses Django dan tersimpan di URL. Pilihan sales berasal dari seluruh cakupan pelanggan yang diizinkan, sehingga tidak menghilang ketika hasil pencarian kosong.
- Ringkasan per pelanggan menampilkan aktivitas terbuka terawal dan tahap pada catatan terakhir. Filter Terlambat/Hari ini menghitung **pelanggan** yang punya aktivitas sesuai kondisi; aktivitas tanpa tanggal tidak dianggap terlambat. Data ini dibaca dari aktivitas Django, tanpa angka simulasi di frontend.
- Detail memisahkan aktivitas terbuka dan riwayat aktivitas selesai, menyediakan panel kontak yang dapat disembunyikan serta tab pesanan. Catatan lama tanpa `completed_at` memakai waktu pencatatan dengan keterangan yang sesuai; interaksi baru menyimpan waktu penyelesaian.
- Konteks pencarian/filter/urutan diteruskan melalui detail dan formulir pelanggan/aktivitas. Tautan kembali dan browser Back memulihkan posisi scroll daftar dalam sesi navigasi React. `return_to` hanya menerima URL daftar pelanggan lokal.
- Form aktivitas membedakan penjadwalan dan interaksi selesai, menampilkan tanggal sesuai jenis aktivitas, serta menjelaskan pembuatan tindak lanjut. Form pelanggan mengelompokkan identitas, kontak, dan pengelolaan; validasi serta aturan akses Django tetap berlaku.

Referensi: [Astryx table-page](https://astryx.atmeta.com/templates?preview=table-page), [Astryx detail-page](https://astryx.atmeta.com/templates?preview=detail-page), [Attio company list](https://mobbin.com/screens/83198786-3600-4684-bf04-7f20a97bc407), dan [HubSpot contact overview](https://mobbin.com/screens/f215a882-8c79-4bf8-8483-4d8ae465c3c1).

Verifikasi: 122 tes Django dan 5 tes wizard lulus; typecheck/build lulus. QA desktop 1280×800 dan 1440×1000 menggunakan salinan SQLite, termasuk kombinasi sales+pencarian, hasil kosong, sorting, kembali beserta scroll, form pelanggan, validasi jadwal, pencatatan hasil, tab pesanan dan prefill wizard. Data bisnis utama tidak dipakai untuk transaksi QA. Peringatan ukuran bundle Vite yang sudah ada masih berlaku.

### Redesign workspace pesanan desktop

Daftar dan detail mengadaptasi frame asli Astryx 0.7.0 `table-page` dan `detail-page`; pembuatan pesanan tetap menggunakan `form-wizard`. Komponen `Table`, `TabList`, `Selector`, `DateInput`, `StatusToken`, `List`, dan dialog memakai Astryx.

- Pencarian nomor/nama pelanggan, filter sales, status, periode pengiriman, serta sorting diproses Django dan tersimpan di URL. Reset juga tersedia ketika hanya sales yang dipilih. Tab menampilkan jumlah sesuai cakupan pencarian/sales; gudang hanya melihat status yang diizinkan. Periode hanya berlaku pada tab Terkirim, berdasarkan tanggal pengiriman WIB, dengan pesan jika rentangnya tidak valid.
- Detail dan wizard membawa konteks daftar. Kembali memulihkan filter, urutan, dan posisi scroll dalam sesi React. URL kembali dibatasi ke `/orders/` lokal. Respons tindakan yang gagal memakai URL detail yang aman untuk dimuat ulang.
- Detail menampilkan status, tindakan sesuai peran, rincian produk, satu total, riwayat waktu/pelaku dari Django, dan panel kontak yang dapat disembunyikan. Kekurangan stok dijelaskan dengan jumlah diminta/tersedia/kurang; pengecekan awal tidak menggantikan validasi transaksi server. Tombol **Tandai terkirim** menjelaskan bahwa tindakan mencatat penyerahan barang serta mengurangi stok fisik dan reservasi.
- Wizard menampilkan konteks kontak pelanggan serta kekurangan stok per produk. Draft tetap boleh disimpan saat stok kurang. Konfirmasi/pengiriman/pembatalan tetap melalui form dan layanan Django yang sama; fitur edit draft tersimpan belum ditambahkan.

Referensi: [Astryx table-page](https://astryx.atmeta.com/templates?preview=table-page), [Astryx detail-page](https://astryx.atmeta.com/templates?preview=detail-page), [Shopify order list](https://mobbin.com/screens/b743aa06-5d21-485f-8d69-d5f0052727c5), [Shopify order detail](https://mobbin.com/screens/8e5c7efc-0781-43c4-bbc8-f490455dd1a1), dan [Stripe transactions](https://mobbin.com/screens/7337ff38-d92a-48f6-9d45-60b8506bd4b6).

Verifikasi: 130 tes Django dan 5 tes wizard lulus; typecheck/build lulus. QA browser desktop 1280×800 dan 1440×1000 mencakup manajer, sales, gudang, filter gabungan, tanggal pengiriman, reset, sorting, kembali beserta scroll, penyimpanan draft saat stok kurang, pembatalan dengan penjagaan isian, konflik stok saat konfirmasi, pemulihan stok, dan pencatatan pengiriman. Semua transaksi QA memakai salinan SQLite terpisah. Peringatan ukuran bundle utama Vite yang sudah ada masih berlaku.

### Redesign Produk & stok desktop

Workspace memakai frame asli Astryx `table-page`, `detail-page`, dan form dengan footer tetap; `Table`, `TabList`, `Selector`, `DateInput`, `Pagination`, `DropdownMenu`, serta status menggunakan komponen Astryx. Tampilan berisi data Django, tanpa saldo atau riwayat buatan di frontend.

- Pencarian nama/SKU, status aktif, kondisi stok, dan pengurutan diproses Django dan tersimpan di URL. Detail serta form membawa `return_to` yang dibatasi ke daftar stok atau detail produk terkait. Kembali dari form/detail memulihkan filter, urutan, dan scroll daftar dalam sesi React.
- Kondisi stok terpisah dari status aktif: **Cukup**, **Menipis**, **Stok bebas habis** (tersedia nol, termasuk minimum nol), dan **Konflik stok** (tersedia negatif, termasuk produk nonaktif). Minimum tampil di baris produk. Filter **Di bawah minimum** tetap kompatibel dengan tautan Dashboard: produk aktif yang tersedia di bawah minimum, termasuk habis/konflik.
- Produk dan riwayat dipisahkan menjadi tab. Riwayat difilter per produk, jenis, rentang tanggal WIB; pagination server 20 baris mengakses seluruh riwayat, tidak terbatas 30 terbaru. Detail menampilkan riwayat produk serta pesanan dikonfirmasi yang mereservasi stok, dengan tautan ke pesanan. Sales hanya menerima stok tersedia, tanpa saldo fisik/reservasi, riwayat gudang, atau tindakan mutasi.
- Form produk mengelompokkan identitas, harga/persediaan, dan status. Saldo awal nol dijelaskan sebelum membuat produk. Pratinjau harga hanya muncul saat berubah. Form barang masuk/koreksi memisahkan fisik, reservasi, tersedia, serta tabel sebelum/perubahan/sesudah lengkap dengan satuan. Koreksi di bawah reservasi tetap boleh dicatat dengan peringatan; layanan transaksi dan idempotensi lama tetap berlaku.

Referensi audit: [Astryx table-page](https://astryx.atmeta.com/templates?preview=table-page), [Astryx detail-page](https://astryx.atmeta.com/templates?preview=detail-page), [Shopify inventory di Mobbin](https://mobbin.com/screens/d9deb551-88bf-4c93-91b3-43ef6659ccef), [flow inventori Shopify](https://mobbin.com/flows/6f31b520-0460-4338-962d-0805d862e1c5), dan [Square item library](https://mobbin.com/screens/78f2c018-e2c9-440c-8b5c-e631b2539163). Model stok OneFlow tetap tersedia = fisik − reservasi.

Verifikasi otomatis: 139 tes Django dan 5 tes wizard lulus; typecheck/build lulus. QA browser memakai salinan SQLite terpisah pada desktop 1280×800 dan 1440×1000: pencarian, kondisi stok, urutan, kembali dari form, barang masuk, koreksi negatif, reservasi pesanan, edit/tambah produk, penjagaan isian, filter produk/tanggal riwayat, pagination, serta akses manajer/sales/gudang. Transaksi QA tidak memakai database bisnis utama. Peringatan ukuran bundle utama Vite yang sudah ada masih berlaku.

### Perbaikan audit desktop lintas flow (14 Oktober 2026)

- Kondisi stok dan hitungan filter tidak lagi bergantung pada status aktif produk. Filter **Di bawah minimum** mencakup stok kosong/konflik jika nilainya di bawah minimum; shortcut Dashboard secara eksplisit memakai `status=active` agar sesuai angka operasionalnya. Filter, urutan, dan halaman tiap tab stok dipertahankan terpisah.
- Error rekomendasi/target tetap berada di dialog Astryx pada URL Dashboard yang bisa dimuat ulang. Field wajib kondisional, pesan per field, pilihan pesanan pelanggan, nilai target tersimpan, dan perlindungan isian tetap tersedia. Membuka pelanggan lain tidak membawa error/isian dialog sebelumnya.
- Return URL antar-workspace divalidasi dengan allowlist GET-only, batas panjang/kedalaman, dan penolakan URL eksternal. Tab pelanggan, antrean/periode Dashboard, filter daftar, serta posisi scroll dipertahankan saat kembali. Batal wizard kembali ke halaman pemulanya.
- Detail pesanan menampilkan kekurangan fisik/reservasi dan akses produk terkait untuk pemulihan stok; angka stok privat tetap hanya untuk manajer/gudang. Label status **Menunggu pengiriman** konsisten. Detail pelanggan, pesanan, dan produk memakai inset Astryx yang sama.
- Draft tersimpan dapat diedit melalui wizard Astryx. Nomor pesanan tetap, harga produk lama dipertahankan, produk baru memakai harga terkini, dan perubahan tidak mereservasi stok. Django memeriksa role, kepemilikan, status draft, versi data, duplikasi produk, dan batas integer dalam transaksi atomik. Draft yang telah berubah tidak dapat ditimpa oleh isian lama.

Validasi: 149 tes Django, 7 tes frontend (wizard dan navigasi), TypeScript, dan build Vite lulus. Browser QA memakai salinan SQLite terpisah pada port 8001: desktop 1280×800 dan 1440×1000; error/pemulihan dialog, target prefill, filter nonaktif+minimum, lintas tab stok, pelanggan→pesanan→kembali, buat→edit→konfirmasi→kirim, serta gudang→barang masuk→kembali ke pesanan diperiksa. Data utama port 8000 tidak dipakai untuk transaksi pengujian. Peringatan ukuran bundle Vite yang sudah ada masih berlaku.


### Dashboard per peran dan keputusan aktivitas (14 Oktober 2026)

Dashboard sales menempatkan grafik capaian pribadi di bagian atas, lalu antrean aktivitas terlambat dan hari ini. Filter semua/mendatang tetap tersedia. Dashboard manajer membuka rincian capaian per sales, termasuk jumlah aktivitas terlambat dan pesanan menunggu pengiriman dengan tautan ke cakupan yang sesuai. Dashboard gudang menampilkan antrean pengiriman dan maksimal lima produk perlu perhatian: konflik reservasi lebih dulu (termasuk produk nonaktif), lalu produk aktif di bawah minimum. Grafik sales memakai 30 hari sebagai periode awal; manajer memakai bulan ini. KPI target tetap memakai bulan berjalan.

Keputusan rekomendasi menggunakan label Sudah ditindaklanjuti / Ingatkan rekomendasi nanti / Tutup rekomendasi ini, penjelasan dampak, field yang relevan, dan pesan sukses spesifik. Menunda atau menutup rekomendasi tidak mengubah jadwal maupun status aktivitas. Rekomendasi tindak lanjut juga menyediakan akses ke form penyelesaian aktivitas untuk mencatat hasil sekaligus membuat jadwal berikutnya. Tidak ada fitur penjadwalan ulang aktivitas baru pada perubahan ini. Django tetap memvalidasi dan menyimpan seluruh transaksi.

Verifikasi: 154 tes Django dan 9 tes frontend lulus; TypeScript dan build Vite lulus. Browser desktop 1280×800 serta 1440×900 diperiksa dengan database QA dan cookie session terpisah pada port 8002: filter per sales, error rekomendasi dan pergantian keputusan, penutupan rekomendasi tanpa menyelesaikan aktivitas, penyelesaian aktivitas dengan tindak lanjut baru dan kembali ke filter asal, serta pengiriman pesanan dan pembaruan antrean. Screenshot di `runtime/role-dashboard/`. Data utama tidak dipakai untuk transaksi pengujian. Peringatan bundle Vite lebih dari 500 kB masih ada; pengujian pengguna mitra belum dilakukan.

### Detail pelanggan terhubung (14 Oktober 2026)

Detail pelanggan tetap memakai kerangka Astryx detail-page, List, TabList, SegmentedControl, dan panel informasi. Ringkasan menampilkan hasil interaksi terakhir serta pesanan terbaru. Aktivitas berikutnya diurutkan menurut jadwal terawal, dengan tautan ke interaksi asal untuk tindak lanjut yang dibuat setelah pembaruan ini. Riwayat menggabungkan hasil aktivitas dengan kejadian draft/konfirmasi/pengiriman/pembatalan pesanan; tersedia filter jenis riwayat dan tab daftar pesanan. Filter, tab, pilihan panel informasi, dan konteks kembali dibawa ke form aktivitas maupun pesanan. Tautan pesanan terkait hanya ditampilkan bila ada hubungan eksplisit yang tersimpan dan pesanan tersebut berada dalam akses akun.

Migrasi `0006_activity_history_links` menambah `Activity.completed_at` dan `followup_of`, keduanya nullable. Waktu hasil disimpan dicatat pada penyelesaian aktivitas, pencatatan interaksi selesai, dan penyelesaian rekomendasi. Aktivitas berikutnya yang otomatis dibuat menyimpan hubungan ke aktivitas asal. Migrasi tidak mengarang waktu selesai atau hubungan historis. Catatan lama tetap menggunakan waktu pencatatan, disertai penjelasan bahwa waktu penyelesaian belum tersedia. Database utama telah dicadangkan sebelum migrasi di `runtime/customer-detail/before-migration.sqlite3` (diabaikan git).

Validasi: 161 tes Django, 9 tes frontend, TypeScript, dan build Vite. Browser QA pada database dan cookie terpisah memeriksa error hasil kosong, pencatatan hasil + tindak lanjut, tautan dua arah antara hasil dan aktivitas berikutnya, fokus keyboard, pelanggan → pesanan → kembali, serta pembatalan wizard dengan pelanggan terpilih. Desktop 1440×900 dan 1280×800 diperiksa. Data transaksi utama tidak dipakai untuk pengujian. Peringatan ukuran bundle Vite masih ada. Uji kegunaan dengan pengguna mitra belum dilakukan.
