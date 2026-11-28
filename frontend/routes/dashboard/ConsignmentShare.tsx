import { Expandable } from "@/kit";
import { cx } from "@/utils/cx";
import type { Row } from "../../types";

/** Units sold against units still on display, per sales, from the outlet summaries. */
function ConsignmentShareInner({
  outlets,
  className,
}: {
  outlets: Row[];
  className?: string;
}) {
  const people = new Map<string, { name: string; sold: number; display: number }>();
  for (const outlet of outlets) {
    const key = String(outlet.sales_id || "");
    const person = people.get(key) || {
      name: outlet.sales_name || "Tanpa sales",
      sold: 0,
      display: 0,
    };
    person.sold += Number(outlet.total_sold || 0);
    person.display += Number(outlet.total_on_display || 0);
    people.set(key, person);
  }
  const rows = [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
  const sold = rows.reduce((sum, row) => sum + row.sold, 0);
  const peak = Math.max(1, ...rows.map((row) => row.sold + row.display));
  const number = (value: number) => value.toLocaleString("id-ID");
  return (
    <section
      aria-label="Titip jual"
      className={cx(
        "flex min-h-64 min-w-0 flex-1 flex-col gap-4 rounded-2xl bg-background-secondary-default p-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 pe-9">
        <div className="flex flex-col gap-0.5">
          <p className="text-body-medium text-text-secondary">Titip jual · terjual</p>
          <p className="text-title-1-medium text-text-primary tabular-nums">
            {number(sold)}
            <span className="ms-2 text-body-medium text-text-tertiary">unit</span>
          </p>
        </div>
        <ul className="flex gap-3 text-body-2-medium text-text-secondary">
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-1 rounded-full bg-chart-9-active" aria-hidden />
            Terjual
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-1 rounded-full bg-chart-neutral" aria-hidden />
            Dipajang
          </li>
        </ul>
      </div>
      <ul className="mt-auto flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.name} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-body-medium">
              <span className="text-text-primary">{row.name}</span>
              <span className="text-text-secondary tabular-nums">
                {number(row.sold)} terjual · {number(row.display)} dipajang
              </span>
            </div>
            <div
              className="flex h-2.5 gap-0.5 overflow-hidden rounded-full"
              style={{ width: `${Math.max(4, ((row.sold + row.display) / peak) * 100)}%` }}
              aria-hidden
            >
              {row.sold > 0 && (
                <span className="h-full bg-chart-9-active" style={{ flexGrow: row.sold }} />
              )}
              {row.display > 0 && (
                <span className="h-full bg-chart-neutral" style={{ flexGrow: row.display }} />
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function ConsignmentShare(props: Parameters<typeof ConsignmentShareInner>[0]) {
  return (
    <Expandable title="Titip jual" className={props.className}>
      <ConsignmentShareInner {...props} />
    </Expandable>
  );
}
