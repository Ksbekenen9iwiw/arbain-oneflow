# Arbain OneFlow

## Rancangan MVP dan strategi proposal UMS Health Innovation Hackathon 2026

**Tanggal:** 11 Oktober 2026.  
**Tantangan:** ARB-02 — Integrasi Data Pelanggan, Aktivitas Sales, dan Stok.  
**Judul usulan:** Arbain OneFlow: CRM Terintegrasi dengan Rekomendasi Tindak Lanjut Berbasis Riwayat Pelanggan dan Ketersediaan Stok.  
**Status:** rancangan untuk ditinjau; aplikasi, pengujian, dan pilot belum dilakukan.  
**Batas MVP:** tiga hari pembangunan oleh tim yang mampu mengerjakan frontend, backend, dan database.  
**Tujuan dokumen:** dasar proposal, pembatasan MVP, rancangan teknis, dan persiapan demo. Dokumen ini belum merupakan rencana implementasi terperinci.

## 1. Keputusan dan dasar informasi

| Informasi | Status | Konsekuensi rancangan |
|---|---|---|
| ARB-02 membutuhkan pencatatan pelanggan, pemantauan sales, dan pengelolaan stok | Terverifikasi pada halaman resmi [S1] | Ketiganya wajib hadir dalam alur demo |
| Data tersebar di buku, spreadsheet, dan pesan singkat | Disampaikan pengguna dari materi tantangan | Rancangan menerima pencatatan manual dan menyiapkan jalur migrasi CSV |
| CV Arbain memproduksi madu, herbal, kosmetik, dan melayani maklon | Disampaikan pengguna | Produk jadi dipilih sebagai fokus awal; proses maklon masuk pengembangan berikutnya |
| Pengguna belum berkomunikasi langsung atau menerima data mitra | Dikonfirmasi pengguna | Semua data demo dibuat sebagai simulasi dan ditandai demikian |
| Tim mampu membangun frontend, backend, dan database | Dikonfirmasi pengguna | MVP berupa aplikasi dengan transaksi database yang berjalan |
| Waktu pembangunan maksimal tiga hari | Dikonfirmasi pengguna | Satu gudang, pengiriman penuh, tiga peran, dan satu pusat rekomendasi |
| Bobot NP: 20%, 22%, 28%, 20%, 10%; ambang 2,80 | Disampaikan pengguna | Pemetaan proposal menggunakan bobot ini; skala penilaian belum dapat diverifikasi |
| Dukungan mitra masih dikonfirmasi | Terverifikasi pada halaman ARB-02 [S1] | Pilot dan akses data ditulis sebagai usulan, tanpa mengklaim komitmen mitra |
| Purwarupa belum wajib saat pendaftaran | Terverifikasi pada berita resmi UMS [S2] | Proposal dapat menjelaskan rancangan dan rencana uji sebelum purwarupa selesai |

Tautan pedoman peserta dan template proposal ditemukan melalui situs resmi UMS, tetapi isi dokumen yang ditautkan belum berhasil dibaca. Struktur dokumen ini merupakan rancangan tim, bukan klaim mengikuti setiap bagian template resmi. Sebelum pengajuan, tim perlu memeriksa template, skala skor NP, pengertian kedalaman teknologi, dan aturan mulai pengerjaan purwarupa.

Tidak ada dasar untuk menghitung persentase peluang kemenangan atau menjamin kelolosan. Strategi ini memperkuat kesesuaian masalah, pembuktian teknologi, kelayakan, dan rencana pemanfaatan.

## 2. Masalah yang akan diselesaikan

Data pelanggan, aktivitas sales, dan stok yang dicatat terpisah membuat satu keputusan penjualan memerlukan penelusuran beberapa sumber. Sales perlu mengetahui riwayat pelanggan dan barang yang tersedia. Gudang perlu mengetahui pesanan yang benar-benar dikonfirmasi. Manajer perlu mengetahui aktivitas, kendala, dan hasil penjualan berdasarkan kejadian yang tercatat.

Hipotesis masalah yang perlu diuji bersama mitra:

1. Riwayat pelanggan dan tanggal tindak lanjut sulit ditemukan kembali.
2. Pesanan dan komunikasi sales belum selalu terlihat oleh gudang.
3. Barang yang sudah dijanjikan atau dipesan belum dibedakan dari stok fisik.
4. Sales belum mempunyai daftar tindakan prioritas yang menggabungkan riwayat pelanggan dan stok tersedia.

Pernyataan ini belum merupakan hasil wawancara CV Arbain. Proposal harus membedakan materi tantangan, dugaan tim, dan hasil validasi yang nanti diperoleh.

## 3. Tujuan, pengguna, dan batas proses

**Tujuan utama:** membantu sales menentukan tindak lanjut yang relevan dan membantu gudang memenuhi pesanan dari satu data yang konsisten.

**Hipotesis manfaat:** keterhubungan data dan alasan rekomendasi dapat mengurangi waktu mencari informasi serta meningkatkan penyelesaian tindak lanjut. Besarnya perubahan baru dilaporkan setelah pengujian.

