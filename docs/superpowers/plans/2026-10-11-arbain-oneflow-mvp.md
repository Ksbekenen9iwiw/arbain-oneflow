# Arbain OneFlow MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun MVP CRM yang menghubungkan pelanggan, aktivitas sales, pesanan, stok, dan rekomendasi tindakan, dengan demo dua sales yang tidak dapat menjanjikan barang melebihi persediaan.

**Architecture:** Satu aplikasi Django dengan halaman yang dirender server, form HTML, session login, dan database relasional lokal. Logika transaksi berada dalam layanan orders/inventory; rekomendasi membaca kejadian sumber dan keputusan pengguna. SQLite memakai transaksi IMMEDIATE yang singkat untuk menserialisasi perubahan; setiap operasi tetap memeriksa akses, status, dan saldo di server.

**Tech Stack:** Python 3.12; Django seri 5.2 LTS; SQLite yang disertakan Python; Django templates, HTML/CSS, dan JavaScript hanya untuk bantuan form. Test runner Django/unittest, tanpa framework pengujian tambahan. Keputusan stack ini untuk ditinjau dalam rencana; belum ada aplikasi atau dependensi yang dipasang.

**Spec:** `docs/superpowers/specs/2026-10-11-arbain-oneflow-design.md`. Pelaksana membaca kedua dokumen. Rancangan dibawa bersama rencana dalam direktori `docs/superpowers/`.

## Global Constraints

- Satu organisasi dan satu gudang.
- Produk jadi dengan satu satuan per SKU, misalnya botol atau unit.
- Nilai rupiah disimpan sebagai bilangan bulat nonnegatif; jumlah barang sebagai bilangan bulat positif.
- Pengiriman dilakukan penuh untuk satu pesanan; pengiriman sebagian ditunda.
- Pesanan boleh dibatalkan sebelum pengiriman. Pesanan terkirim tidak dapat dibatalkan melalui operasi biasa; retur ditunda.
- Proses produksi, maklon, bahan baku, pajak, pembayaran, dan akuntansi tidak dibangun dalam MVP.
- UI responsif dapat dibuka pada telepon dan komputer; tidak memerlukan aplikasi seluler terpisah.
- Zona waktu operasional menggunakan WIB. Waktu kejadian disimpan dengan zona waktu yang jelas.
- Stok tersedia = stok fisik tercatat − reservasi aktif.
- Draft tidak mengubah saldo; konfirmasi menambah reservasi; pengiriman mengurangi fisik dan reservasi; pembatalan sebelum kirim melepas reservasi.
- Konflik akibat koreksi fisik di bawah reservasi harus terlihat dan memblokir konfirmasi baru pada SKU tersebut.
- Nilai pesanan terkirim bukan bukti pembayaran atau laba. Target nol/belum diisi ditampilkan tanpa persentase.
- Mesin inti berbasis aturan dan skor prioritas, bukan model ML tervalidasi; semua data contoh diberi penanda simulasi.
- Data rekomendasi memakai minimal tiga tanggal pembelian berbeda, maksimal enam tanggal terakhir, dan jumlah indikatif dari tiga pembelian terakhir.
- Prioritas: pembulatan 100 × (0,8 × U + 0,2 × V), dengan U = min(1, hari terlambat/7), V = nilai terkirim 90 hari pelanggan/nilai terbesar kelompok aktif, V = 0 jika penyebut nol.
- Tindak lanjut eksplisit diutamakan dalam pengelompokan per pelanggan. Lima kartu teratas mempunyai akses ke daftar lengkap.
- CSV dan draf AI opsional tidak termasuk syarat selesai MVP; hanya ditambahkan setelah seluruh tugas wajib lulus.
- Tidak ada pengiriman pesan, pembuatan akun layanan eksternal, atau publikasi otomatis.

## Review Focus

1. Pengguna memalsukan ID pelanggan/pesanan atau nama peran dalam POST: server membatasi data menurut session; uji pada Task 1, 2, 4, dan 6.
2. Tab lama, klik dua kali, serta dua sales mengonfirmasi bersamaan: saldo terbaru diperiksa dalam transaksi dan mutasi tidak ganda; uji pada Task 4.
3. Jumlah nol/negatif/pecahan, harga negatif, dan alasan koreksi kosong: tidak ada perubahan yang tersimpan; uji pada Task 2, 3, dan 4.
4. Beberapa pembelian pada tanggal yang sama, median interval pecahan, dan hari di batas WIB: hasil deterministik menggunakan tanggal lokal dan penggabungan harian; uji pada Task 5.
5. Catatan berisi HTML serta action key yang sudah selesai atau milik sales lain: teks ter-escape dan keputusan tidak duplikat/tidak bocor; uji pada Task 2 dan 6.

## Keputusan implementasi tambahan

