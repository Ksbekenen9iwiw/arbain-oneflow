"use client";

import type { ReactNode } from "react";
import { Meter as AriaMeter } from "react-aria-components";
import type { MeterProps as AriaMeterProps } from "react-aria-components";
import { Label } from "@/components/base/input/label";
import { ProgressTrack, type ProgressSize } from "@/components/base/progress/progress";
import { cx, sortCx } from "@/utils/cx";

/**
 * Meter — a quantity within a known range: storage used, seats taken, a
 * password's strength. Unlike ProgressBar it describes a level rather than
 * a task moving towards done, and React Aria's Meter announces it that way
 * (role="meter").
 *
 *   <Meter label="Storage" value={72} valueLabel="7.2 of 10 GB" />
 *   <Meter label="Seats" value={19} maxValue={20} tone="warning" />
 *
 * It is drawn on ProgressBar's track: the same rail, fill, and eased
 * translate when the value changes. `tone` colours the fill from semantic
 * tokens, so a meter can turn amber or red as it fills up.
 */

export type MeterTone = "accent" | "success" | "warning" | "error";

const tones = sortCx({
  accent: "text-accent-500",
  success: "text-notification-success-foreground",
  warning: "text-chart-8-active",
  error: "text-notification-error-foreground",
});

export interface MeterProps extends Omit<AriaMeterProps, "children" | "className"> {
  label?: ReactNode;
  /** Show the formatted value at the end of the label row. Default: shown with a label. */
  showValueLabel?: boolean;
  /** Helper text under the bar. */
  description?: ReactNode;
  /** Colour of the fill. Default `accent`. */
  tone?: MeterTone;
  /** Track thickness: 4, 6 (default), or 8px. */
  size?: ProgressSize;
  className?: string;
}

export function Meter({
  label,
  showValueLabel,
  description,
  tone = "accent",
  size = "md",
  className,
  ...props
}: MeterProps) {
  const showValue = showValueLabel ?? label != null;
  return (
    <AriaMeter {...props} className={cx("flex w-full flex-col gap-1.5", className)}>
      {({ percentage, valueText }) => (
        <>
          {label != null || showValue ? (
            <div className="flex items-baseline justify-between gap-3">
              {label != null ? <Label className="min-w-0 truncate">{label}</Label> : <span />}
              {showValue ? (
                <span className="shrink-0 text-body-medium text-text-secondary tabular-nums">{valueText}</span>
              ) : null}
            </div>
          ) : null}
          <ProgressTrack percentage={percentage} size={size} className={tones[tone]} />
          {description ? <span className="text-caption-1-medium text-text-secondary">{description}</span> : null}
        </>
      )}
    </AriaMeter>
  );
}
