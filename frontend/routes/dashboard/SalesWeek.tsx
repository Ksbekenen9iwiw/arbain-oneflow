import { Expandable, useExpanded } from "@/kit";
import { useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import { cx } from "@/utils/cx";
import type { Row } from "../../types";

const DAY = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Visits scheduled per day for the seven days starting today. */
function SalesWeekInner({
  agenda,
  today,
  className,
}: {
  agenda: Row[];
  today: string;
  className?: string;
}) {
  const expanded = useExpanded();
  const [active, setActive] = useState<number | null>(null);
  const start = new Date(`${today}T00:00:00`);
  const days = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(start);
    date.setDate(start.getDate() + offset);
    const key = iso(date);
    return {
      label: offset === 0 ? "Hari ini" : DAY[date.getDay()],
      full: offset === 0 ? "Hari ini" : `${DAY[date.getDay()]}, ${date.getDate()}`,
      count: agenda.filter((activity) => activity.due === key).length,
    };
  });
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const point = active !== null ? days[active] : null;
  return (
    <section
      aria-label="Jadwal 7 hari"
      className={cx(
        "flex min-w-0 flex-1 flex-col gap-3 rounded-2xl bg-background-secondary-default px-4 pt-4 pb-3",
        expanded ? "h-full min-h-[60vh]" : "h-56",
        className,
      )}
    >
      <div className="flex flex-col gap-0.5">
        <p className="text-body-medium text-text-secondary">
          {point ? point.full : "Jadwal 7 hari"}
        </p>
        <p className="text-title-1-medium text-text-primary tabular-nums">
          {point ? point.count : total}
          <span className="ms-2 text-body-medium text-text-tertiary">kunjungan</span>
        </p>
      </div>
      <div className="min-h-0 w-full flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={days}
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
              interval={0}
              tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }}
            />
            <Tooltip
              content={() => null}
              cursor={{ fill: "var(--color-chart-track)", opacity: 0.5 }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} minPointSize={2} animationDuration={450}>
              {days.map((day, index) => (
                <Cell
                  key={day.full}
                  fill={
                    index === 0 ? "var(--color-chart-2-active)" : "var(--color-chart-neutral)"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export default function SalesWeek(props: Parameters<typeof SalesWeekInner>[0]) {
  return (
    <Expandable title="Jadwal 7 hari" className={props.className}>
      <SalesWeekInner {...props} />
    </Expandable>
  );
}
