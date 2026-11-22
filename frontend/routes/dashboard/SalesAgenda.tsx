import { RollingNumber } from "../../continuity";
import { useState } from "react";
import {
  RiCheckboxCircleLine,
  RiMapPin2Line,
} from "@remixicon/react";
import { SegmentedControl, SegmentedControlItem, Selector } from "@/kit";
import { Button, Link, Empty, dateLabel, displayName, quantity } from "../../ui";
import { withReturn } from "../../navigation";
import { activityMatches } from "../../dashboard";
import type { Row } from "../../types";

const GROUP_LIMIT = 6;
const DAY = 86_400_000;

type Bucket = "late" | "today" | "future";

const bucketOf = (due: string | null, today: string): Bucket =>
  due && due < today ? "late" : due === today ? "today" : "future";

function dueText(due: string | null, today: string) {
  if (!due) return "Tanpa jadwal";
  const days = Math.round((Date.parse(today) - Date.parse(due)) / DAY);
  if (days > 0) return `Terlambat ${quantity(days)} hari`;
  if (days === 0) return "Hari ini";
  return days === -1 ? "Besok" : dateLabel(due);
}

const TONE: Record<Bucket, string> = {
  late: "text-rose-600 dark:text-rose-400",
  today: "text-accent-600 dark:text-accent-300",
  future: "text-text-secondary",
};

