"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import type {
  ComponentType,
  KeyboardEvent,
  MouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  Header as AriaHeader,
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  MenuSection as AriaMenuSection,
  Popover as AriaPopover,
  Separator as AriaSeparator,
  SubmenuTrigger as AriaSubmenuTrigger,
} from "react-aria-components";
import type {
  Key,
  MenuItemProps as AriaMenuItemProps,
  MenuProps as AriaMenuProps,
  MenuSectionProps as AriaMenuSectionProps,
} from "react-aria-components";
import { RiArrowRightSLine, RiCheckLine } from "@remixicon/react";
import { MENU_ITEM, MENU_ITEM_ACTIVE } from "@/components/base/dropdown/menu-styles";
import { useDirection } from "@/components/foundations/direction/direction";
import { ScrollFade, useScrollFade } from "@/components/foundations/scroll-fade/scroll-fade";
import { useTemplateCopy } from "@/components/foundations/template-copy/template-copy";
import { cx } from "@/utils/cx";

/**
 * Context menu — the actions for whatever is under the pointer: a file, a
 * row, a message, a spot on a canvas. It opens on right-click, on a long
 * press with touch, and on Shift+F10 or the Menu key while the target has
 * focus.
 *
 *   <ContextMenuTrigger>
 *     <FileCard … />
 *     <ContextMenu aria-label="File actions" onAction={run}>
 *       <ContextMenuItem id="rename" icon={RiEditLine} shortcut="⌘R">Rename</ContextMenuItem>
 *       <ContextMenuSubmenu label="Move to" icon={RiFolderTransferLine}>…</ContextMenuSubmenu>
 *       <ContextMenuSeparator />
 *       <ContextMenuItem id="delete" icon={RiDeleteBinLine} variant="danger">Delete</ContextMenuItem>
 *     </ContextMenu>
 *   </ContextMenuTrigger>
 *
 * Promoted from Multi-agent Chat's chat menu, with its compact look: a
 * 14px-radius panel with 4px padding, 32px rows with 20px icons, and the
 * shared menu motion (150ms fade, scale 0.95, 2px blur) grown from the
 * pointer. The menu's corner sits at the pointer, towards the reading
 * direction, and flips or shifts to stay on screen.
 *
 * Built on React Aria's Menu in a non-modal popover, so arrows, typeahead,
 * submenus (Right and Left, mirrored in RTL), Escape and focus return come
 * from React Aria. Like the browser's own menu, it closes on a press outside
 * or when the page scrolls. With nested triggers the innermost one wins, and
 * `isDisabled` lets the browser's menu through.
 */

type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

/** How long a touch rests before the menu opens, and how far it may drift. */
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 10;

const PANEL = [
  "z-110 flex min-w-52 max-w-[calc(100vw-32px)] flex-col overflow-hidden outline-none",
  "rounded-[14px] border border-border-button-default bg-background-primary-default shadow-dropdown",
  "origin-(--trigger-anchor-point) transition-[opacity,scale,filter] duration-150 ease-out",
  "data-[entering]:opacity-0 data-[exiting]:opacity-0",
  "motion-safe:data-[entering]:scale-95 motion-safe:data-[entering]:blur-[2px]",
  "motion-safe:data-[exiting]:scale-95 motion-safe:data-[exiting]:blur-[2px]",
].join(" ");

interface TriggerState {
  id: string;
  isOpen: boolean;
  /** Bumped on every opening, so each menu mounts fresh at its own point. */
  openCount: number;
  anchorRef: RefObject<HTMLDivElement | null>;
  autoFocus: "first" | true;
  close: () => void;
}

const TriggerContext = createContext<TriggerState | null>(null);

/** The root menu's id, action handler and close, for the menus in its submenus. */
const RootMenuContext = createContext<{ id: string; onAction?: (key: Key) => void; close: () => void } | null>(null);

/** The popover (root or submenu) an element sits in, by its trigger's id. */
function menuOf(target: EventTarget | null) {
  return target instanceof Element ? target.closest("[data-context-menu]")?.getAttribute("data-context-menu") : undefined;
}

/* ---------------------------------------------------------------- trigger */

export interface ContextMenuTriggerProps {
  /** The target, then its ContextMenu. A function receives whether the menu is open, to highlight the target. */
  children: ReactNode | ((state: { isOpen: boolean }) => ReactNode);
  /** Leave the browser's own menu in place. */
  isDisabled?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  /** The wrapper is `display: contents`, so it adds no box; a class here can give it one. */
  className?: string;
}