| Pengguna | Pekerjaan dalam MVP | Batas akses |
|---|---|---|
| Sales | Melihat pelanggan yang ditugaskan, mencatat kunjungan/interaksi, melihat stok tersedia, membuat dan mengonfirmasi pesanan | Pelanggan, aktivitas, dan pesanan miliknya; stok tersedia tanpa mengubah saldo gudang |
| Admin/gudang | Melihat pesanan dikonfirmasi, mencatat barang masuk, pengiriman, dan koreksi hasil pemeriksaan fisik | Operasi gudang dan pesanan; akses kontak pelanggan hanya untuk pemenuhan |
| Pemilik/manajer | Memantau seluruh aktivitas, menetapkan sales penanggung jawab dan target, melihat hasil dan alasan koreksi | Seluruh data operasional dan pengaturan akses |

Keputusan MVP:

- Satu organisasi dan satu gudang.
- Produk jadi dengan satu satuan per SKU, misalnya botol atau unit.
- Nilai rupiah disimpan sebagai bilangan bulat nonnegatif; jumlah barang sebagai bilangan bulat positif.
- Pengiriman dilakukan penuh untuk satu pesanan; pengiriman sebagian ditunda.
- Pesanan boleh dibatalkan sebelum pengiriman. Pesanan terkirim tidak dapat dibatalkan melalui operasi biasa; retur ditunda.
- Proses produksi, maklon, bahan baku, pajak, pembayaran, dan akuntansi tidak dibangun dalam MVP.
- UI responsif dapat dibuka pada telepon dan komputer; tidak memerlukan aplikasi seluler terpisah.
- Zona waktu operasional menggunakan WIB. Waktu kejadian disimpan dengan zona waktu yang jelas.
- Ketersediaan batch dan tanggal kedaluwarsa perlu divalidasi bersama mitra. MVP belum mendukung FEFO atau pelacakan batch dan harus disebutkan batasnya ketika demo.

## 4. Positioning dan pembanding

**Pernyataan solusi:** Arbain OneFlow menghubungkan pelanggan, pekerjaan sales, dan stok untuk mengubah informasi operasional menjadi tindakan yang dapat ditelusuri dan diselesaikan.

**Pesan singkat:** “Tahu siapa yang perlu dihubungi, tahu barang yang tersedia, dan tahu pekerjaan yang perlu diselesaikan.”

Integrasi CRM dan persediaan serta rekomendasi tindakan sales telah tersedia pada produk lain. Klaim kebaruan perlu dibatasi pada rancangan, penyesuaian konteks, dan hasil pengujian; tidak ada klaim bahwa ide ini pertama di dunia.

| Pembanding | Kemampuan yang didukung sumber resmi | Implikasi bagi OneFlow |
|---|---|---|
| Odoo | Aktivitas tindak lanjut CRM dan reservasi barang untuk pemenuhan penjualan [S3, S4] | Pencatatan dan reservasi merupakan fondasi, bukan klaim kebaruan tersendiri |
| Zoho CRM + Zoho Inventory | Integrasi informasi pelanggan dan pesanan serta koordinasi sales/inventori [S5] | Penyatuan data perlu disertai alasan pemilihan solusi dan bukti kegunaan |
| Zoho Zia | Rekomendasi tindakan berikutnya berdasarkan konteks rekaman pelanggan [S6] | Fitur rekomendasi saja belum cukup untuk menyatakan keunggulan |
| Spreadsheet terpisah | Pembanding eksperimen yang dibuat tim dengan data setara | Digunakan mengukur waktu tugas; tidak mewakili semua spreadsheet atau kondisi aktual mitra |

**Pembeda yang diusulkan untuk diuji:** satu pusat tindakan sederhana yang menggabungkan tanggal tindak lanjut, pola pembelian pelanggan, stok setelah reservasi, penanggung jawab, alasan rekomendasi, dan hasil tindakan. Penawaran ditinjau kembali ketika stok berubah. Keunggulan kemudahan penggunaan dan kesesuaian CV Arbain harus dibuktikan melalui uji tugas dan pilot.

## 5. MVP yang dituntaskan

| Kelompok fitur | Perilaku wajib | Bukti dalam demo |
|---|---|---|
| Pelanggan | Profil, kode pelanggan, kontak, sales penanggung jawab, riwayat pesanan, catatan interaksi | Satu halaman menampilkan riwayat yang sebelumnya tersebar |
| Aktivitas sales | Rencana kunjungan, hasil kunjungan/interaksi, tahap prospek, tanggal tindak lanjut | Tindak lanjut tercatat dengan pelaksana dan status |
| Pesanan | Draft, konfirmasi, pembatalan sebelum kirim, pengiriman penuh | Satu pesanan memengaruhi pelanggan, capaian sales, dan persediaan |
| Stok | Barang masuk, stok fisik tercatat, reservasi, stok tersedia, mutasi, batas minimum, koreksi dengan alasan | Saldo berubah melalui kejadian bisnis yang dapat ditelusuri |
| Action Center | Tindak lanjut jatuh tempo, pembelian ulang, kendala stok, alasan dan tindakan | Rekomendasi berubah mengikuti data terbaru |
| Dashboard | Aktivitas selesai/jatuh tempo, nilai pesanan terkirim per sales, target, pesanan menunggu kirim, stok rendah | Manajer dapat mengetahui pekerjaan dan hasil dari definisi metrik yang jelas |

Pencatatan manual wajib tersedia. Migrasi CSV untuk pelanggan dan produk merupakan fitur tambahan setelah alur inti stabil. Bila dibuat, impor harus memakai pratinjau, validasi per baris, kode pelanggan/SKU unik, serta penolakan konflik tanpa penggabungan otomatis berdasarkan nama. Riwayat transaksi dan saldo awal mitra dimigrasikan pada tahap pilot setelah rekonsiliasi.

