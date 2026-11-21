import {
  isValidElement,
  type ButtonHTMLAttributes,
  type ComponentType,
  type CSSProperties,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { Focusable } from "react-aria-components";
import {
  RiAlertLine,
  RiCheckboxCircleLine,
  RiCloseLine,
  RiErrorWarningLine,
  RiInformationLine,
} from "@remixicon/react";
import { Button as BaseButton, ButtonLink } from "@/components/base/buttons/button";
import { Avatar as BaseAvatar } from "@/components/base/avatar/avatar";
import { Chip, type ChipColor } from "@/components/base/badges/chip";
import { Divider as BaseDivider } from "@/components/base/divider/divider";
import { Skeleton as BaseSkeleton } from "@/components/base/skeleton/skeleton";
import { ProgressTrack } from "@/components/base/progress/progress";
import { SpinnerGlyph } from "@/components/base/spinner/spinner";
import { Switch as BaseSwitch } from "@/components/base/switch/switch";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import {
  Tooltip as BaseTooltip,
  TooltipTrigger,
} from "@/components/base/tooltip/tooltip";
import { toast } from "@/components/base/toast/toast";
import { cx } from "@/utils/cx";

export type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

const NAMED_ICONS: Record<string, IconComponent> = {
  info: RiInformationLine,
  error: RiErrorWarningLine,
  warning: RiAlertLine,
  success: RiCheckboxCircleLine,
  close: RiCloseLine,
};

const ICON_SIZE = { xs: "size-3.5", sm: "size-4", md: "size-5", lg: "size-6", xl: "size-8" };
const ICON_COLOR = {
  primary: "text-foreground-icon-primary",
  secondary: "text-text-secondary",
  tertiary: "text-text-tertiary",
  accent: "text-accent-500",
  success: "text-status-lime-text",
  warning: "text-status-orange-text",
  error: "text-text-error-primary",
  inherit: "text-current",
};

export function Icon({
  icon,
  size = "sm",
  color = "inherit",
  className,
}: {
  icon: IconComponent | keyof typeof NAMED_ICONS | string;
  size?: keyof typeof ICON_SIZE;
  color?: keyof typeof ICON_COLOR;
  className?: string;
}) {
  const Glyph = typeof icon === "string" ? (NAMED_ICONS[icon] ?? RiInformationLine) : icon;
  return (
    <Glyph
      aria-hidden
      className={cx("shrink-0", ICON_SIZE[size], ICON_COLOR[color], className)}
    />
  );
}

/** Wraps any element with a BoardUI tooltip. */
export function Tooltip({
  content,
  placement,
  isEnabled = true,
  children,
}: {
  content: ReactNode;
  placement?: "top" | "bottom" | "start" | "end" | "left" | "right";
  isEnabled?: boolean;
  children: ReactNode;
}) {
  if (!isEnabled || !content) return <>{children}</>;
  return (
    <TooltipTrigger>
      <Focusable>
        {isValidElement(children) &&
        typeof children.type !== "string" ? (
          (children as ReactElement<Record<string, unknown>, string>)
        ) : (
          <span tabIndex={0} className="inline-flex">
            {children}
          </span>
        )}
      </Focusable>
      <BaseTooltip placement={placement}>{content}</BaseTooltip>
    </TooltipTrigger>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "destructive" | "danger";
type ControlSize = "sm" | "md" | "lg";
const BUTTON_SIZE = { sm: "small", md: "medium", lg: "medium" } as const;

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "disabled"> {
  label: string;
  variant?: Variant;
  size?: ControlSize;
  href?: string;
  target?: string;
  rel?: string;
  isDisabled?: boolean;
  isLoading?: boolean;
  /** Icon element shown before the label. */
  icon?: ReactNode;
  endIcon?: ReactNode;
  isIconOnly?: boolean;
  width?: number | string;
  tooltip?: ReactNode;
  children?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  label,
  variant = "secondary",
  size = "md",
  href,
  target,
  rel,
  isDisabled,
  isLoading,
  icon,
  endIcon,
  isIconOnly,
  width,
  tooltip,
  children,
  className,
  style,
  ref,
  ...props
}: ButtonProps) {
  const boardVariant = variant === "destructive" ? "danger" : variant;
  const content = (
    <>
      {isLoading ? <SpinnerGlyph size="sm" track={false} className="text-current" /> : icon}
      {isIconOnly ? <span className="sr-only">{label}</span> : (children ?? label)}
      {endIcon}
    </>
  );
  const shared = {
    variant: boardVariant,
    size: BUTTON_SIZE[size],
    iconOnly: isIconOnly,
    className: cx("gap-1.5", width === "100%" && "w-full", className),
    style: {
      width: width === "100%" ? undefined : width,
      ...style,
    } as CSSProperties,
  };
  const node =
    href && !isDisabled ? (
      <ButtonLink
        {...shared}
        href={href}
        target={target}
        rel={rel}
        aria-label={isIconOnly ? label : undefined}
        onClick={props.onClick as never}
      >
        {content}
      </ButtonLink>
    ) : (
      <BaseButton
        ref={ref}
        {...props}
        {...shared}
        disabled={isDisabled || isLoading}
        aria-busy={isLoading || undefined}
        aria-label={isIconOnly ? label : props["aria-label"]}
      >
        {content}
      </BaseButton>
    );
  const hint = tooltip ?? (isIconOnly ? label : null);
  return hint ? <Tooltip content={hint}>{node}</Tooltip> : node;
}

/** Icon-only action; `icon` is an element (`<Icon icon={X} />`). */
export function IconButton({
  icon,
  tooltip,
  variant = "ghost",
  ...props
}: Omit<ButtonProps, "isIconOnly" | "tooltip"> & { tooltip?: ReactNode | false }) {
  return (
    <Button
      {...props}
      variant={variant}
      icon={icon}
      isIconOnly
      tooltip={tooltip === false ? undefined : (tooltip ?? props.label)}
    />
  );
}

export function Link({
  href,
  color,
  weight,
  className,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  color?: "accent" | "secondary" | "primary";
  weight?: "regular" | "medium" | "semibold";
}) {
  return (
    <a
      href={href}
      className={cx(
        "rounded-sm underline-offset-4 outline-none transition-colors duration-150 hover:underline focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        color === "secondary"
          ? "text-text-secondary hover:text-text-primary"
          : color === "primary"
            ? "text-text-primary"
            : "text-accent-600 dark:text-accent-300",
        weight === "semibold" ? "font-semibold" : weight === "medium" ? "font-medium" : undefined,
        className,
      )}
      {...props}
    />
  );
}

type Tone = "info" | "success" | "warning" | "error";
const BANNER_TONE: Record<Tone, { box: string; icon: IconComponent; iconClass: string }> = {
  info: {
    box: "bg-status-blue-background/40 border-status-blue-background",
    icon: RiInformationLine,
    iconClass: "text-status-blue-text",
  },
  success: {
    box: "bg-status-lime-background/40 border-status-lime-background",
    icon: RiCheckboxCircleLine,
    iconClass: "text-status-lime-text",
  },
  warning: {
    box: "bg-status-orange-background/40 border-status-orange-background",
    icon: RiAlertLine,
    iconClass: "text-status-orange-text",
  },
  error: {
    box: "bg-status-rose-background/40 border-status-rose-background",
    icon: RiErrorWarningLine,
    iconClass: "text-status-rose-text",
  },
};

export type BannerContainer = "card" | "section" | "page";

/** Inline status message that stays in the page flow. */
export function Banner({
  status = "info",
  title,
  description,
  endContent,
  container: _container,
  className,
  children,
}: {
  status?: Tone;
  title?: ReactNode;
  description?: ReactNode;
  endContent?: ReactNode;
  container?: BannerContainer;
  isDismissable?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const tone = BANNER_TONE[status];
  const Glyph = tone.icon;
  return (
    <div
      role={status === "error" ? "alert" : "status"}
      className={cx(
        "flex items-start gap-2.5 rounded-2xl border px-3.5 py-3",
        tone.box,
        className,
      )}
    >
      <Glyph aria-hidden className={cx("mt-0.5 size-4 shrink-0", tone.iconClass)} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {title && <span className="text-body-medium text-text-primary">{title}</span>}
        {(description ?? children) && (
          <span className="text-body-regular text-text-secondary">
            {description ?? children}
          </span>
        )}
      </div>
      {endContent && <div className="shrink-0">{endContent}</div>}
    </div>
  );
}

const TOKEN_COLOR: Record<string, ChipColor> = {
  neutral: "neutral",
  gray: "neutral",
  default: "neutral",
  blue: "blue",
  info: "blue",
  cyan: "cyan",
  teal: "cyan",
  green: "lime",
  success: "lime",
  lime: "lime",
  yellow: "yellow",
  orange: "orange",
  warning: "orange",
  amber: "orange",
  red: "rose",
  error: "rose",
  danger: "rose",
  rose: "rose",
  pink: "rose",
  purple: "purple",
  violet: "purple",
};

/** Status label, rendered as a BoardUI Chip. */
export function Token({
  label,
  color = "neutral",
  icon,
  size: _size,
  className,
}: {
  label: ReactNode;
  color?: string;
  icon?: ReactNode;
  size?: ControlSize;
  className?: string;
}) {
  return (
    <Chip
      variant="caption"
      color={TOKEN_COLOR[color] ?? "neutral"}
      className={cx("gap-1", className)}
    >
      {icon}
      {label}
    </Chip>
  );
}

const AVATAR_COLORS = ["neutral", "blue", "lime", "pink"] as const;

export function Avatar({
  name,
  size = "md",
  src,
  tooltip,
  className,
}: {
  name: string;
  size?: "xs" | "sm" | "md" | "lg";
  src?: string;
  tooltip?: boolean;
  shape?: string;
  className?: string;
}) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = (
    (words[0]?.[0] ?? "") + (words.length > 1 ? words[words.length - 1][0] : "")
  ).toUpperCase();
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const node = (
    <BaseAvatar
      size={size}
      src={src}
      initials={initials}
      color={AVATAR_COLORS[hash % AVATAR_COLORS.length]}
      aria-label={name}
      role="img"
      className={className}
    />
  );
  return tooltip === false ? node : <Tooltip content={name}>{node}</Tooltip>;
}

export function Divider({
  orientation,
  className,
}: {
  orientation?: "horizontal" | "vertical";
  className?: string;
}) {
  if (orientation === "vertical")
    return <span aria-hidden className={cx("w-px self-stretch bg-separator-border", className)} />;
  return <BaseDivider className={className} />;
}

export function Skeleton({
  width = "100%",
  height = "1rem",
  index = 0,
  radius,
  className,
}: {
  width?: number | string;
  height?: number | string;
  /** Staggers the shimmer so stacked lines do not pulse in unison. */
  index?: number;
  radius?: number;
  className?: string;
}) {
  return (
    <BaseSkeleton
      className={cx("max-w-full", className)}
      style={{
        width,
        height,
        animationDelay: `${index * 80}ms`,
        borderRadius: radius ? `calc(var(--spacing) * ${radius})` : undefined,
      }}
    />
  );
}

export function ProgressBar({
  label,
  value = 0,
  isIndeterminate,
  variant,
  className,
}: {
  label: string;
  isLabelHidden?: boolean;
  value?: number;
  isIndeterminate?: boolean;
  variant?: "accent" | "success" | "warning" | "error" | string;
  className?: string;
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={isIndeterminate ? undefined : Math.round(value)}
      className={cx("w-full", className)}
    >
      <ProgressTrack
        percentage={value}
        isIndeterminate={isIndeterminate}
        className={
          variant === "success"
            ? "text-status-lime-text"
            : variant === "warning"
              ? "text-status-orange-text"
              : variant === "error"
                ? "text-status-rose-text"
                : undefined
        }
      />
    </div>
  );
}

export function Switch({
  label,
  value,
  onChange,
  size = "md",
  labelIcon,
  labelPosition = "end",
  isDisabled,
  htmlName,
}: {
  label: ReactNode;
  value: boolean;
  onChange: (value: boolean) => void;
  size?: ControlSize;
  labelIcon?: ReactNode;
  labelPosition?: "start" | "end";
  isDisabled?: boolean;
  htmlName?: string;
}) {
  return (
    <BaseSwitch
      isSelected={value}
      onChange={onChange}
      size={size === "lg" ? "md" : size}
      isDisabled={isDisabled}
      name={htmlName}
      className={labelPosition === "start" ? "flex-row-reverse" : undefined}
    >
      <span className="inline-flex items-center gap-1.5 text-body-medium text-text-primary">
        {labelIcon}
        {label}
      </span>
    </BaseSwitch>
  );
}

export function CheckboxInput({
  label,
  description,
  value,
  onChange,
  htmlName,
  htmlValue,
  isDisabled,
}: {
  label: ReactNode;
  description?: ReactNode;
  value: boolean;
  onChange: (value: boolean) => void;
  htmlName?: string;
  htmlValue?: string;
  isDisabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Checkbox
        isSelected={value}
        onChange={onChange}
        name={htmlName}
        value={htmlValue}
        isDisabled={isDisabled}
      >
        <span className="text-body-medium text-text-primary">{label}</span>
      </Checkbox>
      {description && (
        <span className="ps-7 text-caption-1-regular text-text-secondary">
          {description}
        </span>
      )}
    </div>
  );
}

export function Thumbnail({
  src,
  label,
  size = 40,
  className,
}: {
  src?: string;
  label: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border-button-default bg-background-secondary-default text-caption-1-semibold text-text-secondary",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        <img src={src} alt={label} loading="lazy" className="size-full object-cover" />
      ) : (
        label.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}

/** Toast hook backed by BoardUI `toast()`. */
export function useToast() {
  return ({
    body,
    status = "success",
  }: {
    body: ReactNode;
    status?: "success" | "error" | "info";
    [key: string]: unknown;
  }) =>
    toast(body, {
      status: status === "info" ? "information" : status,
    });
}

export type DivProps = HTMLAttributes<HTMLDivElement>;
