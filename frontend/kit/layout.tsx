import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from "react";
import { cx } from "@/utils/cx";

/** Spacing step on Tailwind's scale (1 = 4px). */
export type Space = number;
type Size = number | string;

const space = (value?: Space) =>
  value === undefined ? undefined : `calc(var(--spacing) * ${value})`;
const size = (value?: Size) =>
  typeof value === "number" ? `${value}px` : value;

type Align = "start" | "center" | "end" | "stretch" | "between";
const ALIGN: Record<string, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
  between: "space-between",
};

export interface BoxProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  gap?: Space;
  padding?: Space;
  paddingInline?: Space;
  paddingBlock?: Space;
  paddingBlockStart?: Space;
  paddingBlockEnd?: Space;
  width?: Size;
  height?: Size;
  maxWidth?: Size;
  minHeight?: Size;
  hAlign?: Align;
  vAlign?: Align;
  wrap?: "wrap" | "nowrap";
  ref?: Ref<HTMLDivElement>;
  children?: ReactNode;
}

function boxStyle(props: BoxProps, direction: "row" | "column"): CSSProperties {
  const main = direction === "row" ? props.hAlign : props.vAlign;
  const cross = direction === "row" ? props.vAlign : props.hAlign;
  return {
    gap: space(props.gap),
    padding: space(props.padding),
    paddingInline: space(props.paddingInline),
    paddingBlock: space(props.paddingBlock),
    paddingBlockStart: space(props.paddingBlockStart),
    paddingBlockEnd: space(props.paddingBlockEnd),
    width: size(props.width),
    height: size(props.height),
    maxWidth: size(props.maxWidth),
    minHeight: size(props.minHeight),
    justifyContent: main ? ALIGN[main] : undefined,
    alignItems: cross ? ALIGN[cross] : undefined,
    flexWrap: props.wrap,
  };
}

function Box({
  direction,
  className,
  style,
  ref,
  gap: _gap,
  padding: _padding,
  paddingInline: _pi,
  paddingBlock: _pb,
  paddingBlockStart: _pbs,
  paddingBlockEnd: _pbe,
  width: _w,
  height: _h,
  maxWidth: _mw,
  minHeight: _mh,
  hAlign: _ha,
  vAlign: _va,
  wrap: _wrap,
  ...rest
}: BoxProps & { direction: "row" | "column" }) {
  const props = {
    gap: _gap,
    padding: _padding,
    paddingInline: _pi,
    paddingBlock: _pb,
    paddingBlockStart: _pbs,
    paddingBlockEnd: _pbe,
    width: _w,
    height: _h,
    maxWidth: _mw,
    minHeight: _mh,
    hAlign: _ha,
    vAlign: _va,
    wrap: _wrap,
  };
  return (
    <div
      ref={ref}
      className={cx(
        "flex min-w-0",
        direction === "row" ? "flex-row" : "flex-col",
        className,
      )}
      style={{ ...boxStyle(props, direction), ...style }}
      data-tight={direction !== "row" && Number(_gap) <= 1 ? "" : undefined}
      {...rest}
    />
  );
}

/** Vertical stack: `hAlign` is the cross axis, `vAlign` the main axis. */
export function VStack(props: BoxProps) {
  return <Box direction="column" {...props} />;
}

/** Horizontal stack: `hAlign` is the main axis, `vAlign` the cross axis. */
export function HStack({
  justify,
  ...props
}: BoxProps & { justify?: Align }) {
  return <Box direction="row" {...props} hAlign={props.hAlign ?? justify} />;
}

export function StackItem({
  size: grow,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { size?: "fill" | "hug" }) {
  return (
    <div
      className={cx(grow === "fill" ? "min-w-0 flex-1" : "shrink-0", className)}
      {...props}
    />
  );
}

export function Center({
  height,
  className,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & { height?: Size }) {
  return (
    <div
      className={cx("flex items-center justify-center", className)}
      style={{ height: size(height), ...style }}
      {...props}
    />
  );
}

type Columns =
  | number
  | string
  | { minWidth: number; repeat?: "fit" | "fill"; max?: number };

/** Responsive grid. A number gives equal columns that collapse to one on phones. */
export function Grid({
  columns = 1,
  gap,
  align,
  className,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  columns?: Columns;
  gap?: Space;
  align?: "start" | "center" | "end" | "stretch";
}) {
  const template =
    typeof columns === "string"
      ? columns
      : typeof columns === "number"
        ? `repeat(${columns}, minmax(0, 1fr))`
        : `repeat(auto-${columns.repeat ?? "fit"}, minmax(${columns.minWidth}px, 1fr))`;
  return (
    <div
      className={cx("grid grid-cols-1 md:[grid-template-columns:var(--kit-grid)]", className)}
      style={
        {
          "--kit-grid": template,
          gap: space(gap),
          alignItems: align,
          ...style,
        } as CSSProperties
      }
      {...props}
    />
  );
}

export function GridSpan({
  columns = 1,
  className,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & { columns?: number }) {
  return (
    <div
      className={cx("min-w-0 md:[grid-column:var(--kit-span)]", className)}
      style={{ "--kit-span": `span ${columns}`, ...style } as CSSProperties}
      {...props}
    />
  );
}

export function VisuallyHidden(props: HTMLAttributes<HTMLSpanElement>) {
  return <span className="sr-only" {...props} />;
}

export function Section(props: BoxProps) {
  return <VStack {...props} />;
}

/** BoardUI panel surface: rounded-3xl card on the page ground. */
export function Card({
  padding = 4,
  elevation: _elevation,
  variant,
  width,
  minHeight,
  className,
  style,
  ref,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  padding?: Space;
  elevation?: number | string;
  variant?: "default" | "muted" | "outline" | string;
  width?: Size;
  minHeight?: Size;
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      className={cx(
        "oneflow-card min-w-0 rounded-3xl",
        variant === "transparent"
          ? ""
          : variant === "outline"
            ? "border border-border-button-default bg-background-primary-default"
            : "bg-background-secondary-default",
        className,
      )}
      style={{
        padding: space(padding),
        width: size(width),
        minHeight: size(minHeight),
        ...style,
      }}
      {...props}
    />
  );
}