**Metrik capaian sales dalam MVP:** jumlah pesanan terkirim dan nilai barang terkirim menurut sales pemilik pesanan. Nilai ini bukan bukti pembayaran atau laba. Pesanan draft, dibatalkan, atau belum dikirim tidak dihitung sebagai capaian terkirim. Target bulanan ditetapkan manajer; jika target belum diisi, tampilkan nilai capaian tanpa persentase.

## 6. Cara kerja rekomendasi

Mesin MVP adalah sistem pendukung keputusan berbasis aturan dan skor prioritas yang transparan. Sistem belum dilatih menggunakan data bisnis CV Arbain, belum memprediksi peluang penjualan, dan tidak boleh dipresentasikan sebagai model ML yang tervalidasi.

### 6.1 Data masukan

- Pelanggan aktif dan sales penanggung jawab.
- Aktivitas, status penyelesaian, dan tanggal tindak lanjut yang dicatat pengguna.
- Riwayat pesanan terkirim per pelanggan dan SKU.
- Stok fisik tercatat, reservasi aktif, stok tersedia, dan waktu pembaruan.
- Pesanan dikonfirmasi yang belum dikirim.

### 6.2 Aturan kandidat

**Tindak lanjut:** aktivitas belum selesai dengan tanggal tindak lanjut hari ini atau lebih awal menghasilkan kandidat. Sistem menampilkan tanggal dan catatan sumbernya.

**Pembelian ulang:** dihitung untuk pasangan pelanggan–SKU dengan minimal tiga pembelian pada tanggal berbeda. Gunakan median selang tanggal dari paling banyak enam tanggal pembelian terakhir. Tanggal indikasi pembelian berikutnya adalah tanggal pembelian terakhir ditambah median selang tersebut. Kandidat muncul ketika tanggal indikasi telah tiba. Ambang ini keputusan awal untuk demo, bukan bukti kecukupan statistik.

Jumlah indikatif menggunakan median jumlah pada maksimal tiga pembelian terakhir. Jumlah tersebut ditampilkan sebagai acuan historis yang harus diperiksa sales. Pelanggan dengan riwayat kurang tidak menerima perkiraan interval; gunakan tanggal tindak lanjut manual.

Pasangan pelanggan–SKU yang sudah mempunyai pesanan dikonfirmasi belum terkirim tidak menerima rekomendasi pembelian ulang yang sama. Ini mengurangi pekerjaan duplikat.

**Kendala stok:** jika stok tersedia lebih kecil dari jumlah indikatif, kandidat pembelian ulang ditampilkan sebagai kebutuhan koordinasi stok. Pesanan dalam jumlah penuh tidak dapat dikonfirmasi sampai stok mencukupi. Sales boleh membuat draft dengan jumlah yang disepakati pelanggan; ketersediaan diperiksa kembali saat konfirmasi.

**Stok rendah:** SKU dengan stok tersedia di bawah batas minimum manual menghasilkan peringatan gudang. Peringatan ini belum menghitung jumlah produksi atau pembelian bahan baku.

### 6.3 Skor prioritas dan penjelasan

Skor awal untuk kandidat tindak lanjut atau pembelian ulang:

- Urgensi U = nilai terkecil antara 1 dan jumlah hari keterlambatan dibagi 7.
- Nilai pelanggan V = nilai pesanan terkirim pelanggan dalam 90 hari terakhir dibagi nilai pelanggan terbesar dalam kelompok aktif. Jika semuanya nol, V = 0.
- Prioritas P = pembulatan 100 × (0,8 × U + 0,2 × V).

Bobot merupakan keputusan rancangan sementara untuk uji, bukan hasil pembelajaran atau ukuran probabilitas. Uji sensitivitas membandingkan urutan dengan bobot 1,0/0,0 agar kontribusi nilai pelanggan dapat diperiksa. Nilai pelanggan tidak menghapus kewajiban tindak lanjut kepada pelanggan kecil.

Stok dipakai sebagai pemeriksaan kelayakan tindakan, bukan tambahan skor yang boleh mengalahkan batas ketersediaan. Semua kandidat memiliki alasan berupa data sumber: tanggal, jumlah riwayat, interval, stok tersedia, dan waktu pembaruan.

Untuk tampilan sales, kelompokkan kandidat per pelanggan: utamakan tindak lanjut eksplisit yang jatuh tempo, lalu kandidat pembelian ulang dengan prioritas terbesar. Tampilkan lima kartu teratas dengan akses ke daftar lengkap. Tidak ada klaim bahwa lima adalah jumlah kerja optimal.

### 6.4 Hasil tindakan dan pembaruan

Setiap rekomendasi mempunyai identitas stabil berdasarkan pelanggan, jenis, dan sumber pemicu, misalnya aktivitas atau tanggal pembelian terakhir. Hasil tindakan disimpan agar penyegaran halaman tidak membuat pekerjaan selesai muncul berulang.

- Selesai: wajib mencatat hasil interaksi atau menautkan pesanan yang dibuat.
- Tunda: wajib menentukan tanggal tindak lanjut berikutnya.
- Tolak: wajib menyimpan alasan singkat untuk evaluasi.
- Perubahan stok memperbarui kelayakan kandidat; tidak mengubah keputusan pengguna yang sudah disimpan.

Perhitungan dilakukan ulang setelah transaksi berhasil dan saat daftar dimuat. Tampilan menunjukkan waktu pembaruan. Untuk MVP, pembaruan antar pengguna dilakukan lewat pemuatan ulang; tidak ada klaim streaming waktu nyata.

