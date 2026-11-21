import {
  useId,
  type CSSProperties,
  type KeyboardEventHandler,
  type ReactNode,
  type Ref,
} from "react";
import { parseDate } from "@internationalized/date";
import { Input } from "@/components/base/input/input";
import { Textarea } from "@/components/base/textarea/textarea";
import { Select, SelectItem } from "@/components/base/select/select";
import { ComboBox, ComboBoxItem } from "@/components/base/combobox/combobox";
import { DatePicker } from "@/components/base/date-picker/date-picker";
import { hintTextClassName } from "@/components/base/input/hint-text";
import { RiSearchLine } from "@remixicon/react";
import { cx } from "@/utils/cx";

export type FieldStatus = { type: "error" | "warning" | "success"; message?: string };
type FieldSize = "sm" | "md" | "lg";
type Width = number | string;

interface FieldBase {
  label: string;
  isLabelHidden?: boolean;
  description?: ReactNode;
  status?: FieldStatus;
  /** Kept for call-site compatibility; messages always render under the field. */
  statusVariant?: "detached" | "attached";
  isRequired?: boolean;
  isDisabled?: boolean;
  htmlName?: string;
  size?: FieldSize;
  width?: Width;
}

const widthStyle = (width?: Width): CSSProperties | undefined =>
  width === undefined ? undefined : { width, maxWidth: "100%" };

function Message({ status, description }: Pick<FieldBase, "status" | "description">) {
  const isError = status?.type === "error";
  const text = status?.message || description;
  if (!text) return null;
  return (
    <span role={isError ? "alert" : undefined} className={hintTextClassName(isError)}>
      {text}
    </span>
  );
}

function FieldLabel({
  id,
  label,
  isRequired,
  isHidden,
}: {
  id?: string;
  label: string;
  isRequired?: boolean;
  isHidden?: boolean;
}) {
  return (
    <span
      id={id}
      className={cx("text-body-medium text-text-primary", isHidden && "sr-only")}
    >
      {label}
      {isRequired && (
        <span aria-hidden className="ps-0.5 text-text-error-primary">
          *
        </span>
      )}
    </span>
  );
}

export interface TextInputProps extends FieldBase {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "password" | "email" | "tel" | "url" | "search" | "number";
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "email" | "search";
  isReadOnly?: boolean;
  isLoading?: boolean;
  hasClear?: boolean;
  hasAutoFocus?: boolean;
  maxLength?: number;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  onBlur?: () => void;
  ref?: Ref<HTMLInputElement>;
  className?: string;
  /** `"search"` shows the search glyph before the value. */
  startIcon?: "search";
  controlStyle?: CSSProperties;
  /** Element inside the field, after the value (e.g. a show-password toggle). */
  endContent?: ReactNode;
}

export function TextInput({
  label,
  isLabelHidden,
  description,
  status,
  isRequired,
  isDisabled,
  isReadOnly,
  htmlName,
  size,
  width,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
  inputMode,
  hasAutoFocus,
  maxLength,
  onKeyDown,
  onBlur,
  ref,
  className,
  startIcon,
  endContent,
}: TextInputProps) {
  const isInvalid = status?.type === "error";
  return (
    <div className={cx("min-w-0", className)} style={widthStyle(width)}>
      <Input
        ref={ref}
        label={isLabelHidden ? undefined : label}
        aria-label={isLabelHidden ? label : undefined}
        value={value}
        onChange={onChange}
        name={htmlName}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        autoFocus={hasAutoFocus}
        maxLength={maxLength}
        placeholder={placeholder}
        isRequired={isRequired}
        isDisabled={isDisabled}
        isReadOnly={isReadOnly}
        isInvalid={isInvalid}
        validationBehavior="aria"
        size={size === "sm" ? "small" : "medium"}
        hint={status?.message || description}
        onKeyDown={onKeyDown as never}
        onBlur={onBlur}
        leadingIcon={startIcon === "search" ? RiSearchLine : undefined}
        trailingAddon={endContent}
      />
    </div>
  );
}

