# Laporan Progress Integrasi Data Asli CV Arba'in (`Data_asli`)

**Tanggal Update:** 20 November 2026  
**Status Lokal:** Berjalan di `http://127.0.0.1:8000/` (`runtime/oneflow.sqlite3`)  
**Status Validasi:** Lolos `validate_synthetic()` (0 error konsistensi stok, batch, PO, maupun pesanan)

---

## 1. Ringkasan Progress Terbaru

Seluruh data dummy awal (8 produk fiktif & 48 toko fiktif) telah **dihapus dan diganti** dengan data operasional asli dari dokumen PDF di folder `Data_asli` (periode Oktober 2026):

| Komponen Data | Data Dummy Lama | Data Asli Baru (`Data_asli`) | Sumber Dokumen PDF |
|---|---|---|---|
| **Akun Sales** | Nadia Prameswari & Rafi Mahendra | **Sales Endri** & **Sales Monic** | `CATATAN.docx` |
| **Produk (SKU)** | 8 SKU fiktif (`MADU01`, `COSM01`, dll.) | **64 SKU Asli CV Arba'in** (*Madu Hitam Pahit 470 gr*, *Sari Kurma Alief 470 gr*, *Madu Aliffah Flores 1 kg/0.5 kg*, *Minyak Zaitun EVO 60 ml/30 ml*, *Arbabumin 60 kap*, *VCO 125 ml*, *Cuka Apel Fresh*, dll.) | `REKAP PENJUALAN PRODUK SALES OKT 26.pdf` & `LAPORAN UPDATE GLOBAL SALES OKT 26.pdf` |
| **Outlet / Pelanggan** | 48 pelanggan fiktif | **218 Outlet Asli** di 6 Wilayah Solo Raya:<br>• **118 Outlet Sales Endri** (`END-001`..`END-118`)<br>• **100 Outlet Sales Monic** (`MON-001`..`MON-100`) | `KUNJUNGAN SALES ARBAIN OKT 26.pdf`, `OUTLET SETOR`, & PDF per Wilayah (`SURAKARTA`, `SUKOHARJO`, `SRAGEN`, `KARANGANYAR`, `BOYOLALI`, `KLATEN`) |
| **Kunjungan & Pesanan** | 335 pesanan simulasi acak | **562 Pesanan** & riwayat kunjungan sesuai Tanggal Ambil, Tanggal Setor, dan kunjungan berulang (baris kuning di PDF) | `KUNJUNGAN SALES ARBAIN OKT 26.pdf` & `RECORD SETOR OKTOBER 2026` |
| **Titip Jual (Konsinyasi) & Arahan Manajer** | 6 apotek sampel | Record setor `A, M, R, L, S` (Awal, Masuk, Retur, Laku, Sisa), EWS Bahan Baku Arba'in, serta Arahan Manajer berdasarkan produk terlaris (*Madu Hitam Pahit 470 gr*, *EVO 60 ml*) vs produk 0 laku (*Bilberry 60 kap*, *Madu Rambutan 250 ml*) | `REKAP PENJUALAN PRODUK SALES OKT 26.pdf` & PDF Wilayah |

---

## 2. Daftar File yang Dibuat & Diganti

Berikut rincian file yang ditambahkan atau dimodifikasi dalam proyek:

### A. File Baru yang Ditambahkan
1. **[crm/arbain_real_data.py](file:///d:/UMS%20Hackathon/crm/arbain_real_data.py)** *(File Baru)*
   - Menyimpan hasil ekstraksi terstruktur dari seluruh PDF di `Data_asli`:
     - `ARBAIN_PRODUCTS`: 64 produk asli beserta SKU, nama, satuan, harga Rupiah, batas stok minimum, angka `J, R, L` (Jumlah, Retur, Laku) untuk Endri & Monic, serta angka stok global di outlet.
     - `ENDRI_OUTLETS`: 118 outlet asli milik Sales Endri beserta kecamatan, kabupaten/kota, Tanggal Setor, Tanggal Ambil, dan tanggal kunjungan tambahan.
     - `MONIC_OUTLETS`: 100 outlet asli milik Sales Monic beserta kecamatan, kabupaten/kota, Tanggal Setor, Tanggal Ambil, dan tanggal kunjungan tambahan.
     - `classify_outlet()`: Fungsi klasifikasi otomatis kategori mitra (`APOTEK` diskon 16%, `MINIMARKET`/Toko/Koperasi/Swalayan diskon 20%, `DISTRIBUTOR`/Grosir diskon 25%).

### B. File Kode yang Diganti / Diperbarui
2. **[crm/management/commands/seed_realistic.py](file:///d:/UMS%20Hackathon/crm/management/commands/seed_realistic.py)**
   - **Apa yang diganti:** Menghapus variabel `CATALOG` (8 produk dummy), `NAMES`, dan `SEGMENTS` (48 pelanggan dummy), lalu menggantinya dengan `ARBAIN_PRODUCTS`, `ENDRI_OUTLETS`, dan `MONIC_OUTLETS` dari `crm/arbain_real_data.py`.
   - Mengubah nama tampilan akun `nadia` menjadi **`Sales Endri`** dan `rafi` menjadi **`Sales Monic`** (termasuk memperbarui `first_name` pada akun yang sudah ada saat proses `reseed`).
   - Menyesuaikan generator transaksi (`plan_history`, `plan_samples`, `plan_receipts`) agar seluruh 64 SKU memiliki batch stok gudang (FEFO) yang valid dan sesuai dengan aturan `validate_synthetic()`.
3. **[crm/services/consignment_seed.py](file:///d:/UMS%20Hackathon/crm/services/consignment_seed.py)**
   - **Apa yang diganti:** Mengganti data konsinyasi/titip jual, bahan baku (*Early Warning System*), dan *Arahan Bawaan Sales* (`ProductCarryDirective`) agar menggunakan SKU asli Arba'in (`MHP-470`, `SKA-470`, `FLR-10`, `FLR-05`, `EVO-60`, `ARB-60`, `BLB-60`, `MRB-250`, dll.) serta mendistribusikan record setoran Oktober 2026 (`A, M, R, L, S`) ke outlet Endri dan Monic.
   - Tetap mempertahankan *fallback* ke SKU lama apabila dipanggil dari *unit test* lama.
4. **[crm/demo_access.py](file:///d:/UMS%20Hackathon/crm/demo_access.py)**
   - **Apa yang diganti:** Mengubah label kartu **Akses demo untuk juri** di halaman login dari *Nadia / Rafi / Dewi / Arif* menjadi **Sales Endri**, **Sales Monic**, **Gudang Arba'in**, dan **Manajer Arba'in** beserta deskripsi wilayah Solo Raya.
5. **[frontend/productPhotos.ts](file:///d:/UMS%20Hackathon/frontend/productPhotos.ts)**
   - **Apa yang diganti:** Memetakan ke-64 kode SKU asli Arba'in (`MHP-470`, `SKA-470`, `FLR-10`, `EVO-60`, dll.) ke aset gambar produk lokal (`madu01.jpg`, `madu02.jpg`, `herbal01.jpg`, `herbal02.jpg`, `herbal03.jpg`, `cosm01.jpg`, `cosm02.jpg`, `cosm03.jpg`) agar seluruh 64 produk tetap memiliki thumbnail gambar di tabel dan halaman detail.
6. **[.gitignore](file:///d:/UMS%20Hackathon/.gitignore)**
   - Menambahkan `Data_asli` agar file PDF mentah tidak ikut ter-unggah ke repositori Git publik.

---

## 3. Plus & Minus (Kelebihan dan Kekurangan) Implementasi Saat Ini

### Kelebihan (Plus)
1. **Data Produk, Sales, dan Outlet 100% Representatif:**
   - Seluruh **64 SKU produk Arba'in** dan **218 outlet** di 6 wilayah Solo Raya (Surakarta, Sukoharjo, Sragen, Wonogiri, Karanganyar, Boyolali, Klaten) yang tampil di aplikasi sudah sesuai dengan dokumen operasional `Data_asli`.
2. **Kompatibilitas Penuh dengan Sistem Login & Reseed Render:**
   - Karena `username` internal tetap mempertahankan `nadia` (dengan nama tampilan **Sales Endri**) dan `rafi` (dengan nama tampilan **Sales Monic**), Anda **tidak perlu mereset akun/password** di server Render. Saat `scripts/reseed_render.py` dijalankan, nama di layar otomatis berubah menjadi **Sales Endri** dan **Sales Monic**.
3. **Lolos Seluruh Validasi Akuntansi Stok & FEFO (`validate_synthetic`):**
   - Di aplikasi OneFlow, tabel `Order` tidak berdiri sendiri melainkan harus sinkron dengan `StockBatch`, `BatchAllocation`, `StockMovement`, `InventoryBalance`, dan `PurchaseOrder`. Dengan mengintegrasikan data asli ke dalam mesin `Simulation` di `seed_realistic.py`, seluruh saldo stok gudang, reservasi batch, dan riwayat mutasi dijamin 100% konsisten tanpa selisih angka.
4. **Seluruh Fitur Aplikasi Hidup (Tidak Ada Halaman Kosong):**
   - Grafik pengiriman 7/30 hari di Dashboard, Rekomendasi Pembelian Ulang, Titip Jual (Konsinyasi), EWS Bahan Baku, Arahan Manajer, Pengadaan (PO), dan Evaluasi Sampel semuanya langsung terisi dengan produk dan outlet asli Arba'in.

### Kekurangan / Catatan (Minus) & Solusinya
1. **Harga Satuan Rupiah (`price_rupiah`) Masih Berupa Estimasi:**
   - **Penyebab:** Di seluruh file PDF `Data_asli`, tabel hanya memuat jumlah barang (`J, R, L` atau `A, M, R, L, S`) dalam satuan botol/unit tanpa kolom harga Rupiah (sebagaimana tercatat pada `CATATAN.docx`).
   - **Solusi:** Saat ini harga diisi dengan estimasi wajar berdasarkan jenis dan ukuran kemasan (Rp18.000 – Rp98.000). Jika sudah ada daftar harga resmi, harga dapat langsung diubah melalui menu **Produk & stok → Edit** di aplikasi atau diubah angkanya di [crm/arbain_real_data.py](file:///d:/UMS%20Hackathon/crm/arbain_real_data.py).
2. **Tanggal Kedaluwarsa (*Expiry Date*) & Stok Fisik Gudang Pusat Masih Disimulasikan Secara Proporsional:**
   - **Penyebab:** PDF hanya mencatat stok yang tersebar di outlet (`LAPORAN UPDATE GLOBAL`), bukan jumlah stok fisik yang tersimpan di rak gudang pabrik maupun tanggal kedaluwarsa tiap batch.
   - **Solusi:** Sistem otomatis membuatkan batch stok gudang (`ARB-<SKU>-<TGL>`) secara proporsional dari volume penjualan tiap produk agar fitur FEFO dan pengiriman pesanan dapat berjalan.
3. **Sebagian Riwayat Transaksi Sebelum Oktober & Bulan Berjalan (November) Dibangkitkan untuk Menjaga Fitur Dashboard & Rekomendasi:**
   - **Penyebab:** Algoritma *Rekomendasi Pembelian Ulang* di aplikasi mewajibkan minimal **3 tanggal transaksi berbeda** per pelanggan, dan grafik Dashboard menampilkan pengiriman pada **bulan berjalan (November 2026)**. Sementara itu, PDF `Data_asli` merupakan rekap 1 bulan (Oktober 2026 + 1 kolom Tanggal Ambil sebelumnya).
   - **Solusi:** Untuk outlet-outlet utama, sistem menambahkan titik transaksi berdasarkan siklus Tanggal Ambil → Tanggal Setor Oktober → pengiriman awal November agar grafik Dashboard bulan berjalan dan rekomendasi pembelian ulang tidak kosong saat dipresentasikan.
4. **Foto Produk Memakai 8 Gambar Kategori yang Tersedia:**
   - **Penyebab:** Aplikasi hanya membundel 8 file foto mockup (`madu01.jpg` s/d `cosm03.jpg`).
   - **Solusi:** Ke-64 produk Arba'in telah dipetakan ke foto yang paling sesuai dengan jenisnya (Madu, Sari Kurma/Cuka, Kapsul/Serbuk, Minyak Zaitun/VCO, Cream).

---

## 4. Panduan Menjalankan

### A. Menjalankan di Lokal (Laptop)
```powershell
.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```
Buka **http://127.0.0.1:8000/** dan gunakan tombol **Akses demo untuk juri** di halaman login untuk masuk sebagai **Sales Endri**, **Sales Monic**, **Gudang Arba'in**, atau **Manajer Arba'in**.

### B. Mengirim Data Asli Ini ke Database Render Online
Jika ingin mengganti data di database PostgreSQL Render online dengan data asli Arba'in ini:
```powershell
.venv\Scripts\python.exe scripts\reseed_render.py
```
1. Tempel **External Database URL** dari dashboard PostgreSQL Render Anda (karakter tidak ditampilkan di layar), lalu tekan **Enter**.
2. Pastikan host dan nama database sudah benar, lalu ketik `RESET DEMO` dan tekan **Enter**.
3. Jika kode di GitHub/Render juga ingin menampilkan foto untuk 64 SKU baru dan label login baru, jangan lupa lakukan `git commit` dan `git push` ke repositori GitHub yang terhubung ke Render.