### 6.5 AI opsional dan kedalaman teknologi

Jika seluruh fitur wajib dan pengujian transaksi selesai, satu fungsi AI opsional dapat menyusun draf tindak lanjut dari rekaman pelanggan yang sudah dipilih. Data yang diberikan terbatas pada informasi relevan; nomor kontak tidak diperlukan untuk menyusun draf. Semua angka stok berasal dari database dan diperiksa saat konfirmasi pesanan. Draf diperiksa pengguna sebelum digunakan.

Kegagalan layanan AI tidak menghentikan CRM; tersedia template pesan biasa. AI tidak mengirim pesan, mengubah saldo, mengonfirmasi pesanan, atau membuat klaim khasiat produk.

Kedalaman MVP dibuktikan melalui keterhubungan data, pemisahan stok/reservasi, konsistensi transaksi, alasan keputusan, dan perbandingan dengan metode sederhana. Jika rubrik resmi mewajibkan AI/ML atau deeptech tertentu, kecocokan pendekatan berbasis aturan perlu dikonfirmasi kepada panitia. Pengembangan model terlatih ditulis sebagai fase lanjutan dengan data nyata, pembagian data menurut waktu, dan evaluasi terhadap baseline interval; tidak dijanjikan selesai dalam tiga hari.

## 7. Rancangan data dan arsitektur

Gunakan stack frontend/backend yang telah dikuasai tim, satu aplikasi, dan satu database relasional. Tidak diperlukan database graf, message broker, atau microservices untuk lingkup MVP.

| Entitas | Isi pokok | Fungsi |
|---|---|---|
| User | Identitas, peran, status | Pelaksana dan pembatasan akses |
| Customer | Kode unik, nama, kontak, sales pemilik, status | Sumber profil pelanggan |
| Product | SKU unik, nama, satuan, harga, batas minimum | Sumber informasi barang |
| Activity | Pelanggan, sales, rencana/hasil, tahap prospek, due date, status | Riwayat interaksi dan pemicu tindak lanjut |
| Order | Pelanggan, sales, status, nilai, waktu konfirmasi/kirim/batal | Kejadian penjualan |
| OrderLine | Order, SKU, jumlah, harga saat pesanan | Detail yang tidak berubah mengikuti harga katalog |
| InventoryBalance | SKU, stok fisik tercatat, jumlah reservasi, versi pembaruan | Pemeriksaan stok tersedia |
| StockMovement | SKU, jumlah bertanda, tipe, referensi, pelaksana, alasan, waktu | Jejak perubahan fisik |
| ActionDecision | Identitas pemicu, keputusan, hasil/alasan, tanggal berikutnya, pelaksana | Pencegahan pekerjaan rekomendasi yang berulang |

Relasi pelanggan–aktivitas–pesanan–SKU–stok berasal dari foreign key. Rekomendasi membaca relasi tersebut; tidak ada klaim telah membangun knowledge graph khusus.

Nilai stok fisik dihitung dan direkonsiliasi terhadap mutasi. Nilai reservasi harus sama dengan jumlah baris pesanan berstatus dikonfirmasi yang belum dikirim. MVP tidak menyimpan angka dashboard yang diperbarui manual; capaian diturunkan dari kejadian sumber.

## 8. Integritas transaksi dan penanganan kegagalan

Rumus: **stok tersedia = stok fisik tercatat − reservasi aktif**.

| Kejadian | Status pesanan | Pengaruh fisik | Pengaruh reservasi |
|---|---|---:|---:|
| Membuat draft | DRAFT | 0 | 0 |
| Konfirmasi dengan stok cukup | CONFIRMED | 0 | +jumlah pesanan |
| Membatalkan sebelum kirim | CANCELLED | 0 | −reservasi pesanan |
| Pengiriman penuh | SHIPPED | −jumlah pesanan | −reservasi pesanan |
| Barang masuk | Tidak terkait | +jumlah masuk | 0 |
| Koreksi hasil pemeriksaan fisik | Tidak terkait | Selisih hasil hitung terhadap saldo | 0 |

Konfirmasi, pembatalan, dan pengiriman harus berjalan sebagai transaksi database utuh. Untuk pesanan multi-SKU, seluruh SKU diperiksa dan dikunci dengan urutan yang tetap; kegagalan satu SKU membatalkan seluruh operasi. Dua sales yang beroperasi bersamaan harus melewati pemeriksaan ketersediaan yang sama di server.

Pengiriman hanya diizinkan dari CONFIRMED. Percobaan mengirim kembali pesanan yang sama tidak menghasilkan mutasi kedua. Identitas operasi dan pembatasan mutasi unik mencegah pengulangan ketika pengguna menekan tombol dua kali atau koneksi terputus setelah penyimpanan.

Barang dalam draft tidak dijanjikan sebagai reservasi. Pemeriksaan dari browser merupakan bantuan UI; server tetap memeriksa saldo pada saat konfirmasi.

Koreksi stok wajib mencatat hitungan aktual, selisih, alasan, dan pelaksana. Jika hitungan aktual lebih rendah dari reservasi, tampilkan peringatan konflik fisik dan blokir konfirmasi baru pada SKU tersebut. Pemenuhan tidak boleh diteruskan melebihi barang aktual. Gudang dan manajer harus memeriksa atau membatalkan reservasi terdampak sesuai keputusan bisnis sebelum kembali menjual SKU. Kesalahan fisik tidak disembunyikan dengan menaikkan stok otomatis.

