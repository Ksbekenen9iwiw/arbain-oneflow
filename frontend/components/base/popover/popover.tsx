"use client";

import { Children, createContext, isValidElement, useContext, useRef, useState } from "react";
import type { ReactElement, ReactNode, RefObject } from "react";
import {
  Dialog as AriaDialog,
  DialogTrigger as AriaDialogTrigger,
  Heading as AriaHeading,
  OverlayArrow as AriaOverlayArrow,
  Popover as AriaPopover,
  Pressable,
} from "react-aria-components";
import type { DialogRenderProps, PopoverProps as AriaPopoverProps } from "react-aria-components";
import { TOOLTIP_CARETS } from "@/components/base/tooltip/tooltip";
import { useDirection } from "@/components/foundations/direction/direction";
import { cx } from "@/utils/cx";
import { useDismissOnOutsidePress, useTriggerToggle } from "@/utils/use-dismiss-on-outside-press";

/**
 * Popover — free-form content anchored to a trigger: a share link, a short
 * form, an explanation behind an info icon. Built on React Aria's
 * DialogTrigger, Popover, and Dialog, so it positions and flips itself,
 * Escape closes it, and focus returns to the trigger.
 *
 *   <PopoverTrigger>
 *     <Button variant="secondary">Share</Button>
 *     <Popover showArrow>
 *       <PopoverHeader title="Share dashboard" description="…" />
 *       …content…
 *     </Popover>
 *   </PopoverTrigger>
 *
 * Like Select and Dropdown it is non-modal: React Aria's modal popovers lock
 * page scroll, and the reflow shunts sticky layout. Outside-press dismissal
 * is restored with useDismissOnOutsidePress, and pressing the trigger again
 * closes it.
 *
 * Surface: the composer permission popover's recipe, radius 20 with p-1.5,
 * 1px border/button/default, background/primary, shadow/dropdown. The
 * optional arrow is Tooltip's caret in the same colours. Motion is the menu
 * family's: 150ms fade, scale 0.95 and 2px blur in and out, grown from the
 * point nearest the trigger. Reduced motion keeps only the fade.
 */

interface PopoverContextValue {
  popoverRef: RefObject<HTMLElement | null>;
}

const PopoverContext = createContext<PopoverContextValue | null>(null);

export interface PopoverTriggerProps {
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  /**
   * The trigger, then the Popover. The trigger can be any BoardUI button:
   * anything that forwards its ref and spreads its props.
   */
  children: ReactNode;
}

export function PopoverTrigger({ isOpen: controlledOpen, defaultOpen = false, onOpenChange, children }: PopoverTriggerProps) {
  const triggerRef = useRef<HTMLElement>(null);
  const popoverRef = useRef<HTMLElement>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpen = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  useDismissOnOutsidePress(isOpen, () => setOpen(false), [triggerRef, popoverRef]);
  // Pressing the trigger while open closes the popover instead of reopening it.
  const allowOpenChange = useTriggerToggle(isOpen, triggerRef);

  const [trigger, ...rest] = Children.toArray(children);
  return (
    <PopoverContext.Provider value={{ popoverRef }}>
      <AriaDialogTrigger isOpen={isOpen} onOpenChange={(next) => allowOpenChange(next) && setOpen(next)}>
        {isValidElement(trigger) ? (
          <Pressable ref={triggerRef}>{trigger as ReactElement<Record<string, unknown>, string>}</Pressable>
        ) : (
          trigger
        )}
        {rest}
      </AriaDialogTrigger>
    </PopoverContext.Provider>
  );
}

export interface PopoverProps
  extends Pick<AriaPopoverProps, "placement" | "offset" | "crossOffset" | "shouldFlip" | "containerPadding" | "triggerRef" | "isOpen" | "onOpenChange"> {
  /** Draw a caret pointing at the trigger. */
  showArrow?: boolean;
  /** Accessible name when the content has no PopoverHeader title. */
  "aria-label"?: string;
  /** Classes on the surface, e.g. a width (default 320px). */
  className?: string;
  /** Classes on the inner dialog; `p-0` suits menu-like rows that pad themselves. */
  dialogClassName?: string;
  children: ReactNode | ((renderProps: DialogRenderProps) => ReactNode);
}

export function Popover({
  showArrow = false,
  placement = "bottom",
  offset,
  "aria-label": ariaLabel,
  className,
  dialogClassName,
  children,
  ...props
}: PopoverProps) {
  const context = useContext(PopoverContext);
  const direction = useDirection();

  return (
    <AriaPopover
      {...props}
      ref={context?.popoverRef}
      dir={direction}
      // Standalone (triggerRef + isOpen) popovers keep React Aria's own
      // dismissal; inside PopoverTrigger the trigger restores it.
      isNonModal={context != null}
      placement={placement}
      offset={offset ?? (showArrow ? 10 : 8)}
      className={cx(
        "z-110 w-80 max-w-[calc(100vw-32px)]",
        "rounded-[20px] border border-border-button-default bg-background-primary-default p-1.5 shadow-dropdown",
        "origin-(--trigger-anchor-point) transition-[opacity,scale,filter] duration-150 ease-out",
        "data-[entering]:opacity-0 data-[exiting]:opacity-0",
        "motion-safe:data-[entering]:scale-95 motion-safe:data-[entering]:blur-[2px]",
        "motion-safe:data-[exiting]:scale-95 motion-safe:data-[exiting]:blur-[2px]",
        className,
      )}
    >
      {showArrow ? (
        <AriaOverlayArrow>
          {({ placement: side }) => {
            const caret = TOOLTIP_CARETS[side as keyof typeof TOOLTIP_CARETS] ?? TOOLTIP_CARETS.top;
            return (
              <svg
                width={caret.width}
                height={caret.height}
                viewBox={`0 0 ${caret.width} ${caret.height}`}
                className="block overflow-visible fill-background-primary-default stroke-border-button-default"
                style={{ filter: `drop-shadow(${caret.shadow} rgb(0 0 0 / 0.05))` }}
              >
                <path d={caret.path} />
              </svg>
            );
          }}
        </AriaOverlayArrow>
      ) : null}
      <AriaDialog aria-label={ariaLabel} className={cx("flex flex-col gap-3 p-2.5 outline-none", dialogClassName)}>
        {children}
      </AriaDialog>
    </AriaPopover>
  );
}

export interface PopoverHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}

/** Title and supporting copy; the title names the popover's dialog. */
export function PopoverHeader({ title, description, className }: PopoverHeaderProps) {
  return (
    <div className={cx("flex flex-col gap-0.5", className)}>
      <AriaHeading slot="title" className="text-body-medium text-text-primary">
        {title}
      </AriaHeading>
      {description ? <p className="text-body-2-regular text-text-secondary">{description}</p> : null}
    </div>
  );
}

/** A trailing row of actions. */
export function PopoverFooter({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("flex items-center justify-end gap-2", className)}>{children}</div>;
}