/** Sales home: the next visit is the page, the rest is a queue grouped by urgency. */
export function SalesAgenda({
  agenda,
  today,
  pageUrl,
  schedule,
  onSchedule,
  isMobile,
}: {
  agenda: Row[];
  today: string;
  pageUrl: string;
  schedule: string;
  onSchedule: (value: string) => void;
  isMobile: boolean;
}) {
  const count = (mode: string) =>
    agenda.filter((a) => activityMatches(a.due, mode, today)).length;
  const late = count("late"),
    dueToday = count("today"),
    future = count("future");
  const next =
    agenda.find((a) => activityMatches(a.due, "priority", today)) || agenda[0];
  const nextBucket = next ? bucketOf(next.due, today) : "future";
  const completeUrl = (a: Row) =>
    withReturn(`/activities/${a.id}/complete/`, pageUrl);
  const customerUrl = (a: Row) =>
    withReturn(`/customers/${a.customer.id}/`, pageUrl);

  const current = schedule === "all" ? "priority" : schedule;
  const queue = agenda.filter(
    (a) => a !== next && activityMatches(a.due, current, today),
  );
  const groups = (
    [
      ["late", "Terlambat"],
      ["today", "Hari ini"],
      ["future", "Mendatang"],
    ] as [Bucket, string][]
  )
    .map(([key, label]) => ({
      key,
      label,
      rows: queue.filter((a) => bucketOf(a.due, today) === key),
    }))
    .filter((g) => g.rows.length);

  const filters = [
    { value: "priority", label: `Perlu dikerjakan · ${quantity(late + dueToday)}` },
    { value: "late", label: `Terlambat · ${quantity(late)}` },
    { value: "today", label: `Hari ini · ${quantity(dueToday)}` },
    { value: "future", label: `Mendatang · ${quantity(future)}` },
  ];

  if (!next)
    return (
      <Empty
        kind="complete"
        title="Agenda kosong"
        description="Jadwalkan kunjungan dari halaman pelanggan."
        action={
          <Button
            label="Lihat pelanggan"
            href={withReturn("/customers/", pageUrl)}
          />
        }
      />
    );

  return (
    <div className="flex flex-col gap-6" id="queue-activities">
      <section
        aria-label="Kunjungan berikutnya"
        className="oneflow-next relative overflow-hidden rounded-3xl p-5 sm:p-6"
      >
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-3">
            <span className="flex items-center gap-2 text-caption-1-medium tracking-wide text-accent-700 uppercase dark:text-accent-200">
              <span
                aria-hidden
                className={
                  "size-2 rounded-full " +
                  (nextBucket === "late"
                    ? "oneflow-pulse bg-rose-500"
                    : "bg-accent-500")
                }
              />
              {nextBucket === "future" ? "Jadwal terdekat" : "Kerjakan berikutnya"}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <h2
                data-next-title
                className="truncate text-title-1-medium text-text-primary sm:text-[1.75rem] sm:leading-9"
                style={{ viewTransitionName: `customer-${next.customer.id}` }}
              >
                {displayName(next.customer.name)}
              </h2>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-regular text-text-secondary">
                <span>{next.kind_label}</span>
                {next.customer.address && (
                  <span className="flex items-center gap-1">
                    <RiMapPin2Line className="size-4" aria-hidden />
                    {displayName(next.customer.address)}
                  </span>
                )}
                <span className={"font-medium " + TONE[nextBucket]}>
                  {dueText(next.due, today)}
                </span>
              </p>
              {next.note?.trim() && (
                <p className="line-clamp-2 text-body-regular text-text-secondary">
                  {next.note.trim()}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                label="Catat hasil"
                variant="primary"
                size="lg"
                href={completeUrl(next)}
                width={isMobile ? "100%" : undefined}
              />
              <Button
                label="Buka outlet"
                variant="secondary"
                size="lg"
                href={customerUrl(next)}
                width={isMobile ? "100%" : undefined}
              />
            </div>
          </div>
          <dl className="grid shrink-0 grid-cols-2 gap-2 lg:w-72">
            {(
              [
                ["late", "Terlambat", late],
                ["today", "Hari ini", dueToday],
              ] as [Bucket, string, number][]
            ).map(([key, label, value]) => (
              <button
                key={key}
                type="button"
                aria-pressed={schedule === key}
                aria-controls="agenda-queue"
                onClick={() => onSchedule(schedule === key ? "priority" : key)}
                className={
                  "oneflow-press flex flex-col items-start gap-0.5 rounded-2xl bg-background-primary-default/80 px-4 py-3 text-start shadow-xs outline-none backdrop-blur-sm transition-[box-shadow,background-color] duration-200 hover:bg-background-primary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring " +
                  (schedule === key ? "ring-2 ring-accent-500" : "")
                }
              >
                <dt className="text-caption-1-medium text-text-secondary dark:text-text-primary">
                  {label}
                </dt>
                <dd
                  data-figure
                  className={
                    "text-title-1-medium tabular-nums " +
                    (value ? TONE[key] : "text-text-tertiary")
                  }
                >
                  <RollingNumber id={`sales-${key}`} value={value} />
                </dd>
              </button>
            ))}
          </dl>
        </div>
      </section>

      <section
        id="agenda-queue"
        aria-label="Antrean agenda"
        className="flex flex-col gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-title-3-medium text-text-primary">Antrean</h2>
          {isMobile ? (
            <Selector
              label="Filter agenda"
              isLabelHidden
              value={current}
              width="100%"
              options={filters}
              onChange={onSchedule}
            />
          ) : (
            <SegmentedControl
              label="Filter agenda"
              value={current}
              onChange={onSchedule}
            >
              {filters.map((f) => (
                <SegmentedControlItem key={f.value} {...f} />
              ))}
            </SegmentedControl>
          )}
        </div>
        {groups.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl bg-background-secondary-default px-4 py-5 text-body-regular text-text-secondary">
            <RiCheckboxCircleLine
              className="size-5 text-emerald-600"
              aria-hidden
            />
            {current === "future"
              ? "Belum ada jadwal mendatang."
              : "Tidak ada lagi di antrean ini."}
          </div>
        ) : (
          groups.map((group) => (
            <QueueGroup
              key={`${current}-${group.key}`}
              group={group}
              showLabel={groups.length > 1}
              today={today}
              completeUrl={completeUrl}
              customerUrl={customerUrl}
            />
          ))
        )}
      </section>
    </div>
  );
}

function QueueGroup({
  group,
  showLabel,
  today,
  completeUrl,
  customerUrl,
}: {
  group: { key: Bucket; label: string; rows: Row[] };
  showLabel: boolean;
  today: string;
  completeUrl: (a: Row) => string;
  customerUrl: (a: Row) => string;
}) {
  // Remembered for the session so Back from an outlet lands on the same expanded list.
  const memo = `oneflow-open:${group.key}`;
  const [open, setOpenState] = useState(
    () => sessionStorage.getItem(memo) === "1",
  );
  const setOpen = (value: boolean) => {
    sessionStorage.setItem(memo, value ? "1" : "0");
    setOpenState(value);
  };
  const all = open || group.rows.length <= GROUP_LIMIT;
  const rows = all ? group.rows : group.rows.slice(0, GROUP_LIMIT);
  return (
    <div className="flex flex-col gap-2">
      {showLabel && (
        <h3 className="flex items-baseline gap-2 px-1 text-body-medium text-text-secondary">
          {group.label}
          <span className="text-text-tertiary tabular-nums">
            {quantity(group.rows.length)}
          </span>
        </h3>
      )}
      <ul className="oneflow-queue flex flex-col rounded-2xl bg-background-secondary-default p-1">
        {rows.map((a) => (
          <li
            key={a.id}
            className="oneflow-queue-row flex items-center gap-3 rounded-xl px-3 py-2.5"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <Link href={customerUrl(a)} weight="semibold">
                {displayName(a.customer.name)}
              </Link>
              <span className="oneflow-meta flex flex-wrap text-caption-1-regular text-text-secondary">
                <span>{a.kind_label}</span>
                {a.customer.address && (
                  <span>{displayName(a.customer.address)}</span>
                )}
                <span className={TONE[group.key]}>{dueText(a.due, today)}</span>
              </span>
            </div>
            <Button
              label="Catat hasil"
              size="sm"
              variant="secondary"
              href={completeUrl(a)}
            />
          </li>
        ))}
      </ul>
      {!all && (
        <div>
          <Button
            size="sm"
            variant="secondary"
            label={`Tampilkan ${quantity(group.rows.length - GROUP_LIMIT)} lainnya`}
            onClick={() => setOpen(true)}
          />
        </div>
      )}
    </div>
  );
}