Untuk keadaan normal, stok tersedia nonnegatif. Konflik akibat pemeriksaan fisik dapat menunjukkan kekurangan terhadap komitmen yang sudah ada dan harus terlihat sebagai pengecualian operasional.

## 9. UX yang membantu demo dan penggunaan

Empat menu utama:

1. **Hari Ini:** Action Center, pekerjaan jatuh tempo, pesanan menunggu kirim, dan ringkasan sesuai peran.
2. **Pelanggan:** profil, riwayat, aktivitas, prospek, dan tombol membuat pesanan.
3. **Pesanan:** status, konfirmasi, pembatalan, dan pengiriman sesuai akses.
4. **Stok:** fisik tercatat, reservasi, tersedia, mutasi, dan peringatan.

Catatan kunjungan berada dalam profil pelanggan agar tidak memerlukan menu baru. Kartu rekomendasi mempunyai tombol yang membawa pengguna langsung ke pekerjaan terkait. Informasi alasan diletakkan dekat tombol tindakan. Stok fisik tercatat dan stok tersedia diberi label berbeda.

Dashboard manajer menampilkan nilai pesanan terkirim, aktivitas, dan status pesanan secara terpisah. Jumlah kunjungan tidak diberi label sebagai produktivitas atau kualitas sales tanpa ukuran tambahan. Akses yang ditolak menghasilkan pesan yang menjelaskan operasi yang tersedia bagi peran tersebut.

## 10. Pengujian dan bukti yang harus dibawa

Seluruh angka di bagian ini adalah rancangan uji dan target penerimaan. Belum ada hasil pengujian.

### 10.1 Dataset demonstrasi

Buat data sintetis: 12 pelanggan, 8 SKU, 2 sales, 1 gudang, riwayat transaksi terkirim, aktivitas jatuh tempo, dan mutasi yang konsisten. Nama contoh seperti Apotek Sehat merupakan nama fiktif. Setiap layar demo menampilkan penanda data simulasi.

Data harus mencakup pelanggan tanpa riwayat, pembelian berulang, prospek aktif, pesanan tertunda, stok cukup, stok habis, dan stok yang sebagian sudah direservasi. Skenario rekomendasi yang benar ditentukan sebelum menjalankan mesin dan disimpan terpisah dari hasil aktual.

### 10.2 Penerimaan fungsional

| Kasus uji | Hasil yang disyaratkan |
|---|---|
| Draft dibuat | Saldo fisik dan reservasi tetap |
| Pesanan dikonfirmasi | Reservasi naik; fisik tetap |
| Stok tidak mencukupi | Konfirmasi ditolak; saldo dan status tidak berubah |
| Konfirmasi dua pesanan bersamaan melebihi stok | Maksimal kombinasi yang bisa dipenuhi berhasil; operasi lainnya ditolak |
| Konfirmasi multi-SKU gagal satu SKU | Seluruh reservasi dan status di-rollback |
| Pembatalan sebelum kirim | Reservasi dilepas satu kali |
| Pengiriman | Fisik dan reservasi turun; riwayat dan capaian terkirim berubah |
| Pengiriman ditekan dua kali | Hanya satu mutasi keluar |
| Pelanggan tanpa riwayat cukup | Tidak menerima perkiraan interval otomatis |
| Stok berubah setelah rekomendasi dibuka | Konfirmasi memakai saldo terbaru, dan rekomendasi ikut diperbarui |
| Rekomendasi selesai atau ditunda | Tidak muncul lagi sebagai pekerjaan yang sama sebelum pemicu baru/jadwalnya |
| Sales mencoba mengubah stok | Server menolak |
| Koreksi fisik mengungkap kekurangan terhadap reservasi | Konflik terlihat dan penjualan baru SKU diblokir |

Target penerimaan: tidak ada kelebihan komitmen akibat konfirmasi aplikasi, tidak ada mutasi ganda, dan semua transisi tercatat. Ini berbeda dari klaim tidak mungkin ada selisih fisik gudang.

### 10.3 Evaluasi rekomendasi

Siapkan 20 kasus dengan jawaban yang ditentukan berdasarkan aturan sebelum eksekusi. Ukur jumlah kandidat benar, kandidat keliru, pemicu yang terlewat, serta alasan yang cocok dengan rekaman sumber. Jalankan ulang setelah reservasi berubah.

Bandingkan:

- Baseline A: daftar pelanggan diurutkan dari pembelian terlama.
- Baseline B: aturan pelanggan/tindak lanjut yang sama tetapi tanpa pemeriksaan stok.
- OneFlow: aturan tersebut ditambah ketersediaan setelah reservasi dan penjelasan sumber.

Laporkan berapa rekomendasi pemenuhan yang tidak layak pada masing-masing metode, bukan hanya apakah tampilan terlihat bagus. Jika OneFlow tidak menunjukkan keuntungan pada kasus yang diuji, revisi aturan atau batasi klaim. Uji sintetis membuktikan perilaku rancangan; belum membuktikan peningkatan penjualan nyata.

### 10.4 Uji kegunaan dan rencana dampak

Uji awal dengan lima peserta yang mewakili tingkat kemampuan pengguna awam, masing-masing melakukan tugas mencari riwayat, menentukan tindak lanjut, membuat pesanan, dan menemukan kendala stok. Urutan penggunaan spreadsheet dan aplikasi dibuat bergantian agar efek latihan berkurang. Laporkan median waktu, keberhasilan tugas, dan kesalahan. Peserta mahasiswa merupakan proxy, bukan validasi CV Arbain.