export function TextArea({
  label,
  isLabelHidden,
  description,
  status,
  isRequired,
  isDisabled,
  htmlName,
  width,
  value,
  onChange,
  placeholder,
  rows = 3,
  maxLength,
}: FieldBase & {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}) {
  return (
    <div className="min-w-0" style={widthStyle(width)}>
      <Textarea
        label={isLabelHidden ? undefined : label}
        aria-label={isLabelHidden ? label : undefined}
        value={value}
        onChange={onChange}
        name={htmlName}
        rows={rows}
        autoResize
        maxRows={10}
        maxLength={maxLength}
        placeholder={placeholder}
        isRequired={isRequired}
        isDisabled={isDisabled}
        isInvalid={status?.type === "error"}
        validationBehavior="aria"
        hint={status?.message || description}
      />
    </div>
  );
}

export interface SelectorOption {
  value: string;
  label: string;
  description?: string;
  isDisabled?: boolean;
  disabled?: boolean;
}

// React Aria keys cannot be empty, and Django choice lists start with "".
const EMPTY = "__empty__";
const toKey = (value: string) => (value === "" ? EMPTY : value);
const fromKey = (key: unknown) => (key === EMPTY || key == null ? "" : String(key));

export function Selector({
  label,
  isLabelHidden,
  description,
  status,
  isRequired,
  isDisabled,
  htmlName,
  size,
  width,
  value,
  options,
  onChange,
  placeholder = "Pilih…",
  hasSearch,
  emptySearchText = "Tidak ada hasil",
  renderOption,
  renderValue,
}: FieldBase & {
  value: string;
  options: SelectorOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  hasSearch?: boolean;
  searchPlaceholder?: string;
  emptySearchText?: string;
  renderOption?: (option: SelectorOption) => ReactNode;
  renderValue?: (option: SelectorOption) => ReactNode;
}) {
  const isInvalid = status?.type === "error";
  const selected = options.find((option) => option.value === value);
  const row = (option: SelectorOption) =>
    renderOption ? (
      renderOption(option)
    ) : option.description ? (
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{option.label}</span>
        <span className="truncate text-caption-1-regular text-text-secondary">
          {option.description}
        </span>
      </span>
    ) : (
      option.label
    );
  const shown = isLabelHidden ? undefined : (
    <>
      {label}
    </>
  );
  return (
    <div className="flex min-w-0 flex-col gap-1" style={widthStyle(width)}>
      {htmlName && <input type="hidden" name={htmlName} value={value} />}
      {hasSearch ? (
        <ComboBox
          label={shown}
          aria-label={isLabelHidden ? label : undefined}
          placeholder={selected ? selected.label : placeholder}
          size={size === "sm" ? "small" : "medium"}
          emptyMessage={emptySearchText}
          defaultItems={options}
          selectedKey={selected ? toKey(value) : null}
          onSelectionChange={(key) => {
            if (key != null) onChange(fromKey(key));
          }}
          menuTrigger="focus"
          isRequired={isRequired}
          isDisabled={isDisabled}
          isInvalid={isInvalid}
          validationBehavior="aria"
        >
          {(option: SelectorOption) => (
            <ComboBoxItem
              id={toKey(option.value)}
              textValue={option.label}
              isDisabled={option.isDisabled ?? option.disabled}
            >
              {row(option)}
            </ComboBoxItem>
          )}
        </ComboBox>
      ) : (
        <Select
          label={shown}
          aria-label={isLabelHidden ? label : undefined}
          placeholder={placeholder}
          size={size === "sm" ? "sm" : "md"}
          className="w-full"
          popoverClassName="max-w-[min(28rem,calc(100vw-2rem))]"
          items={options}
          selectedKey={selected ? toKey(value) : null}
          onSelectionChange={(key) => onChange(fromKey(key))}
          isRequired={isRequired}
          isDisabled={isDisabled}
          isInvalid={isInvalid}
          validationBehavior="aria"
          renderValue={
            selected ? (
              <span className="truncate">
                {renderValue ? renderValue(selected) : selected.label}
              </span>
            ) : (
              <span className="truncate text-text-tertiary">{placeholder}</span>
            )
          }
        >
          {((option: SelectorOption) => (
            <SelectItem
              id={toKey(option.value)}
              textValue={option.label}
              isDisabled={option.isDisabled ?? option.disabled}
            >
              {row(option)}
            </SelectItem>
          )) as never}
        </Select>
      )}
      <Message status={status} description={description} />
    </div>
  );
}

