import type { ReactNode } from "react";
import { quantity } from "../../ui";
import { RollingNumber } from "../../continuity";

type Person = { id: string; name: string; today: number; late: number; total: number };

/** Manager home: how far behind the team is, and who carries it. */
export function TeamFocus({
  people,
  agendaUrl,
  controls,
}: {
  people: Person[];
  agendaUrl: (salesId: string, schedule: string) => string;
  controls?: ReactNode;
}) {
  const late = people.reduce((sum, p) => sum + p.late, 0);
  const today = people.reduce((sum, p) => sum + p.today, 0);
  const total = people.reduce((sum, p) => sum + p.total, 0);
  const widest = Math.max(1, ...people.map((p) => p.total));
  return (
    <section
      id="team-recap"
      aria-label="Fokus tim"
      className="oneflow-next relative overflow-hidden rounded-3xl p-5 sm:p-6"
    >
      <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-center">
        <div className="flex flex-col gap-3">
          <span className="flex items-center gap-2 text-caption-1-medium tracking-wide text-accent-700 uppercase dark:text-accent-200">
            <span
              aria-hidden
              className={
                "size-2 rounded-full " +
                (late ? "oneflow-pulse bg-rose-500" : "bg-emerald-500")
              }
            />
            Kunjungan tim
          </span>
          <p className="flex items-baseline gap-3">
            <span
              data-figure
              className={
                "text-[3rem] leading-none font-semibold tabular-nums " +
                (late ? "text-rose-600 dark:text-rose-400" : "text-text-primary")
              }
            >
              <RollingNumber id="team-late" value={late} />
            </span>
            <span className="text-title-3-medium text-text-primary">
              terlambat
            </span>
          </p>
          <p className="oneflow-meta flex flex-wrap text-body-regular text-text-secondary">
            <span>{quantity(today)} hari ini</span>
            <span>{quantity(total)} agenda terbuka</span>
          </p>
          {controls && <div className="flex flex-wrap gap-2">{controls}</div>}
        </div>
        <ul className="flex flex-col gap-2">
          {people.map((p) => (
            <li key={p.id}>
              <a
                href={agendaUrl(p.id, p.late ? "late" : "all")}
                className="oneflow-press group flex flex-col gap-2 rounded-2xl bg-background-primary-default/80 px-4 py-3 shadow-xs outline-none backdrop-blur-sm hover:bg-background-primary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring"
              >
                <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="text-body-medium text-text-primary">
                    {p.name}
                  </span>
                  <span className="oneflow-meta flex shrink-0 text-caption-1-regular text-text-secondary tabular-nums">
                    {p.late > 0 && (
                      <span className="font-medium text-rose-600 dark:text-rose-400">
                        {quantity(p.late)} terlambat
                      </span>
                    )}
                    <span>{quantity(p.today)} hari ini</span>
                    <span>{quantity(p.total)} terbuka</span>
                  </span>
                </span>
                <span
                  aria-hidden
                  className="flex h-2 overflow-hidden rounded-full bg-background-tertiary-default"
                  style={{ width: `${Math.max(12, (p.total / widest) * 100)}%` }}
                >
                  <span
                    className="oneflow-bar bg-rose-500"
                    style={{ width: `${p.total ? (p.late / p.total) * 100 : 0}%` }}
                  />
                  <span
                    className="oneflow-bar bg-accent-400"
                    style={{ width: `${p.total ? (p.today / p.total) * 100 : 0}%` }}
                  />
                </span>
              </a>
            </li>
          ))}
          {people.length === 0 && (
            <li className="text-body-regular text-text-secondary">
              Belum ada sales aktif.
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}
