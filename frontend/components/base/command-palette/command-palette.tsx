"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import {
  Autocomplete as AriaAutocomplete,
  Button as AriaButton,
  Dialog as AriaDialog,
  Header as AriaHeader,
  Input as AriaInput,
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  MenuSection as AriaMenuSection,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
  SearchField as AriaSearchField,
  useFilter,
} from "react-aria-components";
import type { Key, MenuItemProps as AriaMenuItemProps } from "react-aria-components";
import { RiArrowDownLine, RiArrowUpLine, RiCloseCircleFill, RiCornerDownLeftLine, RiSearchLine } from "@remixicon/react";
import { Kbd } from "@/components/base/kbd/kbd";
import { useDirection } from "@/components/foundations/direction/direction";
import { ScrollFade, useScrollFade } from "@/components/foundations/scroll-fade/scroll-fade";
import { useTemplateCopy } from "@/components/foundations/template-copy/template-copy";
import { cx } from "@/utils/cx";

/**
 * Command palette — a searchable list of actions and destinations, opened
 * with ⌘K / Ctrl+K: jump to a page, run a command, find a record.
 *
 *   <CommandPalette isOpen={open} onOpenChange={setOpen}>
 *     <CommandPaletteSection title="Navigation">
 *       <CommandPaletteItem id="home" icon={RiHome5Line} onAction={…}>Dashboard</CommandPaletteItem>
 *     </CommandPaletteSection>
 *   </CommandPalette>
 *
 * Promoted from the docs site's component search: a black/20 scrim and a
 * compact radius/2xl panel 12vh from the top that fades in, lifts 10px and
 * sharpens from a 4px blur over 200ms; a 40px search row over 32px rows
 * (the 10px rows sit concentric 6px inside the 16px panel) in a scrolling
 * list with the shared progressive top blur; and a footer of key hints.
 * Every Kbd inside the panel, a custom footer's too, takes the lighter
 * `kbd-subtle-background` chip, since it sits on white and the hover grey
 * rather than on a grey search pill.
 *
 * Micro-motion while searching, in CSS so it adds no dependency: one
 * highlight glides between rows as the keys or the pointer move it, the list
 * eases to its new height as results come and go, rows that appear fade and
 * rise 4px in (`@starting-style`), and a clear button pops in once there is
 * a query. Reduced motion keeps every change and drops the movement.
 *
 * Built on React Aria's Autocomplete and Menu in a modal dialog, so the
 * input keeps focus while arrows move a virtual highlight through the list,
 * Enter runs the highlighted command, Escape clears the query and then
 * closes, and focus returns to wherever it was. Items filter by their text
 * with a locale-aware contains match; pass `filter={null}` and filter the
 * children yourself for custom ranking. The palette's own copy (label,
 * placeholder, empty state, hints) goes through `useTemplateCopy`, so a
 * TemplateCopyProvider translates it.
 */

type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

/** The highlighted row hands its element to the palette's gliding highlight, and takes it back. */
const HighlightContext = createContext<{ show: (row: HTMLElement) => void; release: (row: HTMLElement) => void } | null>(null);

function HighlightAnchor() {
  const highlight = useContext(HighlightContext);
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const row = ref.current?.closest<HTMLElement>('[role="menuitem"]');
    if (!highlight || !row) return;
    highlight.show(row);
    return () => highlight.release(row);
  }, [highlight]);
  return <span ref={ref} hidden />;
}

export interface CommandPaletteProps {
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  /** Letter that opens and closes it with ⌘ / Ctrl. `false` turns the shortcut off. Default "k". */
  shortcut?: string | false;
  /** Accessible name of the dialog. Default "Command palette". */
  "aria-label"?: string;
  placeholder?: string;
  /** Controlled query. */
  inputValue?: string;
  onInputChange?: (value: string) => void;
  /** Match items against the query; `null` shows the children as given. Default: contains, ignoring case and accents. */
  filter?: ((textValue: string, inputValue: string) => boolean) | null;
  /** Called with the id of the item run from the keyboard or the pointer, after the palette closes. */
  onAction?: (key: Key) => void;
  /** Shown when nothing matches. */
  emptyState?: ReactNode;
  /** The hint row under the list; `false` hides it. */
  footer?: ReactNode | false;
  className?: string;
  children: ReactNode;
}