Pilot yang diusulkan kepada mitra menggunakan lima hari kerja baseline dan lima hari kerja penggunaan terbatas, disertai tugas berpasangan dengan data setara. Ukur waktu pencarian riwayat, waktu pencatatan pesanan, proporsi tindak lanjut yang diselesaikan, dan selisih hasil hitung fisik terhadap saldo tercatat. Kondisi operasional harian dan jumlah pengguna dicatat. Periode singkat ini tidak cukup untuk menyimpulkan kenaikan omzet atau mengisolasi semua pengaruh bisnis.

Persentase perubahan waktu dihitung dari pengukuran yang benar-benar ada: (median baseline − median OneFlow) / median baseline × 100%. Jangan mengganti baseline yang belum diukur dengan angka perkiraan.

## 11. Skenario demo utama selama sekitar tiga menit

**Pembukaan:** “Pada data simulasi ini, sales perlu menindaklanjuti pelanggan yang biasa membeli ulang. Namun sebagian barang sudah direservasi untuk pelanggan lain.”

| Waktu indikatif | Aksi | Bukti yang dilihat juri |
|---|---|---|
| 0:00–0:30 | Buka pelanggan dan Action Center | Riwayat, alasan tindak lanjut, sales pemilik, dan stok tersedia |
| 0:30–1:10 | Sales A mengonfirmasi 8 unit dari 10 unit yang tersedia | Fisik tetap 10, reservasi 8, tersedia 2 |
| 1:10–1:40 | Sales B mencoba mengonfirmasi 8 unit SKU yang sama | Server menolak; stok tidak dijanjikan dua kali |
| 1:40–2:15 | Gudang mengirim pesanan Sales A | Fisik 2, reservasi 0, tersedia 2; riwayat pelanggan dan nilai pesanan terkirim berubah |
| 2:15–2:45 | Gudang mencatat 10 unit masuk lalu daftar dimuat ulang | Fisik 12, reservasi 0, tersedia 12; kendala stok pada pelanggan B dapat berubah menjadi tindak lanjut yang layak |
| 2:45–3:00 | Manajer melihat ringkasan dan mutasi | Siapa melakukan apa, kapan, dan bagaimana hasilnya |

Kasus kedua untuk tanya jawab: batalkan pesanan dikonfirmasi sebelum dikirim dan tunjukkan reservasi kembali tersedia. Kasus ketiga: tekan pengiriman dua kali dan tunjukkan satu mutasi.

Gunakan dua tab atau sesi demo sesuai peran. Sediakan rekaman cadangan alur yang sama dengan label rekaman demo. Rekaman bukan bukti pengujian bisnis nyata.

## 12. Strategi proposal menurut bobot NP

| Kriteria dari pengguna | Bobot | Isi utama | Bukti pendukung |
|---|---:|---|---|
| Masalah dan solusi | 20% | Peta masalah–pengguna–keputusan–fitur | Materi tantangan dan catatan wawancara jika tersedia |
| Tema dan kedalaman teknologi | 22% | Relasi data, reservasi, konsistensi, pemeriksaan kelayakan, penjelasan rekomendasi | Model data, aturan, pengujian transaksi, evaluasi baseline |
| Inovasi dan kelayakan rancangan | 28% | Pusat tindakan yang menggabungkan pelanggan dan stok, batas tiga hari, pembanding yang jujur | Skenario perubahan stok, batas MVP, daftar penerimaan |
| Hilirisasi dan dampak | 20% | Onboarding, pilot, ukuran manfaat, dukungan operasional | Rencana migrasi, pengukuran tugas, rencana penggunaan dan biaya |
| Komponen lokal dan KI | 10% | Kontribusi tim, penyesuaian proses, asal komponen, dokumentasi karya | Daftar kontribusi, inventaris dependensi/lisensi, rencana KI |

Inovasi/kelayakan dan tema/kedalaman teknologi berjumlah 50% dari bobot yang diberikan. Alokasikan ruang proposal untuk mekanisme dan pembuktiannya. Tetap gunakan 50% sisanya untuk kebutuhan nyata, pemanfaatan, dan kontribusi.

Ambang NP 2,80 tidak dapat digunakan menghitung target skor tanpa skala resmi. Jangan mengklaim nilai tertentu akan diberikan oleh juri. Review internal dilakukan dengan pertanyaan: apakah setiap klaim memiliki sumber, keputusan desain, rencana uji, atau hasil yang benar-benar tersedia?

### Draf ringkasan konsep untuk disesuaikan dengan template

CV Arbain membutuhkan keterhubungan informasi pelanggan, aktivitas sales, dan stok untuk membantu koordinasi serta pemantauan bisnis. Tim mengusulkan Arbain OneFlow, sebuah CRM terintegrasi untuk penjualan produk jadi yang menyatukan profil dan riwayat pelanggan, pencatatan aktivitas sales, pesanan, serta persediaan. Pusat tindakan menggunakan tanggal tindak lanjut, pola pembelian, dan stok setelah reservasi untuk menyajikan rekomendasi beserta alasan dan penanggung jawab. Konfirmasi pesanan mereservasi barang, sedangkan pengiriman memperbarui stok fisik tercatat, riwayat pelanggan, dan capaian sales melalui transaksi database yang konsisten. MVP dirancang untuk dibangun dalam tiga hari dengan data simulasi. Evaluasi direncanakan melalui pengujian integritas transaksi, perbandingan rekomendasi dengan baseline sederhana, dan pengukuran waktu tugas. Pilot serta migrasi data nyata diusulkan untuk divalidasi bersama mitra. Pendekatan ini ditujukan untuk mengurangi pekerjaan penelusuran data dan membantu tindak lanjut yang sesuai ketersediaan barang; besar dampaknya akan ditetapkan berdasarkan hasil pengujian.

