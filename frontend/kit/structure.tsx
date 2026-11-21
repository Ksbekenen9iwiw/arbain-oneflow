import {
  Children,
  createContext,
  useContext,
  isValidElement,
  type CSSProperties,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { RiCheckLine } from "@remixicon/react";
import { Modal, ModalDialog, ModalHeader } from "@/components/base/modal/modal";
import { cx } from "@/utils/cx";

const space = (value?: number) =>
  value === undefined ? undefined : `calc(var(--spacing) * ${value})`;

/** Row list used for phone layouts and compact queues. */
export function List({
  header,
  hasDividers = true,
  children,
  className,
}: {
  header?: ReactNode;
  hasDividers?: boolean;
  density?: string;
  edgeCompensation?: unknown;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex min-w-0 flex-col", className)}>
      {header && (
        <div className="pb-2 text-caption-1-semibold text-text-tertiary">{header}</div>
      )}
      <ul
        className={cx(
          "flex min-w-0 flex-col",
          hasDividers && "divide-y divide-separator-border",
        )}
      >
        {children}
      </ul>
    </div>
  );
}

export function ListItem({
  label,
  description,
  startContent,
  endContent,
  isSelected,
  isDisabled,
  onClick,
  href,
}: {
  label: ReactNode;
  description?: ReactNode;
  startContent?: ReactNode;
  endContent?: ReactNode;
  isSelected?: boolean;
  isDisabled?: boolean;
  onClick?: () => void;
  href?: string;
}) {
  const body = (
    <>
      {startContent && <span className="shrink-0 pt-0.5">{startContent}</span>}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body-medium text-text-primary">{label}</span>
        {description && (
          <span className="text-body-regular text-text-secondary">{description}</span>
        )}
      </span>
      {endContent && <span className="shrink-0">{endContent}</span>}
    </>
  );
  const row = cx(
    "flex w-full min-w-0 items-start gap-3 py-3 text-start",
    isSelected && "rounded-2xl bg-background-secondary-default px-3",
    isDisabled && "opacity-50",
  );
  const interactive =
    "cursor-pointer rounded-2xl px-3 outline-none transition-colors duration-150 hover:bg-background-secondary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring";
  return (
    <li data-row className="min-w-0">
      {href ? (
        <a href={href} className={cx(row, interactive)}>
          {body}
        </a>
      ) : onClick ? (
        <button
          type="button"
          disabled={isDisabled}
          aria-current={isSelected || undefined}
          onClick={onClick}
          className={cx(row, interactive)}
        >
          {body}
        </button>
      ) : (
        <div className={row}>{body}</div>
      )}
    </li>
  );
}

/** Label/value pairs. */
export function MetadataList({
  label,
  children,
  columns,
}: {
  label?: string;
  children: ReactNode;
  columns?: number;
  orientation?: string;
}) {
  return (
    <dl
      aria-label={label}
      className="grid gap-x-6 gap-y-3"
      style={{
        gridTemplateColumns: `repeat(${columns ?? 1}, minmax(0, 1fr))`,
      }}
    >
      {children}
    </dl>
  );
}

export function MetadataListItem({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-caption-1-medium text-text-tertiary">{label}</dt>
      <dd className="m-0 min-w-0 text-body-medium text-text-primary">{children}</dd>
    </div>
  );
}

/** BoardUI modal with app-sized widths. */
export function Dialog({
  isOpen,
  onOpenChange,
  width,
  children,
  "aria-label": ariaLabel,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  purpose?: string;
  width?: number | string;
  maxHeight?: string;
  padding?: number;
  children: ReactNode;
  "aria-label"?: string;
}) {
  const px = typeof width === "number" ? width : width ? parseFloat(width) * 16 : 480;
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size={px <= 400 ? "sm" : px <= 480 ? "md" : px <= 640 ? "lg" : "xl"}
      aria-label={ariaLabel}
    >
      <ModalDialog aria-label={ariaLabel}>{children}</ModalDialog>
    </Modal>
  );
}

export function DialogHeader({
  title,
  content,
}: {
  title: ReactNode;
  content?: ReactNode;
  hasDivider?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}) {
  return <ModalHeader title={title} description={content} closeLabel="Tutup" />;
}

interface StepProps {
  step: number;
  label: string;
  isDisabled?: boolean;
  status?: "error" | "complete";
}

export function Step(_props: StepProps) {
  return null;
}

