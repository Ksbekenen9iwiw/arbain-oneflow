import { Expandable, useExpanded } from "@/kit";
import { useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import { cx } from "@/utils/cx";
import type { Row } from "../../types";

const SERIES = [
  { fill: "var(--color-chart-2-active)", swatch: "bg-chart-2-active" },
  { fill: "var(--color-chart-9-active)", swatch: "bg-chart-9-active" },
  { fill: "var(--color-chart-4-active)", swatch: "bg-chart-4-active" },
  { fill: "var(--color-chart-neutral)", swatch: "bg-chart-neutral" },
];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const short = (iso: string) => {
  const [, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTH[month - 1]}`;
};

/** Completed visits per week; one stacked series per sales when there are several. */
function VisitWeeksInner({
  weeks,
  className,
}: {
  weeks: Row[];
  className?: string;
}) {
  const expanded = useExpanded();
  const [active, setActive] = useState<number | null>(null);
  const people: Row[] = weeks[0]?.by_sales || [];
  const data = weeks.map((week, index) => ({
    label: index === weeks.length - 1 ? "Minggu ini" : short(week.start),
    full: index === weeks.length - 1 ? "Minggu ini" : `Minggu ${short(week.start)}`,
    total: Number(week.total),
    ...Object.fromEntries(
      (week.by_sales as Row[]).map((person) => [person.sales_id, Number(person.count)]),
    ),
  }));
  const total = data.reduce((sum, week) => sum + week.total, 0);
  const point = active !== null ? data[active] : null;
  const split = people.length > 1;
  return (
    <section
      aria-label="Kunjungan selesai"
      className={cx(
        "flex min-w-0 shrink-0 flex-col gap-3 rounded-2xl bg-background-secondary-default px-4 pt-4 pb-3",
        expanded ? "h-full min-h-[60vh]" : "h-64",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 pe-9">
        <div className="flex flex-col gap-0.5">
          <p className="text-body-medium text-text-secondary">
            Kunjungan selesai · {point ? point.full : `${weeks.length} minggu`}
          </p>
          <p className="text-title-1-medium text-text-primary tabular-nums">
            {(point ? point.total : total).toLocaleString("id-ID")}
            <span className="ms-2 text-body-medium text-text-tertiary">kunjungan</span>
          </p>
        </div>
        {split && (
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-body-2-medium text-text-secondary">
            {people.map((person, index) => (
              <li key={person.sales_id} className="flex items-center gap-1.5">
                <span
                  className={cx("h-2.5 w-1 rounded-full", SERIES[index % SERIES.length].swatch)}
                  aria-hidden
                />
                {person.name}
                {point && (
                  <span className="text-text-primary tabular-nums">
                    {Number((point as Row)[person.sales_id] || 0)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {total > 0 ? (
        <div className="min-h-0 w-full flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
              barCategoryGap="28%"
              onMouseMove={(state) => {
                const index = Number(state?.activeTooltipIndex);
                if (state?.isTooltipActive && Number.isFinite(index)) setActive(index);
              }}
              onMouseLeave={() => setActive(null)}
            >
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval="preserveStartEnd"
                tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }}
              />
              <Tooltip
                content={() => null}
                cursor={{ fill: "var(--color-chart-track)", opacity: 0.5 }}
              />
              {people.map((person, index) => (
                <Bar
                  key={person.sales_id}
                  dataKey={person.sales_id}
                  stackId="visits"
                  fill={SERIES[index % SERIES.length].fill}
                  radius={index === people.length - 1 ? [4, 4, 0, 0] : 0}
                  animationDuration={450}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="m-auto text-body-medium text-text-tertiary">
          Belum ada kunjungan selesai
        </p>
      )}
    </section>
  );
}

export default function VisitWeeks(props: Parameters<typeof VisitWeeksInner>[0]) {
  return (
    <Expandable title="Kunjungan selesai" className={props.className}>
      <VisitWeeksInner {...props} />
    </Expandable>
  );
}