## 13. Hilirisasi, biaya, komponen lokal, dan KI

**Pilot yang diusulkan:** satu gudang dan kelompok sales terbatas. Tahapan: wawancara alur, penetapan kode pelanggan/SKU, pemeriksaan fisik awal, pemetaan sumber lama, migrasi data terpilih, pelatihan, penggunaan terbatas, evaluasi, dan keputusan perluasan. Akses data dan jadwal memerlukan persetujuan mitra; belum ada pilot yang dijanjikan.

**Jalur migrasi:** mulai dari daftar pelanggan dan produk; profil yang berpotensi duplikat diperiksa manual. Saldo awal harus disepakati setelah hitungan gudang. Riwayat yang berhasil dibersihkan diberi tanggal dan sumber. Catatan yang belum jelas ditandai untuk pemeriksaan; tidak dipakai menghitung pola pembelian.

**Model keberlanjutan yang diusulkan:** implementasi dan pelatihan awal, lalu pemeliharaan aplikasi serta dukungan penggunaan. Kesediaan mitra membayar, kepemilikan aplikasi, dan model kerja sama harus dibahas; belum ada harga pasar atau pendapatan yang terbukti.

**Biaya:** catat biaya aktual satu aplikasi, database, backup, domain bila digunakan, dan pemeliharaan. Bila fungsi AI diaktifkan, catat biaya pemakaian terpisah. Estimasi dibuat dari layanan yang benar-benar dipilih dan jumlah pemakaian; dokumen ini tidak menetapkan harga layanan yang belum dipilih. Laporan pilot menghitung nilai waktu yang dihemat menggunakan waktu terukur dan biaya tenaga kerja yang disepakati mitra.

**Kontribusi lokal:** dokumentasikan analisis proses, kode aplikasi buatan tim, desain UI Bahasa Indonesia, aturan rekomendasi, dataset uji, dan dokumentasi. Sebutkan komponen pihak ketiga dan asalnya. UI lokal atau kode buatan mahasiswa tidak otomatis membuktikan persentase komponen lokal tertentu; perhitungan mengikuti definisi panitia.

**Rencana KI:** inventaris karya dan kontribusi pencipta, dokumentasi kode/versi, daftar dependensi dan lisensinya, serta konsultasi pencatatan hak cipta program komputer melalui Sentra KI. DJKI mencantumkan program komputer sebagai objek hak cipta [S7]. Tidak ada klaim telah memperoleh hak, memenuhi kebaruan paten, atau memiliki hak atas komponen pihak ketiga. Penggunaan nama/identitas mitra dan skema kerja sama perlu dibahas bersama mitra dan penyelenggara.

UMS menyebut pengaturan kerja sama penggunaan inovasi, termasuk pendapatan, royalti, kontrak, dan kemungkinan hak eksklusif masih dibahas [S2]. Proposal tidak menganggap model kepemilikan tertentu sudah disepakati.

## 14. Prioritas pembangunan dan aturan menghentikan penambahan fitur

Ini pembagian hasil selama tiga hari, bukan daftar tugas implementasi terperinci.

| Hari | Hasil | Syarat melanjutkan |
|---|---|---|
| 1 | Model data, akses tiga peran, pelanggan, produk, aktivitas, data simulasi dan saldo awal | Relasi valid, pengguna bisa mengakses sesuai peran, riwayat dapat ditampilkan |
| 2 | Draft/konfirmasi/batal/kirim, mutasi, reservasi, dashboard | Uji saldo, status, pengulangan operasi, dan dua konfirmasi bersamaan lulus |
| 3 | Action Center, alasan, hasil tindakan, evaluasi, perbaikan UI, latihan demo | Data simulasi jelas, alur tiga menit dapat diulang, batas produk dapat dijelaskan |

Jika akhir hari kedua alur transaksi belum stabil, hari ketiga difokuskan pada perbaikan dan aturan tindak lanjut yang paling sederhana. Impor CSV dan AI opsional hanya dikerjakan setelah seluruh syarat wajib terpenuhi. Kelayakan tiga hari bergantung pada jumlah anggota, waktu efektif, dan penggunaan stack yang sudah dikuasai; kemampuan full stack tidak menghapus batas kapasitas.

Tunda hingga fase selanjutnya: maklon, produksi, FEFO/batch, multi-gudang, pengiriman sebagian, retur, pembayaran, akuntansi, integrasi WhatsApp resmi, optimasi rute, kampanye otomatis, dan model ML terlatih.

## 15. Validasi yang paling bernilai sebelum atau selama pendampingan

Pertanyaan wawancara yang siap digunakan oleh tim:

