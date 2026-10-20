export type RequestIssue = {
  title: string;
  description: string;
  retry: { url: string; replace: boolean } | null;
};

/** A failed write has an unknown outcome. Never offer to replay its POST. */
export function requestIssue(
  url: string,
  isWrite: boolean,
  replace = false,
): RequestIssue {
  if (url.split("?")[0] === "/login/")
    return {
      title: "Belum dapat terhubung ke OneFlow",
      description:
        "Periksa koneksi, lalu coba masuk kembali. Isian tetap tersedia.",
      retry: null,
    };
  return isWrite
    ? {
        title: "Status penyimpanan belum dapat dipastikan",
        description:
          "Koneksi terputus. Isian tetap ada di halaman ini. Periksa riwayat di tab lain sebelum mengirim ulang agar tidak tercatat dua kali.",
        retry: null,
      }
    : {
        title: "Halaman belum berhasil dimuat",
        description:
          "Periksa koneksi, lalu coba lagi. Halaman sebelumnya tetap tersedia.",
        retry: { url, replace },
      };
}