/** Horizontal progress steps; completed steps are clickable. */
export function Stepper({
  activeStep,
  onStepClick,
  label,
  children,
}: {
  activeStep: number;
  onStepClick?: (step: number) => void;
  label: string;
  orientation?: string;
  density?: string;
  indicatorPosition?: string;
  children: ReactNode;
}) {
  const steps = Children.toArray(children).filter(isValidElement) as ReactElement<StepProps>[];
  return (
    <ol aria-label={label} className="flex w-full items-start gap-2">
      {steps.map(({ props }, index) => {
        const isActive = props.step === activeStep;
        const isDone = props.step < activeStep;
        const isError = props.status === "error";
        return (
          <li key={props.step} className="flex min-w-0 flex-1 flex-col gap-2">
            <span
              aria-hidden
              className={cx(
                "h-1 rounded-full transition-colors duration-300",
                isError
                  ? "bg-status-rose-text"
                  : isActive || isDone
                    ? "bg-accent-500"
                    : "bg-border-button-default",
              )}
            />
            <button
              type="button"
              disabled={props.isDisabled || !onStepClick}
              aria-current={isActive ? "step" : undefined}
              onClick={() => onStepClick?.(props.step)}
              className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg text-start outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring disabled:cursor-default"
            >
              <span
                className={cx(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-caption-1-semibold transition-colors duration-300",
                  isError
                    ? "bg-status-rose-background text-status-rose-text"
                    : isActive
                      ? "bg-accent-500 text-white"
                      : isDone
                        ? "bg-accent-100 text-accent-700 dark:bg-accent-950 dark:text-accent-300"
                        : "bg-background-tertiary-default text-text-tertiary",
                )}
              >
                {isDone && !isError ? <RiCheckLine aria-hidden className="size-3.5" /> : index + 1}
              </span>
              <span
                className={cx(
                  "hidden truncate text-body-medium sm:block",
                  isActive ? "text-text-primary" : "text-text-secondary",
                )}
              >
                {props.label}
                {isError && <span className="sr-only"> (perlu diperbaiki)</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}


const LayoutWidth = createContext<number | undefined>(undefined);

function Inner({ children }: { children: ReactNode }) {
  const width = useContext(LayoutWidth);
  return (
    <div className="mx-auto w-full min-w-0" style={{ maxWidth: width }}>
      {children}
    </div>
  );
}

type RegionProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  padding?: number;
  paddingBlockEnd?: number;
  hasDivider?: boolean;
  ref?: Ref<HTMLDivElement>;
};

/** Page frame: fixed header, scrolling content, fixed footer, optional side panel. */
export function Layout({
  height = "fill",
  contentWidth,
  header,
  content,
  footer,
  start,
  end,
  children,
  className,
}: {
  height?: "fill" | "auto";
  contentWidth?: number;
  padding?: number;
  defaultHasDividers?: boolean;
  header?: ReactNode;
  content?: ReactNode;
  footer?: ReactNode;
  start?: ReactNode;
  end?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <LayoutWidth value={contentWidth}>
      <div
        className={cx(
          "flex min-h-0 min-w-0",
          height === "fill" ? "h-full" : "max-h-full",
          className,
        )}
      >
        {start}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {header}
          {content ?? children}
          {footer}
        </div>
        {end}
      </div>
    </LayoutWidth>
  );
}

export function LayoutHeader({
  padding = 6,
  paddingBlockEnd,
  hasDivider = true,
  className,
  style,
  children,
  ref,
  ...props
}: RegionProps) {
  return (
    <header
      ref={ref}
      className={cx(
        "shrink-0 bg-background-primary-default",
        hasDivider && "border-b border-separator-border",
        className,
      )}
      style={{ padding: space(padding), paddingBlockEnd: space(paddingBlockEnd), ...style }}
      {...props}
    >
      <Inner>{children}</Inner>
    </header>
  );
}

export function LayoutContent({
  padding = 6,
  className,
  style,
  children,
  ref,
  ...props
}: RegionProps) {
  return (
    <div
      ref={ref}
      className={cx("min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain", className)}
      style={{ padding: space(padding), ...style }}
      {...props}
    >
      <Inner>{children}</Inner>
    </div>
  );
}

export function LayoutFooter({
  padding = 4,
  className,
  style,
  children,
  ref,
  ...props
}: RegionProps) {
  return (
    <footer
      ref={ref}
      className={cx(
        "shrink-0 border-t border-separator-border bg-background-primary-default",
        className,
      )}
      style={{ padding: space(padding), ...style }}
      {...props}
    >
      <Inner>{children}</Inner>
    </footer>
  );
}

export function LayoutPanel({
  width = 340,
  padding = 6,
  hasDivider,
  className,
  style,
  ...props
}: RegionProps & { width?: number }) {
  return (
    <aside
      className={cx(
        "min-h-0 shrink-0 overflow-y-auto bg-background-primary-default",
        hasDivider && "border-s border-separator-border",
        className,
      )}
      style={{ width, padding: space(padding), ...style }}
      {...props}
    />
  );
}