- `TIME_ZONE='Asia/Jakarta'`, `USE_TZ=True`; tanggal rekomendasi diambil melalui `timezone.localdate()`.
- Dependensi awal `Django>=5.2.13,<5.3` dan `tzdata`; versi yang benar-benar terpasang dicatat dalam `requirements.lock` ketika implementasi dimulai. `tzdata` memastikan zona WIB tersedia pada Windows. Tidak mengasumsikan nomor patch terbaru dari cache pencarian.
- SQLite `OPTIONS={'transaction_mode':'IMMEDIATE','timeout':5}` dan `ATOMIC_REQUESTS=False`. Transaksi hanya membungkus operasi tulis singkat; rendering halaman dilakukan setelah commit.
- `select_for_update()` tidak dipakai sebagai jaminan pada SQLite karena tidak mengunci baris. SQLite mengunci transaksi tulis secara menyeluruh; tuliskan komentar `ponytail:` yang menyebut batas throughput dan migrasi PostgreSQL bila pilot memerlukan banyak penulis bersamaan.
- Test database menggunakan file terpisah `runtime/test_oneflow.sqlite3`, bukan file demo atau database in-memory. `ONEFLOW_TEST_DB` dapat menunjuk file test lain untuk evaluator yang terisolasi. Test konkurensi menggunakan `TransactionTestCase`, dua koneksi, dan `ThreadPoolExecutor`.
- `ONEFLOW_DB` dapat menunjuk file database berbeda. Default `runtime/oneflow.sqlite3`; seluruh `runtime/`, `.venv/`, credential demo, dan file database diabaikan git.
- `ONEFLOW_SECRET_KEY` dibaca dari environment; untuk localhost demo, kunci acak boleh dibuat di `runtime/secret_key.txt` yang diabaikan git. Tidak ada kunci tetap di source.
- Server lokal bind ke `127.0.0.1:8000`. Publikasi dan konfigurasi hosting bukan bagian tugas ini.
- Median interval dibulatkan half-up ke hari kalender penuh. Pembelian pada tanggal yang sama digabung sebelum mengambil enam tanggal terakhir. Median jumlah memakai tiga jumlah harian terakhir, sehingga selalu berupa bilangan bulat jika kandidat memenuhi syarat.
- Skor dibulatkan half-up, bukan banker's rounding. Skor seri diurutkan berdasarkan due date lebih awal, kemudian kode pelanggan dan SKU agar stabil.

## File map

Seluruh path relatif terhadap root proyek `oneflow-design/`. Saat ini hanya dokumen rancangan yang ada; path aplikasi di bawah merupakan rencana file baru.

| Path | Tanggung jawab |
|---|---|
| `manage.py`, `oneflow/settings.py`, `oneflow/urls.py`, `oneflow/wsgi.py` | Runtime, konfigurasi, routing, login bawaan Django |
| `requirements.txt`, `requirements.lock`, `.gitignore` | Dependensi terpasang dan pengecualian data lokal |
| `crm/apps.py`, `crm/models.py`, `crm/migrations/` | Model relasional dan constraint |
| `crm/access.py`, `crm/errors.py` | Peran, pembatasan objek, error bisnis yang eksplisit |
| `crm/forms.py`, `crm/views.py`, `crm/urls.py` | Validasi input HTTP dan halaman/form |
| `crm/services/inventory.py` | Barang masuk, koreksi, saldo, mutasi |
| `crm/services/orders.py` | Draft, konfirmasi, batal, kirim secara atomik |
| `crm/services/actions.py` | Kandidat, skor, pengelompokan, dan keputusan tindakan |
| `crm/selectors.py` | Data riwayat dan agregasi dashboard |
| `crm/templates/registration/login.html` | Form login |
| `crm/templates/crm/base.html`, `today.html`, `customers.html`, `customer_detail.html`, `orders.html`, `order_detail.html`, `stock.html`, `form.html` | Empat menu, detail, dan form bersama |
| `crm/static/crm/app.css`, `app.js` | Layout responsif dan bantuan baris pesanan |
| `crm/tests/factories.py`, `test_access.py`, `test_customers.py`, `test_inventory.py`, `test_orders.py`, `test_actions.py`, `test_dashboard.py`, `test_demo.py` | Pengujian perilaku yang bermakna |
| `crm/management/commands/seed_demo.py`, `evaluate_actions.py` | Data sintetis dan evaluasi tanpa memalsukan hasil |
| `crm/tests/data/action_cases.json` | Dua puluh kasus dengan expected output yang ditentukan sebelum eksekusi |
| `README.md`, `docs/demo.md`, `docs/usability_protocol.md` | Cara menjalankan di Windows, demo, dan protokol uji manusia |

File `__init__.py` yang dibutuhkan package dibuat bersama tugas pemiliknya. Tidak dibuat layer repository, REST API terpisah, message queue, chart library, atau framework frontend tambahan.

## Kontrak domain bersama