export function CommandPalette({
  isOpen: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  shortcut = "k",
  "aria-label": ariaLabel = "Command palette",
  placeholder = "Type a command or search…",
  inputValue: controlledInput,
  onInputChange,
  filter,
  onAction,
  emptyState = "No results",
  footer,
  className,
  children,
}: CommandPaletteProps) {
  const direction = useDirection();
  const localize = useTemplateCopy();
  const label = localize(ariaLabel);
  const { contains } = useFilter({ sensitivity: "base" });
  const fade = useScrollFade();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const [uncontrolledInput, setUncontrolledInput] = useState("");
  const isOpen = controlledOpen ?? uncontrolledOpen;
  const inputValue = controlledInput ?? uncontrolledInput;

  // The list frame eases between heights; the highlight is one element that
  // glides between rows. Both are written straight to the DOM, so a keystroke
  // or a scroll never re-renders the rows to move them.
  const frameRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLElement | null>(null);
  const shownRef = useRef(false);

  const place = useCallback(() => {
    const glow = glowRef.current;
    const row = rowRef.current;
    if (!glow) return;
    if (!row || !row.isConnected) {
      glow.style.opacity = "0";
      shownRef.current = false;
      return;
    }
    const geometry = `translate(${row.offsetLeft}px, ${row.offsetTop}px)`;
    if (!shownRef.current) {
      // Appearing: land on the row, then fade in, rather than sliding in from the last spot.
      glow.style.transition = "none";
      glow.style.transform = geometry;
      glow.style.width = `${row.offsetWidth}px`;
      glow.style.height = `${row.offsetHeight}px`;
      void glow.offsetHeight;
      glow.style.transition = "";
    }
    glow.style.transform = geometry;
    glow.style.width = `${row.offsetWidth}px`;
    glow.style.height = `${row.offsetHeight}px`;
    glow.style.opacity = "1";
    shownRef.current = true;
  }, []);

  const resize = useCallback((animate: boolean) => {
    const frame = frameRef.current;
    if (!frame) return;
    // Measure the list at its natural height (capped by the frame's max-height),
    // then ease from the old height to it.
    const from = frame.style.height;
    frame.style.height = "auto";
    const to = `${frame.offsetHeight}px`;
    if (!animate || !from || from === to) {
      frame.style.height = to;
      return;
    }
    frame.style.height = from;
    void frame.offsetHeight;
    frame.style.height = to;
  }, []);

  const highlight = useRef({
    show: (row: HTMLElement) => {
      rowRef.current = row;
      place();
    },
    release: (row: HTMLElement) => {
      if (rowRef.current !== row) return;
      rowRef.current = null;
      place();
    },
  }).current;

  // Filtering can update the rows a commit after the query does, so follow the DOM.
  useLayoutEffect(() => {
    if (!isOpen) return;
    const list = listRef.current;
    if (!list) return;
    shownRef.current = false;
    resize(false);
    place();
    // React Aria fills the list a frame or two after the panel mounts. Until
    // the panel's 200ms entrance is over the list takes its height at once,
    // so the first open never grows from the empty state.
    let settled = false;
    const settle = window.setTimeout(() => {
      settled = true;
    }, 240);
    let frame = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        resize(settled);
        place();
      });
    });
    observer.observe(list, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
    };
  }, [isOpen, place, resize]);

  const setOpen = (next: boolean) => {
    setUncontrolledOpen(next);
    onOpenChange?.(next);
    if (next) {
      // Every opening starts fresh: an empty query and the list at its top.
      setUncontrolledInput("");
      onInputChange?.("");
      fade.reset();
    }
  };

  useEffect(() => {
    if (shortcut === false) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== shortcut.toLowerCase()) return;
      event.preventDefault();
      setOpen(!isOpen);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <AriaModalOverlay
      isOpen={isOpen}
      onOpenChange={setOpen}
      isDismissable
      dir={direction}
      className="group/palette fixed inset-x-0 top-0 z-100 flex h-(--visual-viewport-height) items-start justify-center px-4 pt-[12vh]"
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-black/20 transition-opacity duration-150 ease-out group-data-[entering]/palette:opacity-0 group-data-[exiting]/palette:opacity-0"
      />
      <AriaModal
        className={cx(
          "relative flex max-h-[min(520px,76vh)] w-full max-w-[520px] flex-col outline-none",
          "transition-[opacity,translate,scale,filter] duration-200 ease-out",
          "data-[entering]:opacity-0 data-[exiting]:opacity-0",
          "motion-safe:data-[entering]:translate-y-2.5 motion-safe:data-[entering]:scale-[0.98] motion-safe:data-[entering]:blur-[4px]",
          "motion-safe:data-[exiting]:translate-y-2 motion-safe:data-[exiting]:scale-[0.98] motion-safe:data-[exiting]:blur-[3px]",
        )}
      >
        <AriaDialog
          aria-label={label}
          className={cx(
            "flex min-h-0 flex-1 flex-col overflow-clip rounded-2xl border border-border-button-default bg-background-primary-default shadow-sidebar outline-none",
            "[--color-kbd-background:var(--color-kbd-subtle-background)]",
            className,
          )}
        >
          <AriaAutocomplete
            inputValue={inputValue}
            onInputChange={(value) => {
              setUncontrolledInput(value);
              onInputChange?.(value);
            }}
            filter={filter === null ? undefined : filter ?? contains}
          >
            <AriaSearchField
              aria-label={label}
              autoFocus
              className="group/search flex h-10 shrink-0 items-center gap-2.5 border-b border-separator-border ps-3.5 pe-2.5"
            >
              <RiSearchLine
                className="size-4 shrink-0 text-foreground-icon-secondary transition-colors duration-150 group-data-[empty]/search:text-foreground-icon-tertiary"
                aria-hidden
              />
              <AriaInput
                placeholder={localize(placeholder)}
                className="min-w-0 flex-1 bg-transparent text-body-medium text-text-primary outline-none placeholder:text-text-tertiary [&::-webkit-search-cancel-button]:hidden"
              />
              <AriaButton
                aria-label={localize("Clear search")}
                className={cx(
                  "flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-foreground-icon-tertiary outline-none",
                  "transition-[opacity,scale,color] duration-150 ease-out hover:text-foreground-icon-secondary",
                  "focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                  "group-data-[empty]/search:pointer-events-none group-data-[empty]/search:opacity-0 motion-safe:group-data-[empty]/search:scale-50",
                )}
              >
                <RiCloseCircleFill className="size-4" aria-hidden />
              </AriaButton>
            </AriaSearchField>
            <div
              ref={frameRef}
              className="relative flex min-h-0 flex-col transition-[height] duration-200 ease-out motion-reduce:transition-none"
            >
              {/* The highlight rides a track that follows the list's scroll,
                  behind the transparent list. */}
              <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
                <div ref={trackRef} className="absolute inset-x-0 top-0">
                  <div
                    ref={glowRef}
                    className="absolute top-0 left-0 rounded-2lg bg-dropdown-item-hover-background opacity-0 transition-[transform,height,width,opacity] duration-150 ease-out motion-reduce:transition-none"
                  />
                </div>
              </div>
              <HighlightContext.Provider value={highlight}>
                <AriaMenu
                  ref={listRef}
                  aria-label={label}
                  onScroll={(event) => {
                    fade.onScroll(event);
                    if (trackRef.current) trackRef.current.style.transform = `translateY(${-event.currentTarget.scrollTop}px)`;
                  }}
                  onAction={(key) => {
                    setOpen(false);
                    onAction?.(key);
                  }}
                  renderEmptyState={() => (
                    <div className="flex min-h-28 flex-col items-center justify-center gap-1 px-4 text-center text-body-medium text-text-tertiary transition-[opacity,translate] duration-200 ease-out starting:translate-y-1 starting:opacity-0">
                      {localize(emptyState)}
                    </div>
                  )}
                  className="relative flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain p-1.5 outline-none [scrollbar-width:thin]"
                >
                  {children}
                </AriaMenu>
              </HighlightContext.Provider>
              <ScrollFade progress={fade.progress} />
            </div>
          </AriaAutocomplete>
          {footer === false ? null : (
            <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-t border-separator-border px-3.5 text-body-2-regular text-text-tertiary">
              {localize(
                footer ?? (
                  <>
                    <span className="flex items-center gap-1.5">
                      <Kbd aria-label="Arrow up">
                        <RiArrowUpLine className="size-3" aria-hidden />
                      </Kbd>
                      <Kbd aria-label="Arrow down">
                        <RiArrowDownLine className="size-3" aria-hidden />
                      </Kbd>
                      Navigate
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Kbd aria-label="Enter">
                        <RiCornerDownLeftLine className="size-3" aria-hidden />
                      </Kbd>
                      Select
                    </span>
                  </>
                ),
              )}
            </div>
          )}
        </AriaDialog>
      </AriaModal>
    </AriaModalOverlay>
  );
}

