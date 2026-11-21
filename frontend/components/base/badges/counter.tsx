import type { HTMLAttributes, Ref } from "react";
import { cx, sortCx } from "@/utils/cx";

/**
 * Figma source: Board UI → dashboard 1 sidebar counters (nodes 3731:2964,
 * 3731:2982).
 *
 * Small numeric counter pill (nav item counts, unread totals). Called Badge
 * until Nov 2026; `components/base/badges/badge.tsx` re-exports it under that
 * name so existing imports keep working.
 *   - 12/16 semibold, tracking 0 (Figma uses font/size/xs + font/leading/4)
 *   - px 4, py 1, radius/sm (4px)
 *   - primary → bg color/blue/400, white text (sits on the selected nav item)
 *   - neutral → bg color/neutral/200, text/secondary
 */

export type CounterColor = "primary" | "neutral";

export interface CounterProps extends HTMLAttributes<HTMLSpanElement> {
  color?: CounterColor;
  ref?: Ref<HTMLSpanElement>;
}

const styles = sortCx({
  base: "inline-flex items-center justify-center rounded-sm px-1 py-px text-caption-1-semibold tracking-normal whitespace-nowrap",
  color: {
    primary: "bg-accent-400 text-white",
    neutral: "bg-badge-neutral-background text-text-secondary",
  },
});

export function Counter({ color = "neutral", className, ref, ...props }: CounterProps) {
  return (
    <span
      ref={ref}
      className={cx(styles.base, styles.color[color], className)}
      {...props}
    />
  );
}
