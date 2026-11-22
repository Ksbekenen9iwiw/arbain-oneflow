import { Button, Link, displayName, quantity } from "../../ui";
import { withReturn } from "../../navigation";
import type { Row } from "../../types";

const count = (o: Row, key: string) =>
  (o.items || []).filter((item: Row) => item[key]).length;
export const outletIssues = (o: Row) =>
  (o.items || []).filter((item: Row) => item.is_near_expiry || item.is_weak)
    .length;

/** Dashboard teaser: only the outlets that need a decision; the full list is its own page. */
export function OutletAttention({
  outlets,
  pageUrl,
  canOpen,
}: {
  outlets: Row[];
  pageUrl: string;
  canOpen: boolean;
}) {
  if (!outlets.length) return null;
  const flagged = outlets
    .filter((o) => outletIssues(o) > 0)
    .sort((a, b) => outletIssues(b) - outletIssues(a));
  return (
    <section aria-label="Stok outlet" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-title-3-medium text-text-primary">
          Outlet perlu perhatian
          <span className="ms-2 text-text-tertiary tabular-nums">
            {quantity(flagged.length)}
          </span>
        </h2>
        <Button
          size="sm"
          variant="secondary"
          label={`Semua outlet (${quantity(outlets.length)})`}
          href={withReturn("/outlets/", pageUrl)}
        />
      </div>
      {flagged.length === 0 ? (
        <p className="rounded-2xl bg-background-secondary-default px-4 py-4 text-body-regular text-text-secondary">
          Semua stok titipan aman.
        </p>
      ) : (
        <ul className="oneflow-queue flex flex-col rounded-2xl bg-background-secondary-default p-1">
          {flagged.slice(0, 5).map((o) => (
            <li
              key={o.customer_id}
              className="oneflow-queue-row flex items-center gap-3 rounded-xl px-3 py-2.5"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {canOpen ? (
                  <Link
                    href={withReturn(
                      `/customers/${o.customer_id}/?tab=consignment`,
                      pageUrl,
                    )}
                    weight="semibold"
                  >
                    {displayName(o.name)}
                  </Link>
                ) : (
                  <span className="text-body-medium text-text-primary">
                    {displayName(o.name)}
                  </span>
                )}
                <span className="oneflow-meta flex flex-wrap text-caption-1-regular text-text-secondary">
                  {count(o, "is_weak") > 0 && (
                    <span className="text-orange-600 dark:text-orange-400">
                      {quantity(count(o, "is_weak"))} kurang laku
                    </span>
                  )}
                  {count(o, "is_near_expiry") > 0 && (
                    <span className="text-rose-600 dark:text-rose-400">
                      {quantity(count(o, "is_near_expiry"))} dekat kedaluwarsa
                    </span>
                  )}
                  <span>{o.sales_name}</span>
                </span>
              </div>
              <span className="shrink-0 text-end text-caption-1-regular text-text-secondary tabular-nums">
                <span className="block text-body-medium text-text-primary">
                  {quantity(o.total_on_display)} unit
                </span>
                laku {quantity(o.total_sold)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
