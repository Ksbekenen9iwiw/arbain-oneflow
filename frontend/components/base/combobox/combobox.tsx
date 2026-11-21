"use client";

import { useEffect, useRef, useState } from "react";
import type { ComponentType, ReactNode, Ref } from "react";
import {
  Button as AriaButton,
  ComboBox as AriaComboBox,
  Header as AriaHeader,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  ListBoxSection as AriaListBoxSection,
  Popover as AriaPopover,
} from "react-aria-components";
import type {
  ComboBoxProps as AriaComboBoxProps,
  ListBoxItemProps as AriaListBoxItemProps,
  ListBoxSectionProps as AriaListBoxSectionProps,
} from "react-aria-components";
import { RiCheckLine } from "@remixicon/react";
import { MENU_ITEM, MENU_ITEM_ACTIVE, MENU_ITEMS_CONTAINER, MENU_POPOVER_SURFACE } from "@/components/base/dropdown/menu-styles";
import { HintText } from "@/components/base/input/hint-text";
import { InputBase, type InputSize } from "@/components/base/input/input";
import { Label } from "@/components/base/input/label";
import { useDirection } from "@/components/foundations/direction/direction";
import { ChevronDownSmall } from "@/components/foundations/icons/chevrons";
import { ScrollFade, useScrollFade } from "@/components/foundations/scroll-fade/scroll-fade";
import { cx } from "@/utils/cx";

/**
 * ComboBox — a text field that filters a list as you type: pick an assignee,
 * a country, a timezone. Built on React Aria's ComboBox, so the list is a
 * real listbox with arrow-key navigation, typeahead filtering, and
 * screen-reader announcements.
 *
 *   <ComboBox label="Assignee" placeholder="Search people" defaultItems={people}>
 *     {(person) => <ComboBoxItem textValue={person.name}>…</ComboBoxItem>}
 *   </ComboBox>
 *
 * The field is Input's own InputBase (same surface, hover and focus rings,
 * invalid and disabled states), with the toggle in its trailing slot. The
 * list is Select's: the shared menu surface and motion, radius/2lg rows,
 * the hover surface on the focused row, and a check on the selected one. It
 * opens under the whole field at the field's width, rather than under the
 * bare input React Aria would anchor to, and its rows scroll under the
 * shared progressive top blur.
 */

type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

export interface ComboBoxProps<T extends object> extends Omit<AriaComboBoxProps<T>, "children" | "className"> {
  label?: ReactNode;
  /** Help text under the field; shown in the error colour while invalid. */
  hint?: ReactNode;
  placeholder?: string;
  leadingIcon?: IconComponent;
  /** `medium` (default, 36px) or `small` (32px), as Input. */
  size?: InputSize;
  /** Shown in the list when nothing matches. */
  emptyMessage?: ReactNode;
  className?: string;
  /** Classes on the list's popover. */
  popoverClassName?: string;
  children: ReactNode | ((item: T) => ReactNode);
  ref?: Ref<HTMLDivElement>;
}

export function ComboBox<T extends object>({
  label,
  hint,
  placeholder,
  leadingIcon,
  size,
  emptyMessage = "No results",
  className,
  popoverClassName,
  children,
  ref,
  ...props
}: ComboBoxProps<T>) {
  const direction = useDirection();
  const fieldRef = useRef<HTMLDivElement>(null);
  const fade = useScrollFade();
  const [fieldWidth, setFieldWidth] = useState<number>();

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const observer = new ResizeObserver(() => setFieldWidth(field.offsetWidth));
    observer.observe(field);
    return () => observer.disconnect();
  }, []);

  return (
    <AriaComboBox
      ref={ref}
      allowsEmptyCollection
      {...props}
      className={cx("group flex flex-col gap-1", className)}
      onOpenChange={(isOpen, trigger) => {
        // Each opening starts the list at the top, so the fade starts hidden.
        if (isOpen) fade.reset();
        props.onOpenChange?.(isOpen, trigger);
      }}
    >
      {({ isOpen, isRequired, isInvalid }) => (
        <>
          {label ? <Label isRequired={isRequired}>{label}</Label> : null}
          <InputBase
            groupRef={fieldRef}
            size={size}
            placeholder={placeholder}
            leadingIcon={leadingIcon}
            trailingAddon={
              <AriaButton
                className={({ isFocusVisible }) =>
                  cx(
                    "-m-1 flex shrink-0 cursor-pointer items-center justify-center rounded-md p-1 text-text-secondary outline-none",
                    isFocusVisible && "ring-2 ring-border-focus-ring",
                  )
                }
              >
                <ChevronDownSmall
                  className={cx("size-4 transition-transform duration-200 ease", isOpen && "rotate-180")}
                />
              </AriaButton>
            }
          />
          {hint ? <HintText isInvalid={isInvalid}>{hint}</HintText> : null}
          <AriaPopover
            triggerRef={fieldRef}
            dir={direction}
            offset={4}
            style={{ width: fieldWidth }}
            className={cx(MENU_POPOVER_SURFACE, "flex flex-col overflow-hidden p-2", popoverClassName)}
          >
            <div className="relative flex min-h-0 flex-col">
              <AriaListBox
                onScroll={fade.onScroll}
                renderEmptyState={() => (
                  <div className="px-2 py-2 text-body-medium text-text-tertiary">{emptyMessage}</div>
                )}
                className={cx(MENU_ITEMS_CONTAINER, "max-h-[240px] min-h-0 overflow-y-auto overscroll-contain")}
              >
                {children}
              </AriaListBox>
              <ScrollFade progress={fade.progress} />
            </div>
          </AriaPopover>
        </>
      )}
    </AriaComboBox>
  );
}

export interface ComboBoxItemProps extends Omit<AriaListBoxItemProps, "children"> {
  children?: ReactNode;
}

/** A row in the list. Content is free-form: an avatar and a name, a flag and a country. */
export function ComboBoxItem({ className, children, ...props }: ComboBoxItemProps) {
  return (
    <AriaListBoxItem
      {...props}
      className={(state) =>
        cx(
          MENU_ITEM,
          "text-body-medium",
          state.isFocused && MENU_ITEM_ACTIVE,
          state.isDisabled && "cursor-not-allowed text-text-disabled",
          typeof className === "function" ? className(state) : className,
        )
      }
    >
      {({ isSelected }) => (
        <>
          <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
          {isSelected ? <RiCheckLine className="size-4 shrink-0 text-accent-500" aria-hidden /> : null}
        </>
      )}
    </AriaListBoxItem>
  );
}

export interface ComboBoxSectionProps<T extends object> extends Omit<AriaListBoxSectionProps<T>, "className" | "children"> {
  /** Muted heading above the section's rows. */
  title?: ReactNode;
  className?: string;
  /** ComboBoxItems, or a React Aria Collection for a dynamic section. */
  children: ReactNode;
}

export function ComboBoxSection<T extends object>({ title, className, children, ...props }: ComboBoxSectionProps<T>) {
  return (
    <AriaListBoxSection {...props} className={cx("flex flex-col gap-1 [&:not(:first-child)]:pt-2", className)}>
      {title ? <AriaHeader className="ps-2 pt-1 pb-0.5 text-body-medium text-text-secondary">{title}</AriaHeader> : null}
      {children}
    </AriaListBoxSection>
  );
}
