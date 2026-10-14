export function dashboardQueue(role: string | null, requested: string): string {
  if (role === "WAREHOUSE") return "shipping";
  return ["activities", "recommendations", "shipping"].includes(requested)
    ? requested
    : "activities";
}

export function activityMatches(
  due: string | null,
  mode: string,
  today: string,
): boolean {
  if (mode === "all") return true;
  if (mode === "priority") return !!due && due <= today;
  if (mode === "late") return !!due && due < today;
  if (mode === "today") return due === today;
  return !due || due > today;
}

export function recommendationSubmitLabel(outcome: string): string {
  return (
    (
      {
        DONE: "Simpan hasil tindak lanjut",
        SNOOZED: "Tunda rekomendasi",
        DISMISSED: "Tutup rekomendasi",
      } as Record<string, string>
    )[outcome] || "Simpan keputusan"
  );
}

export function recommendationEffect(
  kind: string,
  outcome: string,
  nextDate: string,
): string {
  if (outcome === "SNOOZED") {
    const parsed = new Date(nextDate + "T12:00:00+07:00");
    const date =
      /^\d{4}-\d{2}-\d{2}$/.test(nextDate) && !Number.isNaN(parsed.getTime())
        ? new Intl.DateTimeFormat("id-ID", {
            day: "numeric",
            month: "long",
            year: "numeric",
          }).format(parsed)
        : "tanggal yang dipilih";
    return `Rekomendasi disembunyikan sampai ${date} dan dapat muncul lagi jika masih relevan. Jadwal dan status aktivitas tidak berubah. Aktivitas yang masih terjadwal tetap ada di antrean kerja.`;
  }
  if (outcome === "DISMISSED")
    return "Rekomendasi ini ditutup dengan alasan yang dicatat. Aktivitas tidak dibatalkan atau diselesaikan. Rekomendasi baru dapat muncul dari pemicu lain.";
  if (outcome === "DONE")
    return kind === "FOLLOWUP"
      ? "Hasil disimpan dan aktivitas tindak lanjut asal ditandai selesai. Pesanan terkait tidak otomatis dikonfirmasi atau dikirim. Untuk membuat jadwal lanjutan, gunakan Catat hasil aktivitas di atas."
      : "Rekomendasi ditandai selesai. Jika diisi, catatan hasil menjadi interaksi pelanggan; pesanan yang dipilih ditautkan tanpa mengubah status atau stoknya.";
  return "Pilih keputusan untuk rekomendasi ini. Menunda atau menutup rekomendasi tidak mengubah jadwal aktivitas.";
}
