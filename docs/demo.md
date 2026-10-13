# Demo Arbain OneFlow — sekitar tiga menit

Gunakan data simulasi yang baru dibuat dengan tanggal acuan hari presentasi. Semua nama, produk, harga, dan stok merupakan contoh. Siapkan sesi browser terpisah untuk Nadia, Rafi, Gudang, dan Manajer; tab dalam satu profil berbagi login, sehingga tidak cukup untuk empat akun.

Buka masing-masing sesi di http://127.0.0.1:8000/. Simpan password dari seed. Pastikan MADU01 berawal fisik 10, reservasi 0, tersedia 10. Pesanan historis dan satu pesanan HERBAL02 yang menunggu kirim adalah bagian dataset; pilih pesanan baru MADU01 selama demo.

| Waktu | Tindakan | Narasi dan bukti |
|---|---|---|
| 0:00–0:30 | Nadia membuka Hari Ini lalu profil CUS001, Apotek Sehat | “Riwayat pembelian dan stok menjadi alasan tindak lanjut.” Tunjukkan tiga tanggal, interval 30 hari, acuan 8 unit, tersedia 10. |
| 0:30–1:10 | Buat draft CUS001, MADU01, 8 unit; konfirmasi | “Draft belum mengambil stok. Konfirmasi mencadangkan barang.” Gudang melihat fisik 10, reservasi 8, tersedia 2. |
| 1:10–1:40 | Rafi membuka daftar terbaru, lalu membuat draft CUS007, Toko Herbal Lestari, 8 unit MADU01; coba konfirmasi | “Dua sales membaca sumber yang sama.” Muncul INSUFFICIENT_STOCK; draft tetap ada, tersedia tetap 2. |
| 1:40–2:15 | Gudang membuka pesanan MADU01 Nadia dan mencatat pengiriman penuh | Fisik 2, reservasi 0, tersedia 2. Buka ulang profil CUS001: pesanan berstatus terkirim dan nilai barang tercatat. |
| 2:15–2:45 | Gudang mencatat barang masuk MADU01 sebanyak 10, alasan “Barang masuk demo”; Rafi memuat ulang Hari Ini | Fisik 12, reservasi 0, tersedia 12. Kartu CUS007 berubah dari koordinasi stok menjadi siap ditindaklanjuti. |
| 2:45–3:00 | Manajer memuat ulang dashboard dan membuka mutasi | “Kejadian penjualan memperbarui pelanggan, capaian terkirim, dan stok.” Tunjukkan penambahan Rp400.000, pelaksana, waktu, dan satu mutasi keluar. |

Tutup dengan kalimat: “OneFlow membantu sales mengetahui siapa yang perlu dihubungi dan jumlah yang tersedia, sementara gudang serta manajer dapat menelusuri keputusan yang sama.”

**Untuk tanya jawab:** konfirmasikan draft Rafi setelah stok masuk, lalu batalkan dengan alasan; reservasi kembali nol. Klik/ulang POST pengiriman pesanan Nadia tidak membuat mutasi kedua. Untuk konflik fisik, buat reservasi 8 kemudian hitung fisik 5; tersedia −3 dan konfirmasi baru ditolak. Skenario terakhir mengubah data latihan, jadi lakukan setelah demo utama.

**Bukti tambahan:** jalankan evaluator dan buka JSON hasil aktual. Jelaskan bahwa 20 kasus sintetis menguji aturan; jangan menyebutnya sebagai peningkatan omzet, hasil pilot, akurasi ML, atau peluang memenangkan lomba.

**Demo edit harga — tambahan sekitar 45 detik sesudah alur utama:**

1. Manajer membuka **Produk & Stok → MADU01 → Edit produk/harga**. Tunjukkan harga tersimpan Rp50.000.
2. Isi harga `55000`. Panel pratinjau memperlihatkan Rp55.000 dan selisih +Rp5.000. Simpan.
3. Buka pesanan Nadia yang sudah terkirim: 8 botol tetap bernilai Rp400.000. Buat draft baru 8 botol untuk menunjukkan harga Rp55.000 dan total Rp440.000; draft ini belum mereservasi barang.
4. Tutup dengan: “Perubahan katalog berlaku untuk pesanan baru; riwayat pesanan dan saldo stok tetap konsisten.” Jika waktu demo hanya tiga menit, gunakan bagian ini saat tanya jawab.

Bagian ini mengasumsikan harga awal dari seed belum diubah sebelum alur utama. Gunakan data latihan terpisah saat mengulang demonstrasi.

**Checklist visual yang harus dijalankan tim:** browser QA belum dilakukan pada lingkungan pembangunan.

- [ ] Uji ukuran 390×844 dan 1366×768 pada browser yang dipakai saat presentasi.
- [ ] Keempat menu terbaca, tombol tidak terpotong, dan halaman tidak meluber; tabel boleh digulir dalam wadahnya.
- [ ] Tab keyboard menampilkan fokus; label/error form terlihat dekat field.
- [ ] Tambah dua produk, hapus satu baris, dan simpan draft dengan jumlah yang benar.
- [ ] Buka form edit, ubah harga, dan pastikan pratinjau harga serta selisihnya mengikuti input.
- [ ] Simpan perubahan produk, periksa harga di katalog, lalu bandingkan harga pesanan lama dengan draft baru.
- [ ] Kartu produk pada telepon menjadi satu kolom; form edit dan panel pratinjau tetap terbaca.
- [ ] Tiga peran menjalankan tugas masing-masing dalam sesi berbeda.
- [ ] Penanda simulasi, alasan rekomendasi, saldo terbaru, dan pelaksana mutasi terbaca.
- [ ] Seed baru digunakan untuk setiap latihan alur utama; backup tidak dihapus.

Rekaman cadangan dapat dibuat tim setelah checklist lulus dengan label “rekaman demo data simulasi”. Tidak ada rekaman atau publikasi otomatis dalam paket ini.
