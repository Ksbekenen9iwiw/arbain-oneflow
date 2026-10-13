# Protokol uji kegunaan — belum dilaksanakan

Tujuan: mengukur apakah OneFlow membantu menyelesaikan empat tugas dengan lebih cepat dan lebih sedikit kesalahan dibanding pencatatan terpisah. Ini uji mahasiswa sebagai proxy pengguna; validasi CV Arbain tetap memerlukan mitra.

Rekrut lima peserta dengan kemampuan komputer beragam. Beri pengantar dua menit dan latihan singkat yang tidak termasuk tugas uji. Gunakan pelanggan/SKU fiktif dan dua set data A/B yang setara; satu disajikan sebagai spreadsheet terpisah (pelanggan, aktivitas, stok), satu dalam aplikasi.

| Peserta | Urutan alat | Set data pertama / kedua |
|---|---|---|
| P01 | Spreadsheet → OneFlow | A / B |
| P02 | OneFlow → Spreadsheet | A / B |
| P03 | Spreadsheet → OneFlow | B / A |
| P04 | OneFlow → Spreadsheet | B / A |
| P05 | Spreadsheet → OneFlow | A / B |

Lima peserta membuat penyeimbangan urutan tidak sempurna; laporkan hal tersebut dan kemampuan peserta. Jangan menyamakan hasil ini dengan kondisi operasional mitra.

| Tugas | Instruksi peserta | Kriteria benar |
|---|---|---|
| T1 | Cari riwayat pelanggan yang disebutkan | Menyebut tanggal, SKU, jumlah, dan status pesanan terakhir yang benar |
| T2 | Tentukan pelanggan yang perlu ditindaklanjuti | Memilih pemicu jatuh tempo dan menyebut alasan sumber, bukan hanya skor |
| T3 | Catat pesanan 8 unit dari stok 10 yang sudah terreservasi 8 | Mencatat draft dan mengetahui bahwa jumlah penuh belum bisa dikonfirmasi |
| T4 | Temukan kendala stok dan pelaksana koreksi | Menunjukkan SKU bermasalah, tersedia, jumlah reservasi, alasan dan pelaksana pada data |

Waktu dimulai setelah instruksi dibacakan dan dihentikan saat peserta menyatakan selesai. Moderator tidak memberi petunjuk saat timer berjalan. Catat permintaan bantuan, salah pelanggan/SKU/jumlah, dan salah menafsirkan stok. Tetapkan batas lima menit per tugas; jika tidak selesai, catat gagal beserta durasi batas, tanpa mengganti dengan angka nol.

Salin baris berikut untuk setiap peserta, alat, dan tugas: total 5 × 2 × 4 = 40 observasi. Kolom kosong belum merupakan hasil.

| Peserta | Alat | Set | Tugas | Waktu (detik) | Berhasil (ya/tidak) | Kesalahan | Bantuan | Catatan |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |

Analisis per tugas dan alat: median durasi, jumlah berhasil dari lima percobaan, serta jumlah/jenis kesalahan. Laporkan durasi keberhasilan dan jumlah kegagalan secara terpisah agar kegagalan tidak tersembunyi. Bandingkan pasangan peserta yang sama dan catat kemungkinan efek latihan.

Perubahan waktu (%) = (median spreadsheet − median OneFlow) / median spreadsheet × 100%. Hitung hanya bila kedua median tersedia dan median baseline > 0. Nilai negatif berarti aplikasi lebih lambat. Jangan mengisi waktu, kesalahan, atau persentase dengan perkiraan.

Pertanyaan setelah tugas: “Bagian mana yang paling sulit?”, “Informasi apa yang belum jelas?”, dan “Bagaimana Anda memastikan barang benar-benar tersedia?” Simpan jawaban anonim dengan persetujuan peserta.

Pilot mitra yang diusulkan: lima hari baseline dan lima hari penggunaan terbatas, sambil mencatat jumlah pengguna, volume transaksi, waktu pencarian/pencatatan, penyelesaian tindak lanjut, dan selisih hasil hitung fisik. Jadwal, akses data, dan besarnya dampak belum disepakati atau diukur.
