import { cx } from "@/utils/cx";
import { RollingNumber } from "../../continuity";

/** Product balances by condition on one bar; each part opens that stock filter. */
export default function StockHealth({
  safe,
  low,
  conflict,
  unverified,
  onOpen,
  className,
}: {
  safe: number;
  low: number;
  conflict: number;
  unverified: number;
  onOpen: (filter: string) => void;
  className?: string;
}) {
  const parts = [
    { key: "conflict", label: "Konflik", value: conflict, color: "bg-text-error-primary" },
    { key: "low", label: "Menipis", value: low, color: "bg-chart-2-active" },
    { key: "unverified", label: "Belum diverifikasi", value: unverified, color: "bg-chart-neutral" },
    { key: "", label: "Aman", value: safe, color: "bg-chart-9-active" },
  ];
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  return (
    <section
      aria-label="Kondisi stok"
      className={cx(
        "flex min-w-0 flex-1 flex-col gap-4 rounded-2xl bg-background-secondary-default p-4",
        className,
      )}
    >
      <div className="flex flex-col gap-0.5">
        <p className="text-body-medium text-text-secondary">Kondisi stok</p>
        <p className="text-title-1-medium text-text-primary tabular-nums">
          <RollingNumber id="stock-total" value={total} />
          <span className="ms-2 text-body-medium text-text-tertiary">produk</span>
        </p>
      </div>
      <div
        className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-chart-track"
        aria-hidden
      >
        {parts.map(
          (part) =>
            part.value > 0 && (
              <span
                key={part.label}
                className={cx("h-full transition-[flex-grow] duration-500", part.color)}
                style={{ flexGrow: part.value }}
              />
            ),
        )}
      </div>
      <div className="mt-auto grid grid-cols-2 gap-2 md:grid-cols-4">
        {parts.map((part) => (
          <button
            key={part.label}
            type="button"
            onClick={() => onOpen(part.key)}
            className="flex cursor-pointer flex-col items-start gap-0.5 rounded-xl bg-background-primary-default px-3 py-2 text-start shadow-xs outline-none transition-colors duration-150 hover:bg-background-tertiary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          >
            <span className="flex items-center gap-1.5 text-body-2-medium text-text-secondary">
              <span className={cx("h-2.5 w-1 rounded-full", part.color)} aria-hidden />
              {part.label}
            </span>
            <span className="text-headline-medium text-text-primary tabular-nums">
              <RollingNumber id={`stock-${part.key || "safe"}`} value={part.value} />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
