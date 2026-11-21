"use client";

import { useRef, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { SearchField as AriaSearchField } from "react-aria-components";
import type { SearchFieldProps as AriaSearchFieldProps } from "react-aria-components";
import { RiSearchLine } from "@remixicon/react";
import { CloseButton } from "@/components/base/buttons/close-button";
import { HintText } from "@/components/base/input/hint-text";
import { InputBase } from "@/components/base/input/input";
import type { InputSize } from "@/components/base/input/input";
import { Label } from "@/components/base/input/label";
import { SpinnerGlyph } from "@/components/base/spinner/spinner";
import { useTemplateCopy } from "@/components/foundations/template-copy/template-copy";
import { cx } from "@/utils/cx";

/**
 * Search field — a text field for a query: filter a list, search a table,
 * look something up.
 *
 *   <SearchField aria-label="Search teammates" placeholder="Search" value={query} onChange={setQuery} />
 *
 * Input's field (surface, hover and focus rings, invalid and disabled states,
 * two sizes) with a search icon and a small clear button that fades in once
 * there is text. It is a pill by default, like the tables' and the docs
 * sidebar's search; `shape="rounded"` matches Input in a form. `isLoading`
 * turns the icon into Spinner's orbiting light while results load.
 *
 * Built on React Aria's SearchField: Escape clears the text, Enter calls
 * `onSubmit`, and the clear button stays out of the tab order, since Escape
 * does its job from the keyboard.
 */

type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

export interface SearchFieldProps extends Omit<AriaSearchFieldProps, "className" | "children"> {
  label?: ReactNode;
  hint?: ReactNode;
  placeholder?: string;
  /** 36px (default) or 32px. */
  size?: InputSize;
  /** `pill` (default) or `rounded`, Input's corners. */
  shape?: "pill" | "rounded";
  /** Show Spinner's light in place of the icon while results load. */
  isLoading?: boolean;
  /** Replaces the search icon. */
  icon?: IconComponent;
  /** Accessible name of the clear button. Default "Clear search". */
  clearLabel?: string;
  className?: string;
  fieldClassName?: string;
}

export function SearchField({
  label,
  hint,
  placeholder,
  size = "medium",
  shape = "pill",
  isLoading = false,
  icon: Icon = RiSearchLine,
  clearLabel = "Clear search",
  value: controlledValue,
  defaultValue = "",
  onChange,
  onClear,
  "aria-label": ariaLabel,
  className,
  fieldClassName,
  ...props
}: SearchFieldProps) {
  const localize = useTemplateCopy();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const value = controlledValue ?? uncontrolledValue;

  const change = (next: string) => {
    setUncontrolledValue(next);
    onChange?.(next);
  };

  const clear = () => {
    change("");
    onClear?.();
    inputRef.current?.focus();
  };

  return (
    <AriaSearchField
      {...props}
      value={value}
      onChange={change}
      onClear={onClear}
      aria-label={ariaLabel ?? (!label ? placeholder : undefined)}
      className={cx("group flex w-full flex-col items-start gap-1", className)}
    >
      {({ isEmpty, isDisabled, isInvalid }) => (
        <>
          {label ? (
            <Label isRequired={props.isRequired} isInvalid={isInvalid}>
              {label}
            </Label>
          ) : null}
          <InputBase
            ref={inputRef}
            size={size}
            placeholder={placeholder}
            fieldClassName={cx(shape === "pill" && "rounded-full", fieldClassName)}
            className="[&::-webkit-search-cancel-button]:hidden"
            leadingAddon={
              // The icon and the light share one 20px box and cross-fade.
              <span aria-hidden className="relative ms-1 size-5 shrink-0">
                <Icon
                  className={cx(
                    "absolute inset-0 size-5 transition-[opacity,scale] duration-200 ease-out",
                    isLoading && "scale-75 opacity-0",
                  )}
                />
                <span
                  className={cx(
                    "absolute inset-0 flex items-center justify-center transition-[opacity,scale] duration-200 ease-out",
                    // Hidden, the light stays mounted for the fade but stops turning.
                    !isLoading && "scale-75 opacity-0 [&_*]:[animation-play-state:paused]",
                  )}
                >
                  <SpinnerGlyph size="sm" />
                </span>
              </span>
            }
            trailingAddon={
              <CloseButton
                size="2xs"
                aria-label={localize(clearLabel)}
                aria-hidden={isEmpty || undefined}
                tabIndex={-1}
                disabled={isDisabled}
                // Keep focus in the input while the pointer clears it.
                onMouseDown={(event) => event.preventDefault()}
                onClick={clear}
                className={cx(
                  "me-0.5 bg-background-tertiary-hover transition-[opacity,scale,color] duration-150 ease-out",
                  isEmpty || isDisabled ? "pointer-events-none scale-50 opacity-0" : "scale-100 opacity-100",
                )}
              />
            }
          />
          {hint ? <HintText isInvalid={isInvalid}>{hint}</HintText> : null}
        </>
      )}
    </AriaSearchField>
  );
}
