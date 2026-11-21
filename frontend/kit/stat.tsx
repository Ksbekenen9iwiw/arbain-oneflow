import type { ComponentType, ReactNode } from "react";
import { cx } from "@/utils/cx";

export type StatTone = "accent" | "danger" | "warning" | "success" | "neutral";

const TILE: Record<StatTone, string> = {
  accent: "from-accent-400 to-accent-500 text-white",
  danger: "from-rose-500 to-rose-600 text-white",
  warning: "from-orange-400 to-orange-500 text-white",
  success: "from-emerald-500 to-emerald-600 text-white",
  neutral: "from-background-tertiary-default to-background-tertiary-default text-foreground-icon-primary",
};

/**
 * BoardUI stat card adapted for OneFlow queues: a figure the user can act on.
 * With `href`/`onClick` the whole tile is the action, and `action` names it.
 */
export function StatTile({
  icon: IconGlyph,
  label,
  value,
  caption,
  tone = "neutral",
  action,
  href,
  onClick,
  isSelected,
  children,
  className,
  ...aria
}: {
  icon?: ComponentType<{ className?: string }>;
  label: ReactNode;
  value: ReactNode;
  caption?: ReactNode;
  tone?: StatTone;
  action?: string;
  href?: string;
  onClick?: () => void;
  isSelected?: boolean;
  children?: ReactNode;
  className?: string;
  "aria-controls"?: string;
}) {
  const interactive = Boolean(href || onClick);
  const body = (
    <>
      <div className="flex w-full items-start justify-between gap-2 p-2">
        {IconGlyph && (
          <span
            className={cx(
              "flex size-9 items-center justify-center rounded-xl bg-linear-to-b shadow-xs",
              TILE[tone],
            )}
          >
            <IconGlyph className="size-5 shrink-0" aria-hidden />
          </span>
        )}
        {caption && (
          <span className="ms-auto text-caption-1-regular text-text-secondary">{caption}</span>
        )}
      </div>
      <div className="flex flex-col gap-0.5 px-2 pt-1.5 pb-2.5 text-start">
        <span className="truncate text-body-medium text-text-secondary">{label}</span>
        <span
          data-figure
          className="text-title-1-medium whitespace-nowrap text-text-primary tabular-nums"
        >
          {value}
        </span>
      </div>
      {children && <div className="px-2 pb-2.5">{children}</div>}
      {action && (
        <span className="mt-auto flex w-full items-center justify-between gap-2 rounded-xl bg-background-primary-default px-2.5 py-1.5 text-body-medium text-text-primary shadow-xs transition-colors duration-150 group-hover:text-accent-600">
          {action}
          <span
            aria-hidden
            className="transition-transform duration-200 ease-out group-hover:translate-x-0.5"
          >
            →
          </span>
        </span>
      )}
    </>
  );
  const cls = cx(
    "group flex min-w-0 flex-col rounded-2xl bg-background-secondary-default p-2 outline-none",
    "transition-[background-color,box-shadow,transform] duration-200 ease-out",
    interactive &&
      "cursor-pointer hover:bg-background-secondary-hover active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-border-focus-ring",
    isSelected && "ring-2 ring-accent-500",
    className,
  );
  if (href)
    return (
      <a href={href} className={cls} {...aria}>
        {body}
      </a>
    );
  if (onClick)
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={isSelected}
        className={cls}
        {...aria}
      >
        {body}
      </button>
    );
  return <section className={cls}>{body}</section>;
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "grid grid-cols-[repeat(auto-fit,minmax(11.5rem,1fr))] gap-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