export function ContextMenuTrigger({ children, isDisabled = false, onOpenChange, className }: ContextMenuTriggerProps) {
  const id = useId();
  const direction = useDirection();
  const anchorRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(false);
  const press = useRef<{ x: number; y: number; timer: number } | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const [autoFocus, setAutoFocus] = useState<"first" | true>(true);

  const setOpen = useCallback(
    (next: boolean) => {
      if (openRef.current === next) return;
      openRef.current = next;
      setIsOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );
  const close = useCallback(() => setOpen(false), [setOpen]);

  // A pointer opening focuses the menu itself, as the browser's menu does;
  // a keyboard opening lands on the first item.
  const openAt = (x: number, y: number, focus: "first" | true) => {
    setPoint({ x, y });
    setAutoFocus(focus);
    setOpenCount((count) => count + 1);
    setOpen(true);
  };

  /** Keyboard openings have no pointer: open just inside the focused element's start edge. */
  const openFrom = (element: Element) => {
    const rect = element.getBoundingClientRect();
    const inset = Math.min(24, rect.width / 2);
    openAt(direction === "rtl" ? rect.right - inset : rect.left + inset, rect.top + Math.min(rect.height, 40), "first");
  };

  const cancelPress = () => {
    if (!press.current) return;
    window.clearTimeout(press.current.timer);
    press.current = null;
  };

  useEffect(() => () => {
    if (press.current) window.clearTimeout(press.current.timer);
  }, []);

  // React Aria leaves non-modal popovers open on outside presses, and the
  // anchor is fixed, so close on a press or a scroll outside this menu tree.
  useEffect(() => {
    if (!isOpen) return;
    const onOutside = (event: Event) => {
      if (menuOf(event.target) !== id) close();
    };
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("scroll", onOutside, true);
    return () => {
      document.removeEventListener("pointerdown", onOutside, true);
      document.removeEventListener("scroll", onOutside, true);
    };
  }, [isOpen, id, close]);

  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    // Events from the open menu bubble here through its portal; never show
    // the browser's menu on top of it.
    if (menuOf(event.target) === id) {
      event.preventDefault();
      return;
    }
    if (isDisabled || event.defaultPrevented || !event.currentTarget.contains(event.target as Node)) return;
    event.preventDefault();
    if (openRef.current) return;
    // Some keyboard-made events carry no position.
    if (event.clientX === 0 && event.clientY === 0) openFrom(event.target as Element);
    else openAt(event.clientX, event.clientY, true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isDisabled || event.defaultPrevented || !event.currentTarget.contains(event.target as Node)) return;
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    event.preventDefault();
    openFrom(event.target as Element);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" || isDisabled || !event.currentTarget.contains(event.target as Node)) return;
    cancelPress();
    const { clientX: x, clientY: y } = event;
    press.current = {
      x,
      y,
      timer: window.setTimeout(() => {
        press.current = null;
        if (!openRef.current) openAt(x, y, true);
      }, LONG_PRESS_MS),
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (press.current && Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > LONG_PRESS_SLOP) {
      cancelPress();
    }
  };

  const content = typeof children === "function" ? children({ isOpen }) : children;

  return (
    <TriggerContext.Provider value={{ id, isOpen, openCount, anchorRef, autoFocus, close }}>
      <div
        className={cx("contents [-webkit-touch-callout:none]", className)}
        data-open={isOpen || undefined}
        onContextMenu={onContextMenu}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={cancelPress}
        onPointerCancel={cancelPress}
      >
        {content}
      </div>
      {point
        ? createPortal(
            <div
              ref={anchorRef}
              aria-hidden
              className="pointer-events-none fixed size-px"
              style={{ left: point.x, top: point.y }}
            />,
            document.body,
          )
        : null}
    </TriggerContext.Provider>
  );
}

/* ------------------------------------------------------------------- menu */

/** A menu's scrolling list, with the shared progressive top blur. */
function MenuList<T extends object>({ children, ...props }: Omit<AriaMenuProps<T>, "className">) {
  const fade = useScrollFade();
  return (
    <div className="relative flex min-h-0 flex-col">
      <AriaMenu
        {...props}
        onScroll={fade.onScroll}
        className="flex min-h-0 flex-col gap-1 overflow-y-auto overscroll-contain p-1 outline-none [scrollbar-width:thin]"
      >
        {children}
      </AriaMenu>
      <ScrollFade progress={fade.progress} />
    </div>
  );
}

export interface ContextMenuProps<T extends object> extends Omit<AriaMenuProps<T>, "className" | "autoFocus" | "onClose"> {
  /** Names the menu for screen readers. Default "Actions". */
  "aria-label"?: string;
  /** Classes on the panel, e.g. a width. */
  className?: string;
}

export function ContextMenu<T extends object>({
  "aria-label": ariaLabel = "Actions",
  onAction,
  className,
  ...props
}: ContextMenuProps<T>) {
  const trigger = useContext(TriggerContext);
  const direction = useDirection();
  const localize = useTemplateCopy();
  if (!trigger) throw new Error("ContextMenu must be inside a ContextMenuTrigger.");
  const { id, isOpen, openCount, anchorRef, autoFocus, close } = trigger;

  return (
    <RootMenuContext.Provider value={{ id, onAction, close }}>
      <AriaPopover
        key={openCount}
        triggerRef={anchorRef}
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        isNonModal
        placement="bottom start"
        offset={2}
        dir={direction}
        data-context-menu={id}
        className={cx(PANEL, className)}
      >
        <MenuList {...props} aria-label={localize(ariaLabel)} autoFocus={autoFocus} onAction={onAction} onClose={close} />
      </AriaPopover>
    </RootMenuContext.Provider>
  );
}

/* ---------------------------------------------------------------- content */

export interface ContextMenuItemProps extends Omit<AriaMenuItemProps, "children" | "className"> {
  /** Remix Icon before the label. */
  icon?: IconComponent;
  /** Keyboard shortcut at the end of the row, e.g. "⌘C". */
  shortcut?: string;
  /** `danger` for destructive actions such as Delete. */
  variant?: "default" | "danger";
  className?: string;
  children: ReactNode;
}

/**
 * A row: icon, label, then a check when selected, the shortcut, or a chevron
 * when it opens a submenu. The row stays highlighted while its submenu is open.
 */
export function ContextMenuItem({ icon: Icon, shortcut, variant = "default", className, children, ...props }: ContextMenuItemProps) {
  return (
    <AriaMenuItem
      {...props}
      textValue={props.textValue ?? (typeof children === "string" ? children : undefined)}
      className={({ isFocused, isOpen, isDisabled }) =>
        cx(
          MENU_ITEM,
          "px-2 py-1.5 text-body-medium",
          variant === "danger" && "text-text-destructive",
          (isFocused || isOpen) && MENU_ITEM_ACTIVE,
          isDisabled && "cursor-not-allowed text-text-disabled",
          className,
        )
      }
    >
      {({ isSelected, hasSubmenu, isDisabled }) => (
        <>
          {Icon ? (
            <Icon
              aria-hidden
              className={cx("size-5 shrink-0", variant === "danger" || isDisabled ? "text-current" : "text-foreground-icon-secondary")}
            />
          ) : null}
          <span className="min-w-0 flex-1 truncate">{children}</span>
          {isSelected ? <RiCheckLine aria-hidden className="size-4 shrink-0 text-accent-500" /> : null}
          {shortcut ? <kbd className="shrink-0 ps-3 font-sans text-body-regular text-text-tertiary">{shortcut}</kbd> : null}
          {hasSubmenu ? (
            <RiArrowRightSLine aria-hidden className="-me-1 size-5 shrink-0 text-foreground-icon-secondary rtl:-scale-x-100" />
          ) : null}
        </>
      )}
    </AriaMenuItem>
  );
}

export interface ContextMenuSubmenuProps {
  /** The row that opens the submenu. */
  label: ReactNode;
  icon?: IconComponent;
  /** Typeahead text when the label is not a string. */
  textValue?: string;
  isDisabled?: boolean;
  /** Classes on the submenu panel. */
  className?: string;
  /** The submenu's items. Their ids reach the root ContextMenu's `onAction`. */
  children: ReactNode;
}

export function ContextMenuSubmenu({ label, icon, textValue, isDisabled, className, children }: ContextMenuSubmenuProps) {
  const root = useContext(RootMenuContext);
  const direction = useDirection();
  return (
    <AriaSubmenuTrigger>
      <ContextMenuItem icon={icon} textValue={textValue} isDisabled={isDisabled}>
        {label}
      </ContextMenuItem>
      {/* 9px clears the parent's padding and border for a 4px gap; -5px lines
          the first row up with the row that opened it. */}
      <AriaPopover dir={direction} offset={9} crossOffset={-5} data-context-menu={root?.id} className={cx(PANEL, className)}>
        <MenuList onAction={root?.onAction} onClose={root?.close}>
          {children}
        </MenuList>
      </AriaPopover>
    </AriaSubmenuTrigger>
  );
}

export interface ContextMenuSectionProps extends Omit<AriaMenuSectionProps<object>, "children" | "className"> {
  /** Muted heading above the section's rows. */
  title?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** A group of rows, optionally titled. Give it `selectionMode` for a set of checkable rows. */
export function ContextMenuSection({ title, className, children, ...props }: ContextMenuSectionProps) {
  return (
    <AriaMenuSection {...props} className={cx("flex flex-col gap-1", className)}>
      {title ? <AriaHeader className="px-2 pt-1 pb-0.5 text-body-2-medium text-text-tertiary">{title}</AriaHeader> : null}
      {children}
    </AriaMenuSection>
  );
}

/** A full-width rule between groups of rows. */
export function ContextMenuSeparator({ className }: { className?: string }) {
  return <AriaSeparator className={cx("-mx-1 my-0.5 h-px shrink-0 bg-border-button-default", className)} />;
}
