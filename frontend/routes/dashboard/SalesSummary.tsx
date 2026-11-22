import { cx } from "@/utils/cx";
import { RollingNumber } from "../../continuity";

/** What is waiting for this sales, split into late and today on one bar. */
export default function SalesSummary({
  late,
  today,
  onOpen,
  className,
  id = "sales",
}: {
  id?: string;
  late: number;
  today: number;
  onOpen: (schedule: "late" | "today") => void;
  className?: string;
}) {
  const total = late + today;
  const parts = [
    { key: "late" as const, label: "Terlambat", value: late, color: "bg-text-error-primary" },
    { key: "today" as const, label: "Hari ini", value: today, color: "bg-chart-2-active" },
  ];
  return (
    <section
      aria-label="Perlu dikerjakan"
      className={cx(
        "flex min-w-0 flex-1 flex-col gap-4 rounded-2xl bg-background-secondary-default p-4",
        className,
      )}
    >
      <div className="flex flex-col gap-0.5">
        <p className="text-body-medium text-text-secondary">Perlu dikerjakan</p>
        <p className="text-title-1-medium text-text-primary tabular-nums">
          <RollingNumber id={`${id}-todo`} value={total} />
          <span className="ms-2 text-body-medium text-text-tertiary">kunjungan</span>
        </p>
      </div>
      <div
        className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-chart-track"
        aria-hidden
      >
        {total > 0 &&
          parts.map(
            (part) =>
              part.value > 0 && (
                <span
                  key={part.key}
                  className={cx("h-full transition-[flex-grow] duration-500", part.color)}
                  style={{ flexGrow: part.value }}
                />
              ),
          )}
      </div>
      <div className="mt-auto grid grid-cols-2 gap-2">
        {parts.map((part) => (
          <button
            key={part.key}
            type="button"
            onClick={() => onOpen(part.key)}
            className="flex cursor-pointer flex-col items-start gap-0.5 rounded-xl bg-background-primary-default px-3 py-2 text-start shadow-xs outline-none transition-colors duration-150 hover:bg-background-tertiary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          >
            <span className="flex items-center gap-1.5 text-body-2-medium text-text-secondary">
              <span className={cx("h-2.5 w-1 rounded-full", part.color)} aria-hidden />
              {part.label}
            </span>
            <span className="text-headline-medium text-text-primary tabular-nums">
              <RollingNumber id={`${id}-${part.key}`} value={part.value} />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