export type ISODateString = string;

const DATE_FORMAT = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export function DateInput({
  label,
  isLabelHidden,
  description,
  status,
  isRequired,
  isDisabled,
  htmlName,
  width,
  value,
  onChange,
  placeholder = "Pilih tanggal",
  hasClear,
}: FieldBase & {
  value?: ISODateString;
  onChange: (value: ISODateString | undefined) => void;
  placeholder?: string;
  hasClear?: boolean;
  format?: string;
}) {
  const labelId = useId();
  let parsed = null;
  try {
    parsed = value ? parseDate(value) : null;
  } catch {
    parsed = null;
  }
  return (
    <div className="flex min-w-0 flex-col gap-1" style={widthStyle(width)}>
      <FieldLabel id={labelId} label={label} isRequired={isRequired} isHidden={isLabelHidden} />
      {htmlName && <input type="hidden" name={htmlName} value={value ?? ""} />}
      <div className="flex items-center gap-1.5">
        <DatePicker
          aria-label={label}
          value={parsed}
          onChange={(next) => onChange(next ? next.toString() : undefined)}
          isDisabled={isDisabled}
          className={cx(
            "min-w-0 flex-1 justify-start border-transparent bg-background-tertiary-default shadow-none hover:bg-background-tertiary-default",
            status?.type === "error" && "ring-2 ring-inset ring-border-error",
          )}
          triggerLabel={
            parsed ? (
              DATE_FORMAT.format(new Date(value + "T00:00:00Z"))
            ) : (
              <span className="text-text-tertiary">{placeholder}</span>
            )
          }
        />
        {hasClear && parsed && !isDisabled && (
          <button
            type="button"
            aria-label={`Hapus ${label.toLowerCase()}`}
            onClick={() => onChange(undefined)}
            className="cursor-pointer rounded-md px-1.5 py-1 text-caption-1-medium text-text-secondary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          >
            Hapus
          </button>
        )}
      </div>
      <Message status={status} description={description} />
    </div>
  );
}

/** Label + joined controls (stepper buttons around an input) + message. */
export function InputGroup({
  label,
  description,
  status,
  isRequired,
  children,
}: Pick<FieldBase, "label" | "description" | "status" | "isRequired" | "isDisabled" | "size"> & {
  children: ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className="flex min-w-0 flex-col gap-1">
      <FieldLabel label={label} isRequired={isRequired} />
      <div className="flex items-center gap-1.5 [&_label]:sr-only">{children}</div>
      <Message status={status} description={description} />
    </div>
  );
}

export function InputGroupText({ children }: { children: ReactNode }) {
  return <span className="inline-flex shrink-0 items-center">{children}</span>;
}

export function FormLayout({
  children,
}: {
  children: ReactNode;
  defaultOptionality?: string;
}) {
  return <div className="flex flex-col gap-4">{children}</div>;
}

/** Two-line option content for `Selector.renderOption`. */
export function SelectorOption({ label, description }: { label: ReactNode; description?: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate">{label}</span>
      {description && (
        <span className="truncate text-caption-1-regular text-text-secondary">{description}</span>
      )}
    </span>
  );
}
