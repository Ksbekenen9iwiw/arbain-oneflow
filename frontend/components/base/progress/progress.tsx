"use client";

import type { ReactNode } from "react";
import { ProgressBar as AriaProgressBar } from "react-aria-components";
import type { ProgressBarProps as AriaProgressBarProps } from "react-aria-components";
import { Label } from "@/components/base/input/label";
import { SpinnerGlyph } from "@/components/base/spinner/spinner";
import { useDirection } from "@/components/foundations/direction/direction";
import { cx, sortCx } from "@/utils/cx";

/**
 * Progress — how far along a task is: an upload, an import, an onboarding
 * checklist. Built on React Aria's ProgressBar, so it is announced with its
 * label and value, and formats the value for the locale.
 *
 *   <ProgressBar label="Uploading Q3-report.pdf" value={64} />
 *   <ProgressBar label="Preparing export" isIndeterminate />
 *   <ProgressCircle value={64} aria-label="Upload" />
 *
 * The bar is the agent limits card's rounded rail with an accent fill, on
 * File Upload's track colour. The fill moves by translate rather than width, so it eases
 * to each new value on the compositor (500ms, the card's ease-out).
 *
 * Indeterminate, a band of light sweeps the track, drawn like Spinner and
 * Composer Loader: a crisp core with a rounded head, a tight glow and a wide
 * bloom that bleed a few pixels past the rail, the soft layers pulled back
 * so the sharp head leads. It runs right to left in RTL. The ring's
 * indeterminate state is Spinner's orbiting light. Reduced motion slows the
 * sweep rather than stopping it.
 */

export type ProgressSize = "sm" | "md" | "lg";

const EASE = "ease-[cubic-bezier(0.22,1,0.36,1)]";

const styles = sortCx({
  track: {
    sm: "h-1",
    md: "h-1.5",
    lg: "h-2",
  },
  ring: {
    sm: { box: 16, line: 2, spinner: "sm" },
    md: { box: 24, line: 2.5, spinner: "lg" },
    lg: { box: 32, line: 3, spinner: "xl" },
  },
});

/* -------------------------------------------------------------------- bar */

export interface ProgressBarProps extends Omit<AriaProgressBarProps, "children" | "className"> {
  label?: ReactNode;
  /** Show the formatted value at the end of the label row. Default: shown with a label. */
  showValueLabel?: boolean;
  /** Helper text under the bar. */
  description?: ReactNode;
  /** Track thickness: 4, 6 (default), or 8px. */
  size?: ProgressSize;
  className?: string;
}

/** The sweeping band of light for an indeterminate bar. */
function Sweep() {
  return (
    // The clip keeps the light inside the rail's length but lets the glow
    // and bloom bleed past its thickness.
    <span aria-hidden className="absolute inset-0 [clip-path:inset(-8px_0_round_9999px)]">
      <span
        className={cx(
          "absolute inset-y-0 left-0 w-2/5",
          "animate-[bui-progress-sweep_1.6s_cubic-bezier(0.65,0,0.35,1)_infinite]",
          "rtl:[animation-direction:reverse] motion-reduce:[animation-duration:4s]",
        )}
      >
        <span className="absolute inset-0 rtl:-scale-x-100">
          <span className="absolute -inset-y-[5px] right-[10px] left-0 rounded-full bg-linear-to-r from-transparent to-current opacity-30 blur-[5px]" />
          <span className="absolute -inset-y-[1.5px] right-[4px] left-[25%] rounded-full bg-linear-to-r from-transparent to-current opacity-60 blur-[2px]" />
          <span className="absolute inset-y-0 right-0 left-[35%] rounded-full bg-linear-to-r from-transparent to-current" />
        </span>
      </span>
    </span>
  );
}

export interface ProgressTrackProps {
  /** 0 to 100. */
  percentage: number;
  size?: ProgressSize;
  /** Draw the indeterminate sweep instead of a fill. */
  isIndeterminate?: boolean;
  /** Colour of the fill, from the text colour. Default accent. */
  className?: string;
}

/** The rail and its fill, shared by ProgressBar and Meter. */
export function ProgressTrack({ percentage, size = "md", isIndeterminate = false, className }: ProgressTrackProps) {
  const direction = useDirection();
  return (
    // The rail is File Upload's ring track colour, which keeps an edge on
    // every surface in both themes (chart-track matches dark cards).
    <div className={cx("relative w-full rounded-full bg-border-button-default text-accent-500", styles.track[size], className)}>
      {isIndeterminate ? (
        <Sweep />
      ) : (
        <span className="absolute inset-0 overflow-hidden rounded-full">
          <span
            className={cx("absolute inset-0 rounded-full bg-current transition-[translate] duration-500 motion-reduce:transition-none", EASE)}
            style={{ translate: `${(direction === "rtl" ? 1 : -1) * (100 - Math.min(100, Math.max(0, percentage)))}% 0` }}
          />
        </span>
      )}
    </div>
  );
}

export function ProgressBar({
  label,
  showValueLabel,
  description,
  size = "md",
  isIndeterminate,
  className,
  ...props
}: ProgressBarProps) {
  const showValue = showValueLabel ?? (label != null && !isIndeterminate);

  return (
    <AriaProgressBar {...props} isIndeterminate={isIndeterminate} className={cx("flex w-full flex-col gap-1.5", className)}>
      {({ percentage = 0, valueText }) => (
        <>
          {label != null || showValue ? (
            <div className="flex items-baseline justify-between gap-3">
              {label != null ? <Label className="min-w-0 truncate">{label}</Label> : <span />}
              {showValue ? (
                <span className="shrink-0 text-body-medium text-text-secondary tabular-nums">{valueText}</span>
              ) : null}
            </div>
          ) : null}
          <ProgressTrack percentage={percentage} size={size} isIndeterminate={isIndeterminate} />
          {description ? <span className="text-caption-1-medium text-text-secondary">{description}</span> : null}
        </>
      )}
    </AriaProgressBar>
  );
}

/* ------------------------------------------------------------------- ring */

export interface ProgressCircleProps extends Omit<AriaProgressBarProps, "children" | "className"> {
  /** 16, 24 (default), or 32px. */
  size?: ProgressSize;
  /** Colour of the arc, from the text colour. Default accent. */
  className?: string;
}

/**
 * A ring for tight spots: a file tile, a table cell, a checklist header. Name
 * it with `aria-label`. The arc draws by stroke-dashoffset, a paint-only
 * change on a few pixels of SVG, eased like the bar.
 */
export function ProgressCircle({ size = "md", isIndeterminate, className, ...props }: ProgressCircleProps) {
  const { box, line, spinner } = styles.ring[size];
  const radius = (box - line) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <AriaProgressBar {...props} isIndeterminate={isIndeterminate} className="inline-flex shrink-0">
      {({ percentage = 0 }) =>
        isIndeterminate ? (
          <SpinnerGlyph size={spinner as "sm" | "lg" | "xl"} className={className} />
        ) : (
          <svg
            aria-hidden
            width={box}
            height={box}
            viewBox={`0 0 ${box} ${box}`}
            className={cx("-rotate-90 text-accent-500", className)}
          >
            <circle cx={box / 2} cy={box / 2} r={radius} fill="none" strokeWidth={line} className="stroke-border-button-default" />
            <circle
              cx={box / 2}
              cy={box / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={line}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - percentage / 100)}
              className={cx("transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none", EASE)}
            />
          </svg>
        )
      }
    </AriaProgressBar>
  );
}