export interface CommandPaletteItemProps extends Omit<AriaMenuItemProps, "children" | "className"> {
  /** Remix Icon before the label. */
  icon?: IconComponent;
  /** Muted text at the end of the row, e.g. the section or a path. */
  description?: ReactNode;
  /** Keyboard shortcut shown at the end of the row, e.g. "⌘N". */
  shortcut?: string;
  className?: string;
  children: ReactNode;
}

export function CommandPaletteItem({ icon: Icon, description, shortcut, className, children, ...props }: CommandPaletteItemProps) {
  return (
    <AriaMenuItem
      {...props}
      textValue={props.textValue ?? (typeof children === "string" ? children : undefined)}
      className={cx(
        // The highlight is the palette's gliding layer behind the list, so rows stay transparent.
        "flex w-full shrink-0 cursor-pointer items-center gap-2.5 rounded-2lg px-2 py-1.5 text-start outline-none",
        "transition-[opacity,translate] duration-200 ease-out starting:opacity-0 motion-safe:starting:translate-y-1",
        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        className,
      )}
    >
      {({ isFocused }) => (
        <>
          {isFocused ? <HighlightAnchor /> : null}
          <span className="flex min-w-0 flex-1 items-center gap-2.5">
            {Icon ? <Icon className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden /> : null}
            <span className="flex min-w-0 items-center gap-2 truncate text-body-medium text-text-primary">{children}</span>
          </span>
          {description ? <span className="shrink-0 text-body-2-regular text-text-tertiary">{description}</span> : null}
          {shortcut ? <Kbd>{shortcut}</Kbd> : null}
        </>
      )}
    </AriaMenuItem>
  );
}

export interface CommandPaletteSectionProps {
  /** Muted heading above the section's items. */
  title?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function CommandPaletteSection({ title, className, children }: CommandPaletteSectionProps) {
  return (
    <AriaMenuSection className={cx("flex flex-col gap-0.5 [&:not(:first-child)]:pt-1.5", className)}>
      {title ? (
        <AriaHeader className="px-2 pt-1 pb-0.5 text-body-2-medium text-text-tertiary transition-opacity duration-200 ease-out starting:opacity-0">
          {title}
        </AriaHeader>
      ) : null}
      {children}
    </AriaMenuSection>
  );
}