- Peran adalah satu Group aktif per pengguna: `SALES`, `WAREHOUSE`, atau `MANAGER`. Pengguna tanpa peran atau dengan beberapa peran bisnis ditolak hingga konfigurasi diperbaiki.
- `BusinessError(code: str, message: str)` dalam `crm/errors.py`; kode yang dipakai: `INVALID_INPUT`, `FORBIDDEN`, `INVALID_STATE`, `INSUFFICIENT_STOCK`, `PHYSICAL_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `ACTION_ALREADY_RESOLVED`, `BUSY`.
- Error bisnis ditampilkan sebagai pesan form dengan status 400/409 yang sesuai; akses ditolak 403; objek di luar cakupan pengguna 404. Error database yang tidak dikenal tidak disembunyikan sebagai kesalahan stok.
- Semua mutasi menggunakan pengguna dari session, bukan `actor_id` atau peran dari form. GET tidak mengubah data; POST memakai CSRF.

| Model | Field dan aturan yang menjadi kontrak |
|---|---|
| Customer | `code` unik, `name`, `phone`, `address`, `owner` FK User sales aktif, `is_active` |
| Product | `sku` unik, `name`, `unit`, `price_rupiah>=0`, `min_stock>=0`, `is_active` |
| InventoryBalance | `product` OneToOne, `on_hand>=0`, `reserved>=0`, `updated_at`; `available` adalah `on_hand-reserved`, bukan kolom independen |
| Activity | `customer`, `sales`, `kind` VISIT/INTERACTION/FOLLOWUP, `stage` NEW/CONTACTED/INTERESTED/WAITING/WON/LOST, `scheduled_date`, `followup_date`, `status` PLANNED/DONE, `note`, `result`, `created_at`; DONE wajib memiliki hasil |
| Order | `customer`, `sales`, `status` DRAFT/CONFIRMED/CANCELLED/SHIPPED, `total_rupiah`, `cancel_reason`, timestamp dan FK pelaksana confirm/cancel/ship |
| OrderLine | `order`, `product`, `quantity>=1`, `unit_price_rupiah>=0`; pasangan order/product unik; hanya dapat diubah saat DRAFT |
| StockMovement | `product`, `delta`, `kind` RECEIPT/ADJUSTMENT/SHIPMENT, `source_ref` unik, `order` nullable, `actor`, `reason`, `created_at`; tidak dapat diubah lewat UI |
| ActionDecision | `key` unik, `customer`, `product` nullable, `actor`, `outcome` DONE/SNOOZED/DISMISSED, `note`, `next_date` nullable, `order` nullable, `updated_at` |
| SalesTarget | `sales`, `month` tanggal pertama bulan, `target_rupiah>=0`; pasangan sales/month unik |

Tidak ada constraint `reserved<=on_hand` karena koreksi fisik bisa mengungkap konflik yang harus dicatat. Pada transaksi penjualan normal, saldo tersebut wajib memenuhi batas dan pengiriman selalu memeriksa kondisi fisik terbaru.

---

### Task 1: Runtime, login, dan pembatasan peran

**Files:** Create `manage.py`, `oneflow/`, `requirements.txt`, `requirements.lock`, `.gitignore`, `crm/apps.py`, `crm/access.py`, `crm/errors.py`, `crm/urls.py`, `crm/views.py`, `crm/tests/factories.py`, `crm/tests/test_access.py`, template login dan base.

**Interfaces:**
- Produces `role_of(actor: User) -> str`; `require_role(actor: User, allowed: set[str]) -> None`; `BusinessError`.
- Produces test factory `make_user(username: str, role: str) -> User` yang memakai password uji dan tepat satu Group.
- Routes: GET/POST `/login/`, POST `/logout/`, GET `/` bernama `today`; `LOGIN_REDIRECT_URL='/'`.
- HTTP handler `today(request: HttpRequest) -> HttpResponse`; login/logout memakai class bawaan Django. Semua handler HTTP pada tugas berikutnya mengembalikan HttpResponse; POST sukses memakai redirect setelah commit.

- [ ] **Step 1: Buat test akses yang gagal.** `test_anonymous_redirects_to_login`, `test_login_redirects_today`, `test_logout_requires_post`, `test_invalid_role_is_denied`. Assertion inti:
  ```python
  self.assertEqual(self.client.get('/').status_code, 302)
  self.assertEqual(self.client.get('/logout/').status_code, 405)
  with self.assertRaises(PermissionDenied):
      role_of(user_without_group)
  ```
- [ ] **Step 2: Buat project minimum dan pasang dependensi hanya untuk menjalankan test.** Buat virtualenv, `python -m pip install -r requirements.txt`; catat versi Django terpasang ke lock file. Jalankan `python manage.py test crm.tests.test_access -v 2`; hasil harus gagal karena perilaku peran/halaman belum ada, bukan berhenti karena package yang hilang.
- [ ] **Step 3: Implementasikan konfigurasi SQLite, autentikasi Django bawaan, dan fungsi peran.** POST logout, session, CSRF, escaped templates tetap aktif. Halaman Hari Ini awal hanya menampilkan nama/peran dan penanda simulasi ketika mode demo aktif.
- [ ] **Step 4: Verifikasi.** `python manage.py check` dan `python manage.py test crm.tests.test_access -v 2`; expected tidak ada error check dan semua test OK.
- [ ] **Step 5: Commit.** `git add manage.py oneflow crm requirements.txt requirements.lock .gitignore` lalu `git commit -m "feat: add local runtime and role-based login"`.

### Task 2: Pelanggan, produk, aktivitas, dan riwayat

**Files:** Create/modify `crm/models.py`, `crm/migrations/`, `crm/forms.py`, `crm/access.py`, `crm/selectors.py`, `crm/views.py`, `crm/urls.py`, template customers/customer_detail/form, `crm/tests/test_customers.py`, factories.

**Interfaces:**
- Consumes `role_of`, `require_role`, `BusinessError`.
- Produces model Customer/Product/InventoryBalance/Activity; `customers_for(actor: User) -> QuerySet[Customer]`; `customer_history(actor: User, customer_id: int) -> dict`.
- Produces `make_customer(owner: User, code: str='CUS001') -> Customer`, `make_product(sku: str='MADU01', on_hand: int=0, price_rupiah: int=50000) -> Product`; factory membuat balance. UI membuat produk dan balance nol dalam satu transaksi.
- Routes `/customers/`, `/customers/new/`, `/customers/<id>/`, `/customers/<id>/activities/new/`, `/activities/<id>/complete/`, `/products/new/`. Sales hanya mengakses pelanggan miliknya; manajer mengatur owner. Kontak gudang diakses melalui pesanan pemenuhan pada Task 4.
- Handler `customers(request)`, `customer_create(request)`, `customer_detail(request, customer_id: int)`, `activity_create(request, customer_id: int)`, `activity_complete(request, activity_id: int)`, `product_create(request)`. Forms: CustomerForm/ProductForm/ActivityForm dengan `actor` keyword untuk pilihan yang dibatasi.

- [ ] **Step 1: Tulis test gagal.** `test_sales_cannot_read_other_customer` menegaskan GET pelanggan sales lain = 404; `test_negative_price_and_duplicate_sku_are_rejected` menegaskan tidak ada produk baru; `test_done_activity_requires_result`; `test_customer_note_html_is_escaped` memakai catatan `<script>alert(1)</script>` dan memastikan HTML mentah tidak muncul pada respons.
- [ ] **Step 2: Jalankan** `python manage.py test crm.tests.test_customers -v 2`; expected gagal karena model/form/perilaku belum dibuat.
- [ ] **Step 3: Implementasikan model, migration, ModelForms yang dibatasi menurut actor, dan halaman profil.** Kode pelanggan/SKU unik, sales penanggung jawab harus pengguna SALES aktif. Log interaksi selesai wajib hasil; kunjungan terencana memiliki tanggal. Tombol selesai kunjungan mencatat hasil dan boleh membuat jadwal tindak lanjut baru. Profil menampilkan aktivitas dan daftar pesanan ketika Order tersedia pada Task 4.
- [ ] **Step 4: Verifikasi.** `python manage.py makemigrations crm`, `python manage.py migrate`, `python manage.py test crm.tests.test_access crm.tests.test_customers -v 2`; expected OK.
- [ ] **Step 5: Commit.** `git add crm` lalu `git commit -m "feat: add customer profiles and sales activities"`.

### Task 3: Saldo gudang, barang masuk, dan rekonsiliasi fisik

**Files:** Create `crm/services/inventory.py`, `crm/tests/test_inventory.py`, stock template; modify models/migrations/forms/views/urls.

**Interfaces:**
- Consumes Product/InventoryBalance, peran, dan `BusinessError`.
- Produces StockMovement; `receive_stock(actor: User, product_id: int, quantity: int, reason: str, operation_id: UUID) -> StockMovement`; `reconcile_stock(actor: User, product_id: int, counted_quantity: int, reason: str, operation_id: UUID) -> StockMovement`.
- Routes `/stock/`, `/stock/<id>/receive/`, `/stock/<id>/reconcile/`. Sales hanya melihat saldo tersedia; detail mutasi dan perubahan untuk WAREHOUSE/MANAGER.
- Handler `stock(request)`, `stock_receive(request, product_id: int)`, `stock_reconcile(request, product_id: int)`; Forms: StockReceiptForm/StockCountForm, termasuk UUID operation_id dan alasan.

- [ ] **Step 1: Tulis test gagal.** `test_receive_updates_balance_and_ledger` mengharapkan fisik 10 + masuk 10 = 20 dan satu mutasi +10; `test_sales_cannot_receive`; `test_invalid_quantity_or_empty_reason_has_no_effect`; `test_same_operation_has_one_movement`; `test_reconcile_below_reservation_records_conflict` dengan fisik 10/reservasi 8/hitung 5 mengharapkan fisik 5, reservasi 8, tersedia −3, dan alasan tercatat.
- [ ] **Step 2: Jalankan** `python manage.py test crm.tests.test_inventory -v 2`; expected gagal karena layanan belum ada.
- [ ] **Step 3: Implementasikan dua layanan dengan atomic transaction.** Quantity barang masuk integer positif; hitungan aktual integer nonnegatif; bool dan pecahan ditolak. ID operasi berupa UUID dari form. Pengulangan ID dengan payload sama mengembalikan mutasi yang ada; payload berbeda menghasilkan `IDEMPOTENCY_CONFLICT`. Koreksi menambahkan delta ke ledger, termasuk delta nol jika hitungan sama, tanpa menghapus sejarah.
- [ ] **Step 4: Verifikasi.** `python manage.py test crm.tests.test_inventory crm.tests.test_customers -v 2`; expected OK, sum(delta) = on_hand pada fixture yang dimulai dari nol.
- [ ] **Step 5: Commit.** `git add crm` lalu `git commit -m "feat: add stock receipts and physical reconciliation"`.

### Task 4: Pesanan dan transaksi reservasi/pengiriman

**Files:** Create `crm/services/orders.py`, `crm/tests/test_orders.py`, orders/order_detail templates; modify models/migrations/forms/views/urls/selectors/factories.

**Interfaces:**
- Consumes inventori/peran; produces Order/OrderLine.
- `create_draft(actor: User, customer_id: int, lines: list[dict]) -> Order`; setiap line tepat `{'product_id': int, 'quantity': int}`; harga disalin dari katalog server.
- `confirm_order(actor: User, order_id: int) -> Order`; `cancel_order(actor: User, order_id: int, reason: str) -> Order`; `ship_order(actor: User, order_id: int) -> Order`.
- Produces `make_order(sales: User, customer: Customer, product: Product, quantity: int=8) -> Order` sebagai draft melalui layanan.
- Routes `/orders/`, `/orders/new/`, `/orders/<id>/`, `/orders/<id>/confirm/`, `/orders/<id>/cancel/`, `/orders/<id>/ship/`. Confirm untuk sales pemilik/manajer; ship untuk gudang/manajer; cancel dengan alasan untuk sales pemilik/manajer pada DRAFT atau CONFIRMED, dan gudang hanya pada CONFIRMED. Gudang hanya mendapat kontak pelanggan pesanan CONFIRMED/SHIPPED.
- Handler `orders(request)`, `order_create(request)`, `order_detail(request, order_id: int)`, `order_confirm(request, order_id: int)`, `order_cancel(request, order_id: int)`, `order_ship(request, order_id: int)`. OrderForm membatasi pilihan customer; OrderLineFormSet menggunakan formset Django dengan prefix `lines`, minimal satu baris, dan field product/quantity. Harga dari browser tidak dipakai.

- [ ] **Step 1: Tulis test gagal untuk state dan saldo.** `test_draft_does_not_reserve`, `test_confirm_cancel_and_ship_balances`, `test_cancel_requires_reason`, `test_multi_sku_failure_rolls_back`, `test_double_ship_has_one_movement`, `test_stale_page_rechecks_stock`, `test_physical_conflict_blocks_new_confirmation`, `test_sales_cannot_forge_price_or_customer`. Assertion saldo utama:
  ```python
  self.assertEqual((balance.on_hand, balance.reserved, balance.available), (10, 8, 2))
  ship_order(warehouse, order.id)
  balance.refresh_from_db()
  self.assertEqual((balance.on_hand, balance.reserved, balance.available), (2, 0, 2))
  self.assertEqual(StockMovement.objects.filter(source_ref=f'SHIP:{order.id}:{product.id}').count(), 1)
  ```
- [ ] **Step 2: Tambahkan test konkurensi gagal** `OrderConcurrencyTests(TransactionTestCase).test_two_sales_cannot_reserve_sixteen_from_ten`. Dua draft masing-masing 8, dua koneksi/thread, start barrier sebelum memanggil layanan. Assert satu CONFIRMED dan satu DRAFT dengan `INSUFFICIENT_STOCK`, saldo fisik 10/reservasi 8; worker menutup koneksi pada finally. Jalankan `python manage.py test crm.tests.test_orders -v 2`; expected gagal karena layanan belum tersedia.
- [ ] **Step 3: Implementasikan layanan atomik.** Mulai transaksi sebelum membaca state/saldo; periksa actor; baca SKU menurut ID menaik; validasi seluruh line; simpan reservasi/status bersama. Fisik konflik memblokir confirm. Shipping juga memeriksa on_hand mencukupi, membuat source ref unik per order/SKU, serta timestamp/pelaksana. Pengulangan transisi yang sama mengembalikan keadaan tersimpan; transisi berbeda yang tidak sah menghasilkan `INVALID_STATE`. Draft hanya diedit sebelum confirm. Tangani timeout lock sebagai BUSY setelah rollback tanpa mengklaim berhasil; UI meminta pengguna mencoba kembali.
- [ ] **Step 4: Verifikasi.** Jalankan `python manage.py test crm.tests.test_orders crm.tests.test_inventory -v 2`, lalu ulangi test konkurensi tiga kali hanya untuk memastikan test tersebut stabil. Expected semua OK, tidak ada commit sebagian atau mutasi ganda. Query customer_history kini memasukkan pesanan sesuai cakupan actor.
- [ ] **Step 5: Commit.** `git add crm` lalu `git commit -m "feat: connect sales orders with atomic stock reservations"`.

### Task 5: Mesin kandidat, kelayakan stok, dan skor transparan

**Files:** Create `crm/services/actions.py`, `crm/tests/test_actions.py`, `crm/tests/data/action_cases.json`; modify selectors.

**Interfaces:**
- Consumes Activity, shipped Order/OrderLine, InventoryBalance, actor scope.
- Produces `Candidate` dataclass dengan `key`, `customer_id`, `product_id` nullable, `kind` FOLLOWUP/REORDER, `due_date`, `typical_quantity` nullable, `available_quantity` nullable, `priority`, `state` READY/WAITING_STOCK, `reasons: dict`.
- `priority_score(overdue_days: int, value_rupiah: int, max_value_rupiah: int, weights: tuple[float,float]=(0.8,0.2)) -> int`.
- `compute_candidates(actor: User, as_of: date) -> list[Candidate]` tanpa suppression keputusan; `list_actions(actor: User, as_of: date, limit: int|None=5) -> list[Candidate]` menerapkan keputusan setelah Task 6. SALES mendapat pelanggan sendiri, MANAGER seluruh pelanggan aktif, WAREHOUSE tidak mendapat kandidat kontak pelanggan dan memakai stock alerts dashboard.

- [ ] **Step 1: Tulis assertion skor dan interval yang gagal.** Assert `priority_score(7,100,100)==100`, `(7,0,0)==80`, `(0,100,100)==20`, `(3,50,100)==44`. Tiga pembelian tanggal 1 Januari, 30 Januari, 1 Maret 2026 menghasilkan interval dibulatkan 30 hari. Dua order terkirim pada hari yang sama dihitung satu tanggal dengan jumlah digabung. Riwayat dua tanggal tidak menghasilkan REORDER.
- [ ] **Step 2: Tetapkan 20 expected cases sebelum implementasi.** Isi JSON dengan ID C01–C20, input yang cukup merekonstruksi kejadian, serta expected `kind/state/typical_quantity/priority` atau `none`: followup hari ini, terlambat, masa depan, selesai; riwayat 0/1/2/3/lebih enam tanggal; tanggal sama; median pecahan; stok cukup/tidak cukup/habis; pending confirmed order; seluruh nilai pelanggan nol; SKU tidak aktif; pelanggan tidak aktif; timestamp batas WIB; skor seri. `ActionCaseEvaluationTests` membaca fixture, merekonstruksi tiap kasus secara terpisah dengan factories, dan membandingkan expected melalui `subTest`. Kelas ini juga mengumpulkan actual baseline A/B/OneFlow untuk seluruh kasus sebelum menulis laporan ketika `ONEFLOW_EVALUATION_OUTPUT` diisi. Jalankan `python manage.py test crm.tests.test_actions -v 2`; expected gagal karena fungsi belum ada.
- [ ] **Step 3: Implementasikan kandidat dan skor.** Gunakan median standard library dan pembulatan half-up yang eksplisit. Riwayat mencakup pesanan SHIPPED pada/before as_of; order masa depan tidak dipakai. Jendela nilai 90 hari inklusif adalah as_of−89 sampai as_of. Bandingkan jumlah indikatif dengan available setelah reservasi. Source key `FOLLOWUP:<activity_id>` atau `REORDER:<customer_id>:<product_id>:<last_shipped_local_date>`. Stage WON tidak dihitung sebagai hasil penjualan. Untuk display sales, kelompokkan satu kartu per pelanggan sesuai prioritas eksplisit dalam spec, kemudian sort stabil.
- [ ] **Step 4: Verifikasi** `python manage.py test crm.tests.test_actions crm.tests.test_orders -v 2`; expected seluruh cases sesuai expected, alasan merujuk tanggal/riwayat/saldo sumber. Simpan hasil hanya setelah test benar-benar dijalankan.
- [ ] **Step 5: Commit.** `git add crm` lalu `git commit -m "feat: rank follow-ups using customer history and available stock"`.

### Task 6: Action Center, hasil tindakan, dan tautan pekerjaan

**Files:** Modify models/migrations/services/actions.py/forms/views/urls; create today template; extend test_actions.py.

**Interfaces:**
- Consumes Candidate, `compute_candidates`, customer scope, Order.
- Produces ActionDecision; `record_action(actor: User, key: str, outcome: str, note: str, next_date: date|None=None, order_id: int|None=None, as_of: date|None=None) -> ActionDecision`.
- POST `/actions/decision/`; GET `/?all=1` menampilkan daftar lengkap. `list_actions` menghapus DONE/DISMISSED untuk pemicu yang sama dan menunda SNOOZED hingga next_date, lalu memperbarui stok terkini.
- Handler `action_decision(request)` dan ActionDecisionForm dengan key/outcome/note/next_date/order_id; akses dan relasi tetap diperiksa layanan.

- [ ] **Step 1: Tulis test gagal.** `test_done_requires_note_or_linked_order`; `test_snooze_requires_future_date`; `test_repeated_submission_does_not_duplicate_decision`; `test_forged_action_key_is_rejected`; `test_new_stock_changes_ready_state`; `test_followup_overrides_reorder_card`; `test_five_cards_and_full_list`. Assert DONE punya satu keputusan dan tidak tampil setelah reload; penundaan tanggal besok tidak tampil hari ini tetapi tampil pada tanggal besok.
- [ ] **Step 2: Jalankan** `python manage.py test crm.tests.test_actions -v 2`; expected fail pada keputusan/UI baru.
- [ ] **Step 3: Implementasikan record_action dan halaman.** Key dari form direkonstruksi terhadap kandidat sumber dan kepemilikan server, bukan dianggap bukti akses. DONE pada followup menandai Activity selesai dan mencatat hasil; DONE pada reorder mencatat interaksi atau menautkan pesanan yang customer/sales-nya sesuai. DISMISSED wajib alasan; SNOOZED wajib tanggal > as_of. Keputusan berulang yang sama idempotent; usaha mengubah hasil yang sudah selesai ditolak. Tampilkan nama pelanggan, alasan, available, waktu pembaruan, penanggung jawab, tombol ke profil/pesanan, dan status WAITING_STOCK.
- [ ] **Step 4: Verifikasi** `python manage.py test crm.tests.test_actions crm.tests.test_access -v 2`; expected OK. POST CSRF diuji melalui client enforce_csrf_checks=True. UI tidak menampilkan persentase peluang membeli atau hasil penjualan yang belum terjadi.
- [ ] **Step 5: Commit.** `git add crm` lalu `git commit -m "feat: add actionable dashboard with recorded outcomes"`.

### Task 7: Dashboard manajer, target, dan definisi capaian

**Files:** Modify models/migrations/selectors/forms/views/today template; create test_dashboard.py.

**Interfaces:**
- Produces SalesTarget; `dashboard_metrics(actor: User, as_of: date) -> dict` dengan keys `shipped_value_rupiah`, `shipped_order_count`, `planned_activity_count`, `done_activity_count`, `overdue_activity_count`, `pending_shipment_count`, `low_stock_count`, `sales_rows`.
- `sales_rows` mempunyai `sales_id`, `sales_name`, `shipped_value_rupiah`, `target_rupiah`, `achievement_percent` nullable.
- POST `/targets/` hanya MANAGER; month dikonversi menjadi hari pertama bulan yang dipilih.
- Handler `target_save(request)` dan SalesTargetForm dengan pilihan sales aktif yang dibatasi ke Group SALES.

- [ ] **Step 1: Tulis test gagal.** `test_only_shipped_orders_count` dengan satu DRAFT, CANCELLED, CONFIRMED, dan SHIPPED masing-masing 400000 mengharapkan nilai 400000/jumlah 1; `test_zero_target_has_no_percentage`; `test_sales_sees_own_results`; `test_manager_cannot_assign_target_to_warehouse`; `test_month_boundary_uses_wib`.
- [ ] **Step 2: Jalankan** `python manage.py test crm.tests.test_dashboard -v 2`; expected fail karena aggregation/target belum dibuat.
- [ ] **Step 3: Implementasikan agregasi langsung dari kejadian.** Capaian bulanan berdasarkan shipped_at lokal, target unik per sales/month. Nilai terkirim dan aktivitas memakai label berbeda. Stok rendah berdasarkan available < min_stock. Manajer melihat seluruh kelompok, sales hanya miliknya, gudang mendapat backlog pengiriman dan stock alerts. Jangan menambah kolom cache capaian yang harus disinkronkan manual.
- [ ] **Step 4: Verifikasi** `python manage.py test crm.tests.test_dashboard crm.tests.test_orders -v 2`; expected OK.
- [ ] **Step 5: Commit.** `git add crm` lalu `git commit -m "feat: report shipped sales and operational work by role"`.

### Task 8: Empat menu responsif dan penyelesaian form

**Files:** Modify templates/base/form/customer/order/today/stock, static app.css/app.js, test_access.py, test_customers.py, test_orders.py.

**Interfaces:**
- Consumes seluruh layanan melalui POST form; tidak mengubah kontrak domain.
- Produces UI Hari Ini/Pelanggan/Pesanan/Stok dengan navigasi sesuai peran, label, fokus keyboard, pesan error, empty states, dan tombol langsung ke pekerjaan.

- [ ] **Step 1: Tulis test perilaku gagal untuk halaman.** `test_every_menu_requires_session`; `test_disallowed_menu_is_hidden_and_route_denied`; `test_order_post_ignores_client_price`; `test_stock_conflict_has_visible_warning`. Assert pesan harga/saldo dan kode HTTP sesuai aturan, tanpa endpoint yang mengubah data via GET.
- [ ] **Step 2: Jalankan** `python manage.py test crm.tests.test_access crm.tests.test_customers crm.tests.test_orders -v 2`; expected fail hanya untuk UI/HTTP yang belum dihubungkan.
- [ ] **Step 3: Hubungkan form dan template.** Gunakan warna amber madu, teks gelap, status yang tetap punya label teks. Form error berada dekat field, input tanggal native, tabel dapat digulir pada layar sempit, catatan ter-escape. JavaScript hanya menambah/menghapus baris draft dan men-disable tombol selama submit; validasi server tetap menentukan hasil. Semua font/aset lokal, tanpa CDN.
- [ ] **Step 4: Verifikasi.** Test pada Step 2 harus OK. Inspeksi manual/browser ukuran 390×844 dan 1366×768: tidak ada tombol terpotong, halaman tidak meluber, fokus terlihat, alasan rekomendasi terbaca, dan tiga peran bisa menjalankan pekerjaan masing-masing. Perubahan CSS ringan tidak membutuhkan test yang meniru nilai CSS.
- [ ] **Step 5: Commit.** `git add crm` lalu `git commit -m "feat: finish responsive CRM workflows and feedback"`.

### Task 9: Data demo, evaluasi, dokumentasi Windows, dan paket MVP

**Files:** Create management commands seed_demo/evaluate_actions, test_demo.py, README.md, docs/demo.md, docs/usability_protocol.md; modify action_cases.json jika ditemukan kesalahan fixture yang jelas tanpa menyelaraskan expected ke bug implementasi.

**Interfaces:**
- `python manage.py seed_demo --as-of 2026-10-11` membuat data pada database kosong; gagal dengan pesan jelas jika data bisnis sudah ada. Tidak ada penghapusan atau overwrite otomatis.
- `python manage.py evaluate_actions --output runtime/evaluation.json` memakai `subprocess.run` dengan interpreter aktif untuk menjalankan `crm.tests.test_actions.ActionCaseEvaluationTests`. Environment `ONEFLOW_TEST_DB` menunjuk file baru dalam `TemporaryDirectory`, sedangkan `ONEFLOW_EVALUATION_OUTPUT` menunjuk output pengguna. `--noinput` hanya berlaku pada database test sementara ini. Laporan berisi case ID, metode A/B/OneFlow, expected, actual, jumlah invalid offers, dan tanggal eksekusi. Evaluasi tidak membuka ulang, menghapus, atau memigrasikan file demo; exit code gagal tetap dilaporkan.
- Seed: 12 pelanggan, 8 SKU, 2 sales, 1 gudang, 1 manajer; MADU01 pada awal demo memiliki fisik 10/reservasi 0. Dua pelanggan milik sales berbeda mempunyai pola pembelian 8 unit dan due date yang sesuai. Akun demo menggunakan password acak; credential hanya ditampilkan dengan flag eksplisit `--show-demo-credentials` dan tidak masuk git/laporan.

- [ ] **Step 1: Tulis test gagal.** `test_seed_counts_and_balances`, `test_seed_refuses_existing_business_data`, `test_full_demo_sequence`, `test_evaluation_reports_actual_case_results`. Sequence demo harus menegaskan saldo (10,0,10) → (10,8,2) → tetap (10,8,2) pada konfirmasi sales kedua ditolak → (2,0,2) setelah kirim → (12,0,12) setelah barang masuk 10. Ledger dan history/capaian harus sesuai.
- [ ] **Step 2: Jalankan** `python manage.py test crm.tests.test_demo -v 2`; expected gagal karena command/dokumen belum tersedia.
- [ ] **Step 3: Implementasikan seed dan evaluator.** Data historis dihasilkan melalui layanan yang sama, lalu timestamp diatur hanya oleh command data sintetis agar interval terkontrol. Seluruh mutasi konsisten. Baseline A mengurutkan pembelian terlama dan memakai SKU/jumlah pembelian terakhir sebagai acuan penawaran; baseline B memakai kandidat/median/score OneFlow dengan state READY tanpa pemeriksaan stok; OneFlow memakai state kelayakan stok. `invalid_offers` menghitung kandidat READY yang jumlah acuannya melampaui available. Pembanding ini mengisolasi kontribusi pemeriksaan stok dan tidak merupakan uji keunggulan terhadap Odoo/Zoho. Jangan menetapkan hasil OneFlow menang dalam kode; laporkan hasil aktual.
- [ ] **Step 4: Tulis README dan protokol.** Windows: `py -3.12 -m venv .venv`, `.venv\Scripts\python.exe -m pip install -r requirements.lock`, lalu migrate/seed/runserver memakai interpreter tersebut. Unix memakai `.venv/bin/python`. Jelaskan credential demo, database lokal, langkah demo tiga menit, batas fitur, arti semua metrik, dan laporan uji manusia yang belum diukur. Protokol usability berisi lima peserta, empat tugas, urutan spreadsheet/aplikasi bergantian, kolom pencatatan waktu/hasil, serta rumus median/perubahan waktu; tidak diisi hasil fiktif.
- [ ] **Step 5: Verifikasi menyeluruh.** `python manage.py check`; `python manage.py makemigrations --check --dry-run`; `python manage.py test crm -v 2`; `python manage.py evaluate_actions --output runtime/evaluation.json`. Expected check bersih, tidak ada migration yang hilang, seluruh test OK, dan laporan berisi 20 kasus aktual. Buka demo di browser dan ulangi sequence tiga menit. Rekaman cadangan dibuat hanya jika diminta; tidak dipublikasikan.
- [ ] **Step 6: Commit dan siapkan paket.** `git add crm README.md docs/demo.md docs/usability_protocol.md requirements.lock` lalu `git commit -m "docs: add reproducible demo and measured evaluation workflow"`. Paket source berisi aplikasi, lock file, migrations, test, spec, plan, dan dokumentasi. Kecualikan .venv, database, secret, credential, cache, dan laporan berisi data nyata. Bila paket diminta sebagai file pengguna, simpan sesuai alur dokumen pengguna.

## Pemetaan tiga hari

| Hari | Tugas | Gerbang hasil |
|---|---|---|
| 1 | 1–3 | Login, akses, pelanggan/aktivitas, SKU, saldo dan mutasi dapat dipakai |
| 2 | 4 | Konfirmasi/batal/kirim, rollback multi-SKU, dan test konkurensi lulus |
| 3 | 5–9 | Action Center, dashboard, UI, laporan evaluator, dan demo tiga menit |

Hari kedua didahulukan untuk integritas penjualan. Jika belum lulus, hentikan tambahan CSV/AI dan gunakan sisa waktu untuk memperbaiki alur wajib. Estimasi ini memerlukan kerja paralel anggota tim pada UI/data/dokumentasi setelah kontrak domain ditetapkan; jumlah anggota dan kecepatan kerja tetap memengaruhi hasil.

## Spec coverage dan self-review

| Bagian spec | Tugas atau keluaran |
|---|---|
| Tujuan, pengguna, batas proses | Global Constraints, Task 1–4 |
| Profil, aktivitas, prospek, jadwal | Task 2 |
| Stock ledger, reservasi, koreksi, status pesanan | Task 3–4 |
| Interval, nilai, kelayakan stok, alasan, hasil tindakan | Task 5–6 |
| Target dan capaian berdasarkan barang terkirim | Task 7 |
| Empat menu dan akses langsung ke pekerjaan | Task 8 |
| Dataset, golden cases, baseline, uji penerimaan | Task 4–5 dan 9 |
| Uji lima peserta dan pilot mitra | Protokol Task 9; pelaksanaan dengan manusia/mitra setelah tersedia |
| Demo tiga menit dan cadangan | Task 9; rekaman hanya bila diminta |
| Strategi proposal, hilirisasi, KI, sumber | Dokumen spec tetap menjadi acuan; tidak memerlukan fitur aplikasi tambahan |
| CSV/AI, batch/FEFO, maklon, multi-gudang | Opsional/fase berikutnya, dikecualikan dari syarat selesai |

Kontrak layanan, field, path, nama test, dan nilai aturan di atas menjadi acuan bersama. Saat implementasi, setiap Task mengikuti siklus test gagal yang bermakna → implementasi minimum → verifikasi → commit. Test fungsi keuangan, akses, transaksi, dan parser wajib; layout ringan diverifikasi secara visual.

Status saat dokumen dibuat: rencana telah ditulis; semua checkbox implementasi belum dikerjakan. Tidak ada test aplikasi atau angka performa yang telah dihasilkan.

## Sumber teknis

Diakses 11 Oktober 2026:

- Django 5.2 release notes: https://docs.djangoproject.com/en/5.2/releases/5.2/ — seri LTS dan dukungan Python 3.12.
- Django database reference: https://docs.djangoproject.com/en/5.2/ref/databases/ — SQLite IMMEDIATE, transaksi singkat, serta keterbatasan select_for_update/concurrency.
- Django authentication: https://docs.djangoproject.com/en/5.2/topics/auth/default/ — session login, Group, LoginView, POST logout.
- Django tests: https://docs.djangoproject.com/en/5.2/topics/testing/overview/ — test runner, database test, dan TransactionTestCase.
- Python zoneinfo: https://docs.python.org/3.12/library/zoneinfo.html — sumber zona waktu lintas platform dan dependensi tzdata pada Windows.

## Handoff pelaksanaan

Rencana tertulis perlu ditinjau untuk keputusan stack, cakupan wajib, dan hasil demo. Metode pelaksanaan belum dipilih pengguna.

- **Native:** implementer utama mengerjakan tugas berurutan dalam sesi ini, kemudian pemeriksaan akhir oleh reviewer baru. Direkomendasikan untuk lingkup MVP ini karena tugas memakai kontrak data dan transaksi yang sama.
- **Subagent-driven:** implementer dan reviewer baru per tugas sebelum tugas berikutnya. Cocok bila pengguna mengutamakan tinjauan independen tiap tahap, dengan konteks dan biaya tambahan.

Implementasi dimulai setelah tinjauan rencana dan pilihan metode tersebut. Perubahan stack atau fitur pada tinjauan dimasukkan ke rencana sebelum kode aplikasi ditulis.
