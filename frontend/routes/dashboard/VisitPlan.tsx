import { type ReactNode, useState } from "react";
import { RiArrowDownSLine } from "@remixicon/react";
import { cx } from "@/utils/cx";
import { withReturn } from "../../navigation";
import type { Row } from "../../types";
import { Button, Link } from "../../ui";

const reasonText = (reason: Row) => {
  const value = Number(reason.value);
  if (reason.kind === "EMPTY") return `${value} produk laku habis di rak`;
  if (reason.kind === "LATE") return `Terlambat ${value} hari`;
  if (reason.kind === "TODAY") return "Dijadwalkan hari ini";
  return `Belum dicek ${Math.round(value / 7)} minggu`;
};

function Items({
  label,
  items,
  text,
}: {
  label: string;
  items: Row[];
  text: (item: Row) => string;
}) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-body-2-medium text-text-tertiary">{label}</p>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li
            key={item.product_id}
            className="flex items-baseline justify-between gap-3 text-body-medium"
          >
            <span className="text-text-primary">{item.name}</span>
            <span className="shrink-0 text-text-secondary tabular-nums">
              {text(item)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Today's suggested outlets, grouped by area, each with its reason and what to bring. */
export default function VisitPlan({
  plan,
  pageUrl,
  action,
}: {
  plan: Row[];
  pageUrl: string;
  action?: ReactNode;
}) {
  const [open, setOpen] = useState<string>(plan[0]?.customer_id || "");
  const areas: { area: string; outlets: Row[] }[] = [];
  for (const outlet of plan) {
    const last = areas[areas.length - 1];
    if (last && last.area === outlet.area) last.outlets.push(outlet);
    else areas.push({ area: outlet.area, outlets: [outlet] });
  }
  return (
    <section
      aria-label="Rencana hari ini"
      className="flex min-w-0 flex-col gap-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-body-medium text-text-secondary">
            Rencana hari ini
          </p>
          <p className="text-title-1-medium text-text-primary tabular-nums">
            {plan.length}
            <span className="ms-2 text-body-medium text-text-tertiary">
              outlet · {areas.length} wilayah
            </span>
          </p>
        </div>
        {action}
      </div>
      <div className="flex flex-col gap-4">
        {areas.map((group) => (
          <div key={group.area || "-"} className="flex flex-col gap-1.5">
            <p className="text-body-2-medium text-text-secondary">
              {group.area || "Tanpa wilayah"}
            </p>
            <ul className="flex flex-col gap-1.5">
              {group.outlets.map((outlet) => {
                const expanded = open === outlet.customer_id;
                const details =
                  outlet.bring.length + outlet.try.length + outlet.pull.length >
                  0;
                const panel = `plan-${outlet.customer_id}`;
                return (
                  <li
                    key={outlet.customer_id}
                    className="rounded-xl bg-background-primary-default shadow-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2.5">
                      <div className="flex min-w-44 flex-1 flex-col gap-0.5">
                        <Link
                          href={withReturn(
                            `/customers/${outlet.customer_id}/`,
                            pageUrl,
                          )}
                          weight="semibold"
                        >
                          {outlet.name}
                        </Link>
                        <p className="text-body-medium text-text-secondary">
                          {outlet.reasons
                            .slice(0, 2)
                            .map(reasonText)
                            .join(" · ")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {outlet.activity_id && (
                          <Button
                            href={withReturn(
                              `/activities/${outlet.activity_id}/complete/`,
                              pageUrl,
                            )}
                            size="sm"
                            variant="secondary"
                            label="Catat hasil"
                          />
                        )}
                        {details && (
                          <button
                            type="button"
                            aria-expanded={expanded}
                            aria-controls={panel}
                            aria-label={`Barang untuk ${outlet.name}`}
                            onClick={() =>
                              setOpen(expanded ? "" : outlet.customer_id)
                            }
                            className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-icon-secondary outline-none transition-colors hover:bg-background-secondary-default focus-visible:ring-2 focus-visible:ring-focus-ring"
                          >
                            <RiArrowDownSLine
                              className={cx(
                                "size-5 transition-transform duration-200 motion-reduce:transition-none",
                                expanded && "rotate-180",
                              )}
                              aria-hidden
                            />
                          </button>
                        )}
                      </div>
                    </div>
                    {details && expanded && (
                      <div
                        id={panel}
                        className="grid gap-4 border-t border-separator-border px-3 py-3 md:grid-cols-3"
                      >
                        <Items
                          label="Bawa"
                          items={outlet.bring}
                          text={(item) => `${item.quantity} unit`}
                        />
                        <Items
                          label="Coba titipkan · laku di outlet serupa"
                          items={outlet.try}
                          text={(item) => `${item.sellers} outlet`}
                        />
                        <Items
                          label="Tidak laku, tarik"
                          items={outlet.pull}
                          text={(item) => `${item.on_display} di rak`}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
