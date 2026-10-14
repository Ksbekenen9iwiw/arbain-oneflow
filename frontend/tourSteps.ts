import type { Page } from "./types";

export type TourStep = {
  id: string;
  target: string;
  title: string;
  description: string;
  mode?: "overview";
  action?: string;
  destination: string;
  empty?: string;
  skip?: number;
};
export function tourSteps(role: Page["role"]): TourStep[] {
  return [
    ...(role !== "WAREHOUSE"
      ? [
          {
            id: "customers",
            target: "nav-customers",
            title: "Mulai dari pelanggan",
            description:
              "Profil, hasil kunjungan, dan pesanan pelanggan terhubung di sini.",
            action: "Klik Pelanggan di sidebar.",
            destination: "customers",
          },
          {
            id: "customer",
            target: "customer-record",
            title: "Kenali riwayat pelanggan",
            description:
              "Buka salah satu pelanggan untuk melihat interaksi terakhir dan aktivitas berikutnya.",
            action: "Klik nama pelanggan yang disorot.",
            destination: "customer_detail",
            empty:
              "Belum ada pelanggan pada daftar ini. Nanti, klik nama pelanggan untuk membuka profil dan riwayatnya.",
            skip: 4,
          },
          {
            id: "customer-overview",
            mode: "overview" as const,
            target: "customer-overview",
            title: "Ringkasan hubungan dengan pelanggan",
            description:
              "Area ini merangkum interaksi terakhir dan pesanan terbaru. Anda bisa melihat hasil percakapan sebelumnya, status transaksi terakhir, serta jumlah pesanan yang menunggu pengiriman.",
            destination: "customer_detail",
          },
          {
            id: "customer-orders",
            target: "customer-orders",
            title: "Hubungkan interaksi dengan pesanan",
            description:
              "Riwayat pelanggan memuat hasil aktivitas. Tab Pesanan menampilkan transaksi pelanggan yang sama.",
            action: "Klik tab Pesanan.",
            destination: "customer_detail",
          },
          {
            id: "customer-orders-overview",
            mode: "overview" as const,
            target: "customer-orders-overview",
            title: "Pesanan milik pelanggan ini",
            description:
              "Daftar ini hanya memuat pesanan pelanggan yang sedang dibuka, sesuai akses akun Anda. Nomor pesanan membuka detail transaksi; status dan total membantu Anda mengikuti prosesnya. Jika belum ada pesanan, area ini menampilkan keterangan kosong.",
            destination: "customer_detail",
          },
        ]
      : []),
    {
      id: "orders",
      target: "nav-orders",
      title:
        role === "WAREHOUSE" ? "Mulai dari pesanan" : "Pantau seluruh pesanan",
      description:
        role === "WAREHOUSE"
          ? "Buka Pesanan untuk memeriksa antrean pengiriman. Status membantu membedakan pesanan yang sudah dikonfirmasi dan yang sudah terkirim."
          : "Halaman Pesanan mengumpulkan transaksi yang dapat diakses akun Anda, lengkap dengan status dan filter.",
      action: "Klik Pesanan di sidebar.",
      destination: "orders",
    },
    {
      id: "order",
      target: "order-record",
      title: "Periksa sebelum memproses",
      description:
        "Detail pesanan memuat pelanggan, produk, jumlah, dan status. Tindakan yang tersedia mengikuti peran dan status pesanan.",
      action: "Klik nomor pesanan yang disorot.",
      destination: "order_detail",
      empty:
        "Belum ada pesanan pada daftar ini. Saat tersedia, klik nomor pesanan untuk memeriksa produk dan statusnya.",
      skip: 3,
    },
    {
      id: "order-overview",
      mode: "overview" as const,
      target: "order-overview",
      title: "Ini rincian pesanan yang dibuka",
      description:
        "Periksa produk, jumlah, harga satuan, subtotal, dan total pesanan di area ini. Keterangan di atas tabel menjelaskan hubungan status pesanan dengan stok. Anda belum perlu memproses atau mengubah apa pun.",
      destination: "order_detail",
    },
    {
      id: "order-history-overview",
      mode: "overview" as const,
      target: "order-history-overview",
      title: "Lihat perjalanan pesanan",
      description:
        "Riwayat ini menunjukkan tahapan yang sudah terjadi, waktu pencatatan, dan pelakunya jika tersedia. Dari sini Anda bisa menelusuri kapan pesanan dibuat, dikonfirmasi, dikirim, atau dibatalkan.",
      destination: "order_detail",
    },
    {
      id: "stock",
      target: "nav-stock",
      title: "Cek ketersediaan produk",
      description:
        "Stok tersedia sudah memperhitungkan reservasi pesanan. Perhatikan status menipis dan stok habis sebelum menjanjikan pengiriman.",
      action: "Klik Produk & stok di sidebar.",
      destination: "stock",
    },
    {
      id: "product",
      target: "product-record",
      title:
        role === "SALES"
          ? "Periksa produk sebelum menawarkan"
          : "Telusuri perubahan stok",
      description:
        role === "SALES"
          ? "Buka produk untuk memeriksa jumlah tersedia, kondisi stok, dan harga satuan sebelum menawarkan ke pelanggan."
          : "Buka produk untuk melihat saldo, riwayat mutasi, dan reservasinya. Panduan ini tidak mengubah stok.",
      action: "Klik nama produk yang disorot.",
      destination: "product_detail",
      empty:
        "Belum ada produk pada daftar ini. Saat tersedia, klik nama produk untuk menelusuri stok dan mutasinya.",
      skip: 2,
    },
    {
      id: "product-overview",
      mode: "overview" as const,
      target: "product-overview",
      title: "Baca ketersediaan produk",
      description:
        role === "SALES"
          ? "Angka Tersedia menunjukkan jumlah yang masih bisa ditawarkan setelah reservasi diperhitungkan. Kondisi stok memberi tanda apakah persediaan cukup, menipis, atau habis. Periksa waktu pembaruan saldonya sebelum menindaklanjuti pelanggan."
          : "Fisik adalah saldo barang tercatat, Reservasi adalah jumlah yang dialokasikan untuk pesanan, dan Tersedia adalah selisih keduanya. Kondisi stok serta waktu pembaruan membantu Anda menentukan apakah persediaan perlu diperiksa.",
      destination: "product_detail",
    },
    {
      id: "dashboard",
      target: "nav-dashboard",
      title: "Kembali ke pekerjaan hari ini",
      description:
        role === "WAREHOUSE"
          ? "Dashboard merangkum pengiriman dan stok yang perlu diperhatikan. Mulai pekerjaan harian Anda dari sana."
          : "Dashboard merangkum aktivitas, pesanan, dan capaian sesuai peran Anda. Gunakan tindakan di sana untuk melanjutkan pekerjaan.",
      action: "Klik Dashboard di sidebar.",
      destination: "today",
    },
  ];
}
export function stepCompleted(
  step: TourStep,
  page: Pick<Page, "screen" | "url">,
  revision: number,
  armedAt: number | null,
) {
  if (step.mode === "overview") return false;
  if (armedAt === null || page.screen !== step.destination) return false;
  if (step.id === "customer-orders")
    return new URLSearchParams(page.url.split("?")[1]).get("tab") === "orders";
  return revision > armedAt;
}
export function placeHint(
  target: { left: number; right: number; top: number; bottom: number },
  width: number,
  height: number,
  viewport: { width: number; height: number },
  gap: number,
) {
  let left = target.right + gap;
  let top = target.top;
  if (left + width > viewport.width - gap) {
    if (target.left - gap - width >= gap) left = target.left - gap - width;
    else {
      left = target.left;
      top = target.bottom + gap;
      if (top + height > viewport.height - gap) top = target.top - height - gap;
    }
  }
  return {
    left: Math.max(gap, Math.min(left, viewport.width - width - gap)),
    top: Math.max(gap, Math.min(top, viewport.height - height - gap)),
  };
}
