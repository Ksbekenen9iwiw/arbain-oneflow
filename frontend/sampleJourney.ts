// Presentation only. Django remains authoritative for action permissions.
export function sampleJourney(
  sample: {
    status: string;
    fulfillment_status: string;
    outcome: string;
  },
  role = "MANAGER",
) {
  if (sample.status === "CANCELLED")
    return {
      title: "Pengajuan dibatalkan",
      description:
        "Tidak ada pengiriman berikutnya untuk pengajuan ini. Alasan pembatalan tersimpan di jejak proses.",
    };
  if (sample.status === "REJECTED")
    return {
      title: "Pengajuan belum disetujui",
      description:
        "Baca alasan keputusan sebelum merencanakan penawaran berikutnya. Stok tidak dikurangi.",
    };
  if (sample.status === "DRAFT")
    return {
      title: "Siap untuk ditinjau?",
      description:
        "Periksa produk, jumlah, dan tujuan pemberian. Ajukan draf agar manajer dapat mengambil keputusan. Stok belum direservasi.",
    };
  if (sample.status === "SUBMITTED")
    return {
      title: "Menunggu keputusan manajer",
      description:
        role === "MANAGER"
          ? "Tinjau rekomendasi bersama riwayat pelanggan. Rekomendasi sistem adalah pertimbangan, bukan persetujuan otomatis."
          : "Manajer akan meninjau rekomendasi dan riwayat pelanggan. Pengajuan belum mengurangi stok.",
    };
  if (sample.fulfillment_status === "WAITING")
    return {
      title: "Disetujui · siap disiapkan gudang",
      description:
        role === "SALES"
          ? "Gudang menyiapkan batch yang dialokasikan. Anda dapat memantau pengiriman dari halaman ini."
          : "Periksa alokasi batch sebelum mengirim. Pengiriman sampel mengurangi stok tanpa menambah omzet.",
    };
  if (sample.fulfillment_status === "SHIPPED")
    return {
      title: "Dalam pengiriman",
      description:
        "Tandai diterima setelah pelanggan mengonfirmasi penerimaan. Setelah itu, sales dapat menjadwalkan evaluasi.",
    };
  if (role === "WAREHOUSE")
    return {
      title: "Penerimaan sampel selesai",
      description:
        "Sales melanjutkan evaluasi dan tindak lanjut pelanggan. Jejak pengiriman tetap tersedia di halaman ini.",
    };
  if (sample.outcome === "PURCHASED")
    return {
      title: "Evaluasi selesai · pelanggan membeli",
      description:
        "Pembelian ditautkan ke pesanan terkirim. Sampel tetap tercatat sebagai pengeluaran stok tanpa omzet; nilai penjualan berasal dari pesanan.",
    };
  if (sample.outcome === "NOT_INTERESTED")
    return {
      title: "Evaluasi selesai · belum berminat",
      description:
        "Tanggapan pelanggan tersimpan sebagai dasar penawaran berikutnya. Perbarui evaluasi jika kebutuhannya berubah.",
    };
  return {
    title:
      sample.outcome === "NOT_FOLLOWED_UP"
        ? "Sampel diterima · waktunya tindak lanjut"
        : "Evaluasi pelanggan",
    description:
      "Catat tanggapan dan sepakati jadwal berikutnya. Jika pelanggan memesan, buat pesanan terlebih dahulu lalu tautkan setelah barang terkirim.",
  };
}
