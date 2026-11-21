// Indonesian for the English strings built into BoardUI components.
const COPY: Record<string, string> = {
  Dismiss: "Tutup",
  Close: "Tutup",
  Confirm: "Konfirmasi",
  Cancel: "Batal",
  Apply: "Terapkan",
  Clear: "Hapus",
  Today: "Hari ini",
  "No results": "Tidak ada hasil",
  "Clear search": "Hapus pencarian",
  "Select date": "Pilih tanggal",
  "Dismiss notification": "Tutup pemberitahuan",
  Notifications: "Pemberitahuan",
  Previous: "Sebelumnya",
  Next: "Berikutnya",
  Pagination: "Halaman",
  Loading: "Memuat",
  Actions: "Tindakan",
  Date: "Tanggal",
};

export const translateCopy = (text: string) => COPY[text] ?? text;
