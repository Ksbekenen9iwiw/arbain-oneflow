import { Children, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import { RiCheckLine, RiMoreLine } from "@remixicon/react";
import { Tabs, TabList as BaseTabList, Tab as BaseTab } from "@/components/base/tabs/tabs";
import {
  SegmentedControl as BaseSegmented,
  SegmentedControlItem as BaseSegmentedItem,
} from "@/components/base/segmented-control/segmented-control";
import { Pagination as BasePagination } from "@/components/base/pagination/pagination";
import { Accordion, AccordionItem } from "@/components/base/accordion/accordion";
import {
  Dropdown,
  DropdownItem,
  DropdownPopover,
  DropdownTrigger,
} from "@/components/base/dropdown/dropdown";
import { Modal, ModalDialog, ModalHeader } from "@/components/base/modal/modal";
import { cx } from "@/utils/cx";

interface TabItemProps {
  value: string;
  label: ReactNode;
  panelId?: string;
  isDisabled?: boolean;
  "data-tour"?: string;
}

/** Declarative tab; rendered by the parent `TabList`. */
export function Tab(_props: TabItemProps) {
  return null;
}

/** BoardUI underline tabs driven by a string value. */
export function TabList({
  value,
  onChange,
  children,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  "aria-label"?: string;
  hasDivider?: boolean;
  role?: string;
}) {
  const tabs = Children.toArray(children).filter(isValidElement) as ReactElement<TabItemProps>[];
  return (
    <Tabs
      selectedKey={value}
      onSelectionChange={(key) => onChange(String(key))}
      className="min-w-0"
    >
      <div className="overflow-x-auto [scrollbar-width:none]">
        <BaseTabList aria-label={ariaLabel} className="min-w-max">
          {tabs.map((tab) => (
            <BaseTab
              key={tab.props.value}
              id={tab.props.value}
              isDisabled={tab.props.isDisabled}
              aria-controls={tab.props.panelId}
              data-tour={tab.props["data-tour"]}
            >
              {tab.props.label}
            </BaseTab>
          ))}
        </BaseTabList>
      </div>
    </Tabs>
  );
}

export function SegmentedControlItem(_props: { value: string; label: ReactNode }) {
  return null;
}

export function SegmentedControl({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  size?: "sm" | "md";
  children: ReactNode;
}) {
  const items = Children.toArray(children).filter(isValidElement) as ReactElement<{
    value: string;
    label: ReactNode;
  }>[];
  return (
    <BaseSegmented
      aria-label={label}
      selectedKeys={[value]}
      onSelectionChange={(keys) => {
        const next = [...keys][0];
        if (next != null) onChange(String(next));
      }}
    >
      {items.map((item) => (
        <BaseSegmentedItem key={item.props.value} id={item.props.value}>
          {item.props.label}
        </BaseSegmentedItem>
      ))}
    </BaseSegmented>
  );
}

export function Pagination({
  label,
  page,
  pageSize,
  totalItems,
  onChange,
  isDisabled,
}: {
  label: string;
  page: number;
  pageSize: number;
  totalItems: number;
  onChange: (page: number) => void;
  isDisabled?: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div
      className={cx("flex justify-center", isDisabled && "pointer-events-none opacity-60")}
      aria-busy={isDisabled || undefined}
    >
      <BasePagination
        aria-label={label}
        page={page}
        totalPages={totalPages}
        onChange={onChange}
        previousLabel="Sebelumnya"
        nextLabel="Berikutnya"
      />
    </div>
  );
}

/** Single disclosure, rendered as a BoardUI accordion row. */
export function Collapsible({
  trigger,
  defaultIsOpen,
  isOpen,
  onOpenChange,
  children,
}: {
  trigger: ReactNode;
  defaultIsOpen?: boolean;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Accordion variant="divided">
      <AccordionItem
        title={trigger}
        defaultExpanded={defaultIsOpen}
        isExpanded={isOpen}
        onExpandedChange={onOpenChange}
      >
        {children}
      </AccordionItem>
    </Accordion>
  );
}

export interface MenuItem {
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: "default" | "destructive";
  isDisabled?: boolean;
}

const TRIGGER =
  "inline-flex items-center justify-center gap-1.5 rounded-2lg border border-border-button-default bg-background-primary-default text-body-medium text-text-primary shadow-xs transition-colors duration-150 hover:bg-background-primary-hover hover:border-border-button-hover";

/** Action menu on a BoardUI Dropdown. Icon-only when `iconLabel` is given. */
export function DropdownMenu({
  button,
  iconLabel,
  items,
  alignment = "start",
}: {
  button?: { label: string; variant?: string };
  iconLabel?: string;
  items: MenuItem[];
  alignment?: "start" | "end";
  presentation?: string;
}) {
  const [isOpen, setOpen] = useState(false);
  const label = iconLabel ?? button?.label ?? "Tindakan";
  return (
    <Dropdown isOpen={isOpen} onOpenChange={setOpen}>
      <DropdownTrigger
        aria-label={iconLabel}
        className={cx(TRIGGER, iconLabel ? "size-8" : "px-2.5 py-2")}
      >
        {iconLabel ? <RiMoreLine aria-hidden className="size-4" /> : button?.label}
      </DropdownTrigger>
      <DropdownPopover
        aria-label={label}
        placement={alignment === "end" ? "bottom end" : "bottom start"}
      >
        {items.map((item) =>
          item.href ? (
            <a
              key={item.label}
              href={item.href}
              onClick={() => setOpen(false)}
              className="flex w-full cursor-pointer items-center rounded-lg px-2 py-1.5 text-body-medium text-text-primary outline-none hover:bg-background-secondary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            >
              {item.label}
            </a>
          ) : (
            <DropdownItem
              key={item.label}
              onSelect={() => {
                if (item.isDisabled) return;
                setOpen(false);
                item.onClick?.();
              }}
              className={cx(
                item.variant === "destructive" && "text-text-error-primary",
                item.isDisabled && "cursor-not-allowed opacity-50",
              )}
            >
              {item.label}
            </DropdownItem>
          ),
        )}
      </DropdownPopover>
    </Dropdown>
  );
}
