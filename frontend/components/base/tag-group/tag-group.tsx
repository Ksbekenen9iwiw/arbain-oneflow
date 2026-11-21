"use client";

import { createContext, useContext } from "react";
import type { ComponentType, ReactNode } from "react";
import {
  Button as AriaButton,
  Tag as AriaTag,
  TagGroup as AriaTagGroup,
  TagList as AriaTagList,
} from "react-aria-components";
import type { TagGroupProps as AriaTagGroupProps, TagProps as AriaTagProps } from "react-aria-components";
import { RiCloseLine } from "@remixicon/react";
import { CHIP_COLORS } from "@/components/base/badges/chip";
import type { ChipColor } from "@/components/base/badges/chip";
import { HintText } from "@/components/base/input/hint-text";
import { Label } from "@/components/base/input/label";
import { cx } from "@/utils/cx";

/**
 * Tag group — a set of tags to filter by, pick from, or prune: topics,
 * skills, recipients, labels on a ticket.
 *
 *   <TagGroup label="Topics" selectionMode="multiple" defaultSelectedKeys={["design"]}>
 *     <Tag id="design">Design</Tag>
 *     <Tag id="engineering">Engineering</Tag>
 *   </TagGroup>
 *
 *   <TagGroup label="Skills" items={skills} onRemove={(keys) => drop(keys)}>
 *     {(skill) => <Tag>{skill.name}</Tag>}
 *   </TagGroup>
 *
 * Tags take Chip's colour pairs (neutral by default) at 28px, or 24px with
 * `size="small"`. With a `selectionMode`, tags toggle and a selected tag fills
 * with the accent colour. With `onRemove`, each tag gets a small remove
 * button and Backspace or Delete removes the focused tag.
 *
 * Built on React Aria's TagGroup, a grid: Tab enters it once, arrows move
 * between tags, Space and Enter toggle selection, and screen readers hear
 * the tag count, each label and whether it is selected.
 */

type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

export type TagSize = "medium" | "small";

const SizeContext = createContext<TagSize>("medium");

export interface TagGroupProps<T extends object> extends Omit<AriaTagGroupProps, "className" | "children"> {
  label?: ReactNode;
  hint?: ReactNode;
  /** Shown in place of the tags when there are none. */
  emptyState?: ReactNode;
  /** 28px tags (default) or 24px. */
  size?: TagSize;
  /** Tags from data; render each with the children function. */
  items?: Iterable<T>;
  children: ReactNode | ((item: T) => ReactNode);
  className?: string;
}

export function TagGroup<T extends object>({
  label,
  hint,
  emptyState,
  size = "medium",
  items,
  children,
  className,
  ...props
}: TagGroupProps<T>) {
  return (
    <AriaTagGroup {...props} className={cx("flex flex-col items-start gap-1.5", className)}>
      {label ? <Label>{label}</Label> : null}
      <SizeContext.Provider value={size}>
        <AriaTagList
          items={items}
          renderEmptyState={emptyState ? () => <span className="py-1 text-body-regular text-text-tertiary">{emptyState}</span> : undefined}
          className="flex flex-wrap gap-1.5 outline-none"
        >
          {children}
        </AriaTagList>
      </SizeContext.Provider>
      {hint ? <HintText>{hint}</HintText> : null}
    </AriaTagGroup>
  );
}

export interface TagProps extends Omit<AriaTagProps, "className" | "children"> {
  /** Chip's colour pairs. Default neutral. */
  color?: ChipColor;
  /** Remix Icon before the label. */
  icon?: IconComponent;
  className?: string;
  children: ReactNode;
}

export function Tag({ color = "neutral", icon: Icon, className, children, ...props }: TagProps) {
  const size = useContext(SizeContext);

  return (
    <AriaTag
      {...props}
      textValue={props.textValue ?? (typeof children === "string" ? children : undefined)}
      className={({ isSelected, selectionMode, allowsRemoving, isHovered, isFocusVisible, isDisabled }) => {
        const allowsSelection = selectionMode !== "none";
        return cx(
          "inline-flex max-w-full items-center gap-1 rounded-lg outline-none",
          "transition-[background-color,color,box-shadow,filter] duration-150 ease-out",
          size === "small" ? "h-6 px-1.5 text-caption-1-medium" : "h-7 px-2 text-body-medium",
          allowsRemoving && (size === "small" ? "pe-0.5" : "pe-1"),
          isSelected ? "bg-accent-500 text-white" : CHIP_COLORS[color],
          allowsSelection ? "cursor-pointer" : "cursor-default",
          allowsSelection && !isSelected && isHovered && (color === "neutral" ? "bg-background-tertiary-hover" : "brightness-95"),
          isFocusVisible && "ring-2 ring-border-focus-ring",
          isDisabled && "cursor-not-allowed opacity-50",
          className,
        );
      }}
    >
      {({ allowsRemoving }) => (
        <>
          {Icon ? <Icon aria-hidden className={cx("shrink-0", size === "small" ? "size-3.5" : "size-4")} /> : null}
          <span className="truncate">{children}</span>
          {allowsRemoving ? (
            <AriaButton
              slot="remove"
              className={cx(
                "flex shrink-0 cursor-pointer items-center justify-center rounded-md opacity-60 outline-none",
                "transition-[opacity,background-color] duration-150 ease-out hover:bg-current/15 hover:opacity-100",
                size === "small" ? "size-4" : "size-5",
              )}
            >
              <RiCloseLine aria-hidden className={size === "small" ? "size-3" : "size-3.5"} />
            </AriaButton>
          ) : null}
        </>
      )}
    </AriaTag>
  );
}
