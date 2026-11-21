import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from "react";
import { cx } from "@/utils/cx";

type TextType = "body" | "supporting" | "label" | "caption" | "code" | "display-3";
type TextColor =
  | "primary"
  | "secondary"
  | "tertiary"
  | "accent"
  | "success"
  | "warning"
  | "error"
  | "danger"
  | "inherit";
type Weight = "regular" | "medium" | "semibold" | "bold";
type TextSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";

const COLOR: Record<TextColor, string> = {
  primary: "text-text-primary",
  secondary: "text-text-secondary",
  tertiary: "text-text-tertiary",
  accent: "text-accent-600 dark:text-accent-300",
  success: "text-status-lime-text",
  warning: "text-status-orange-text",
  error: "text-text-error-primary",
  danger: "text-text-error-primary",
  inherit: "text-inherit",
};

// BoardUI composite type utilities, by (size, weight).
const SCALE: Record<TextSize, Record<"regular" | "medium" | "semibold", string>> = {
  xs: {
    regular: "text-caption-1-regular",
    medium: "text-caption-1-medium",
    semibold: "text-caption-1-semibold",
  },
  sm: {
    regular: "text-body-regular",
    medium: "text-body-medium",
    semibold: "text-body-semibold",
  },
  md: {
    regular: "text-body-regular",
    medium: "text-body-medium",
    semibold: "text-body-semibold",
  },
  lg: {
    regular: "text-headline-medium",
    medium: "text-headline-medium",
    semibold: "text-headline-semibold",
  },
  xl: {
    regular: "text-title-3-medium",
    medium: "text-title-3-medium",
    semibold: "text-title-3-semibold",
  },
  "2xl": {
    regular: "text-title-2-medium",
    medium: "text-title-2-medium",
    semibold: "text-title-2-semibold",
  },
  "3xl": {
    regular: "text-title-1-medium",
    medium: "text-title-1-medium",
    semibold: "text-title-1-semibold",
  },
};

export interface TextProps extends HTMLAttributes<HTMLSpanElement> {
  type?: TextType;
  size?: TextSize;
  weight?: Weight;
  color?: TextColor;
  hasTabularNumbers?: boolean;
  maxLines?: number;
  justify?: "start" | "center" | "end";
  wordBreak?: CSSProperties["wordBreak"];
  textWrap?: "balance" | "pretty" | "nowrap" | "wrap";
  ref?: Ref<HTMLSpanElement>;
  children?: ReactNode;
}

export function Text({
  type = "body",
  size,
  weight,
  color,
  hasTabularNumbers,
  maxLines,
  justify,
  wordBreak,
  textWrap,
  className,
  style,
  ref,
  ...props
}: TextProps) {
  const w = weight === "bold" ? "semibold" : (weight ?? "regular");
  const resolved =
    size ?? (type === "caption" ? "xs" : "md");
  return (
    <span
      ref={ref}
      className={cx(
        type === "display-3" ? "text-display-4-semibold" : SCALE[resolved][w],
        COLOR[color ?? (type === "supporting" || type === "caption" ? "secondary" : "primary")],
        type === "code" && "font-mono",
        hasTabularNumbers && "tabular-nums",
        justify && "block",
        maxLines === 1 && "block truncate",
        className,
      )}
      style={{
        textAlign: justify,
        wordBreak,
        textWrap,
        ...(maxLines && maxLines > 1
          ? {
              display: "-webkit-box",
              WebkitLineClamp: maxLines,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }
          : null),
        ...style,
      }}
      {...props}
    />
  );
}

const HEADING = {
  1: "text-title-2-medium",
  2: "text-title-3-semibold",
  3: "text-headline-semibold",
  4: "text-body-semibold",
  5: "text-body-semibold",
  6: "text-caption-1-semibold",
} as const;

export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  /** Semantic level when it differs from the visual one. */
  accessibilityLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  type?: TextType;
  weight?: Weight;
  color?: TextColor;
  justify?: "start" | "center" | "end";
  textWrap?: "balance" | "pretty" | "nowrap" | "wrap";
  ref?: Ref<HTMLHeadingElement>;
}

export function Heading({
  level = 2,
  accessibilityLevel,
  type: _type,
  weight: _weight,
  color = "primary",
  justify,
  textWrap,
  className,
  style,
  ref,
  ...props
}: HeadingProps) {
  const Tag = `h${accessibilityLevel ?? level}` as "h1";
  return (
    <Tag
      ref={ref}
      className={cx(HEADING[level], COLOR[color], className)}
      style={{ textAlign: justify, textWrap, ...style }}
      {...props}
    />
  );
}