1. Mohon ceritakan satu pesanan terakhir dari komunikasi pelanggan sampai barang keluar: siapa mencatat apa dan di mana?
2. Kapan barang dianggap sudah dipesan, bagaimana barang tersebut ditandai, dan bagaimana pembatalan ditangani?
3. Dalam satu minggu terakhir, contoh apa yang menunjukkan tindak lanjut terlambat atau selisih stok, dan bagaimana dampaknya dicatat?
4. Data pelanggan, transaksi, dan stok apa yang boleh diberikan dalam bentuk anonim untuk pengujian?
5. Untuk produk jadi, bagaimana satuan, retur, batch/kedaluwarsa, dan tanggung jawab koreksi stok ditangani?

Tim dapat menggunakan daftar ini untuk wawancara setelah memperoleh akses mitra. Tidak ada pesan atau undangan yang dikirim melalui dokumen ini.

Jawaban dicatat sebagai kejadian nyata, lengkap dengan tanggal dan izin penggunaan bukti. Angka kerugian, jumlah pelanggan, jumlah sales, omzet, atau waktu kerja tidak diisi berdasarkan perkiraan tim.

## 16. Jawaban untuk pertanyaan juri

| Pertanyaan | Jawaban yang dapat dipertanggungjawabkan |
|---|---|
| Apa yang membedakan dari CRM biasa? | Pusat tindakan yang memadukan riwayat pelanggan, tindak lanjut, dan stok setelah reservasi, disertai alasan serta pencatatan hasil. Nilai penyesuaian lokal akan diuji. |
| Mengapa tidak langsung menggunakan Odoo atau Zoho? | Produk tersebut sudah mempunyai fondasi kuat. Tim menguji apakah alur yang lebih terfokus sesuai kebutuhan mitra. Jika konfigurasi produk yang ada lebih efektif dan ekonomis, keputusan adopsi perlu mengikuti hasil uji tersebut. |
| Apakah ini AI? | Mesin inti MVP berbasis aturan dan skor transparan. AI generatif hanya opsional untuk draf. Model yang dilatih dari data nyata merupakan fase lanjutan. |
| Bagaimana bisa tahu pelanggan akan membeli lagi? | Sistem menyajikan indikasi dari interval historis, bukan kepastian pembelian. Riwayat minim menggunakan tindak lanjut manual. |
| Bagaimana memastikan stok benar? | Aplikasi menjaga mutasi dan reservasi serta mendukung pemeriksaan fisik. Ketepatan kondisi gudang tetap bergantung pada pencatatan kejadian dan rekonsiliasi. |
| Apa bukti dampak bisnisnya? | Saat ini rancangan uji dan data simulasi. Hasil yang terukur baru disampaikan setelah pengujian; peningkatan penjualan tidak diklaim dari demo. |
| Mengapa bisa selesai tiga hari? | Lingkup dibatasi pada satu gudang, produk jadi, pengiriman penuh, stack yang dikuasai, dan satu mesin rekomendasi sederhana. Fitur tambahan memiliki syarat pengerjaan. |

## 17. Sumber dan batas penggunaan

Sumber diakses 11 Oktober 2026. Ringkasan sumber dipakai untuk fakta lomba, pembanding, dan rencana KI; mekanisme OneFlow merupakan usulan tim.

- **[S1] UMS iHub, ARB-02:** https://ihub.ums.ac.id/hackathon/tantangan/arb-02-integrasi-data-pelanggan-aktivitas-sales-dan-stok — kebutuhan CRM dan status dukungan mitra.
- **[S2] Berita UMS, 10 Oktober 2026:** https://news.ums.ac.id/id/berita/health-innovation-hackathon-2026-ums-buka-peluang-bagi-peserta-multidisiplin/ — purwarupa belum wajib saat pendaftaran, pilot/hilirisasi, dan kerja sama yang masih dibahas.
- **[S3] Odoo, CRM activities:** https://www.odoo.com/documentation/19.0/applications/sales/crm/optimize/utilize_activities.html — aktivitas tindak lanjut CRM.
- **[S4] Odoo, reservation methods:** https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/shipping_receiving/reservation_methods.html — reservasi barang untuk pemenuhan penjualan.
- **[S5] Zoho Inventory, CRM integration:** https://www.zoho.com/us/inventory/help/integrations/crm-integrations.html — integrasi pelanggan, pesanan, dan koordinasi fungsi.
- **[S6] Zoho CRM, Zia Next Best Experience:** https://help.zoho.com/portal/en/kb/crm/zia-artificial-intelligence/recommendation/articles/zia-next-best-experience-new — rekomendasi tindakan berdasarkan konteks rekaman pelanggan.
- **[S7] DJKI, pengenalan hak cipta:** https://www.dgip.go.id/menu-utama/hak-cipta/pengenalan — program komputer dalam lingkup hak cipta.
- **[S8] UMS iHub, halaman program:** https://ihub.ums.ac.id/hackathon — tahapan dan tautan pedoman/template. Isi pedoman lengkap belum berhasil dibaca.

## 18. Status tinjauan dan tahap berikutnya

Rancangan ini menyatukan keputusan yang telah dibahas: fokus awal produk jadi, tiga fungsi terintegrasi, manfaat unggulan berupa tindak lanjut sales yang mempertimbangkan stok, data demo sintetis, dan pembangunan maksimal tiga hari. Seluruh hasil pengujian, validasi mitra, dan klaim keunggulan bisnis masih harus dihasilkan melalui kegiatan yang direncanakan.

Tahap berikutnya adalah tinjauan pengguna terhadap cakupan, aturan keputusan, dan alur demo dalam dokumen ini. Setelah rancangan tertulis disetujui, rencana implementasi terperinci dapat disusun. Tidak ada kode aplikasi yang telah ditulis pada tahap rancangan ini.
