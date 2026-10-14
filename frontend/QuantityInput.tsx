import { InputGroup, InputGroupText } from "@astryxdesign/core/InputGroup";
import { TextInput, type TextInputProps } from "@astryxdesign/core/TextInput";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Icon } from "@astryxdesign/core/Icon";
import { MinusIcon, PlusIcon } from "@heroicons/react/24/outline";
import { MAX_QUANTITY, steppedQuantity } from "./quantityStep";
import { useEffect, useRef } from "react";
import { playMotion } from "./motion";

type QuantityInputProps = Pick<
  TextInputProps,
  | "label"
  | "value"
  | "htmlName"
  | "isRequired"
  | "isDisabled"
  | "description"
  | "status"
  | "size"
  | "placeholder"
> & {
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  controlLabel?: string;
};

export function QuantityInput({
  label,
  value,
  onChange,
  htmlName,
  isRequired,
  isDisabled,
  description,
  status,
  size = "md",
  placeholder = "0",
  min = "0",
  max = MAX_QUANTITY,
  controlLabel = label,
}: QuantityInputProps) {
  const smaller = steppedQuantity(value, -1, min, max);
  const larger = steppedQuantity(value, 1, min, max);
  const inputRef = useRef<HTMLInputElement>(null);
  const feedback = useRef<Animation | undefined>(undefined);
  useEffect(() => () => feedback.current?.cancel(), []);
  const step = (next: string | null) => {
    if (!isDisabled && next !== null) {
      onChange(next);
      feedback.current?.cancel();
      if (inputRef.current)
        feedback.current = playMotion(
          inputRef.current,
          [{ opacity: 0.55 }, { opacity: 1 }],
          "fast",
        );
    }
  };
  return (
    <InputGroup
      label={label}
      description={description}
      isRequired={isRequired}
      isDisabled={isDisabled}
      status={status}
      size={size}
    >
      <InputGroupText>
        <IconButton
          label={`Kurangi ${controlLabel.toLowerCase()}`}
          tooltip={`Kurangi ${controlLabel.toLowerCase()}`}
          icon={<Icon icon={MinusIcon} />}
          type="button"
          size="sm"
          variant="ghost"
          isDisabled={isDisabled || smaller === null}
          onClick={() => step(smaller)}
        />
      </InputGroupText>
      <TextInput
        ref={inputRef}
        label={controlLabel}
        value={value}
        onChange={onChange}
        htmlName={htmlName}
        isRequired={isRequired}
        isDisabled={isDisabled}
        placeholder={placeholder}
        onKeyDown={(event) => {
          if (
            !event.altKey &&
            !event.ctrlKey &&
            !event.metaKey &&
            ["ArrowUp", "ArrowDown"].includes(event.key)
          ) {
            event.preventDefault();
            step(event.key === "ArrowUp" ? larger : smaller);
          }
        }}
      />
      <InputGroupText>
        <IconButton
          label={`Tambah ${controlLabel.toLowerCase()}`}
          tooltip={`Tambah ${controlLabel.toLowerCase()}`}
          icon={<Icon icon={PlusIcon} />}
          type="button"
          size="sm"
          variant="ghost"
          isDisabled={isDisabled || larger === null}
          onClick={() => step(larger)}
        />
      </InputGroupText>
    </InputGroup>
  );
}
