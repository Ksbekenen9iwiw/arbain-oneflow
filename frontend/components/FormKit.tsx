import {
  createContext,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Layout,
  LayoutContent,
  LayoutFooter,
  VStack,
  HStack,
  StackItem,
} from "@/kit";
import { Dialog, DialogHeader } from "@/kit";
import { Text } from "@/kit";
import { Button } from "@/kit";
import { Banner } from "@/kit";
import { TextInput } from "@/kit";
import { TextArea } from "@/kit";
import { Selector } from "@/kit";
import { CheckboxInput } from "@/kit";
import type { ISODateString } from "@/kit";
import { DateInput } from "@/kit";
import { useApp } from "../router";
import type { Field, FormSpec } from "../types";
import { QuantityInput } from "../QuantityInput";
import { RequestFeedback } from "../RequestFeedback";
import { useResponsive } from "../responsive";

export function FieldControl({
  field,
  value,
  onChange,
  size = "md",
}: {
  size?: "md" | "lg";
  field: Field;
  value: string | boolean;
  onChange: (v: string | boolean) => void;
}) {
  const base = {
    size,
    label: field.label,
    htmlName: field.name,
    isRequired: field.required,
    description: field.help || undefined,
    status: field.errors.length
      ? { type: "error" as const, message: field.errors.join(" ") }
      : undefined,
  };
  if (field.hidden)
    return <input type="hidden" name={field.name} value={String(value)} />;
  if (["quantity", "counted_quantity", "min_stock"].includes(field.key))
    return (
      <QuantityInput
        {...base}
        value={String(value)}
        onChange={onChange}
        min={field.min ?? (field.key === "quantity" ? "1" : "0")}
        max={field.max ?? undefined}
      />
    );
  if (field.type === "checkbox")
    return (
      <CheckboxInput
        label={field.label}
        htmlName={field.name}
        value={!!value}
        onChange={onChange}
        description={field.help || undefined}
      />
    );
  if (field.type === "select")
    return (
      <Selector
        {...base}
        value={String(value)}
        options={field.choices.map((c) => ({
          ...c,
          label: c.value ? c.label : "Pilih " + field.label.toLowerCase(),
        }))}
        onChange={onChange}
        hasSearch={field.choices.length > 8}
        searchPlaceholder="Cari…"
        emptySearchText="Tidak ada hasil"
        placeholder="Pilih…"
        width="100%"
        statusVariant="detached"
      />
    );
  if (field.type === "textarea")
    return (
      <TextArea
        {...base}
        value={String(value)}
        onChange={onChange}
        rows={3}
        statusVariant="detached"
      />
    );
  if (field.type === "month") {
    const [year = "", month = ""] = String(value).split("-");
    const current = new Date().getFullYear();
    const years = Array.from(
      new Set([
        year,
        ...Array.from({ length: 21 }, (_, i) => String(current - 10 + i)),
      ]),
    )
      .filter(Boolean)
      .sort();
    return (
      <VStack gap={2}>
        <input type="hidden" name={field.name} value={String(value)} />
        <HStack gap={3}>
          <StackItem size="fill">
            <Selector
              label={field.label}
              isRequired={field.required}
              width="100%"
              value={month}
              placeholder="Pilih bulan"
              onChange={(v) => onChange(`${year || current}-${v}`)}
              options={Array.from({ length: 12 }, (_, i) => ({
                value: String(i + 1).padStart(2, "0"),
                label: new Intl.DateTimeFormat("id-ID", {
                  month: "long",
                }).format(new Date(2026, i, 1)),
              }))}
            />
          </StackItem>
          <Selector
            label="Tahun"
            width="9rem"
            value={year}
            placeholder="Tahun"
            hasSearch
            options={years.map((v) => ({ value: v, label: v }))}
            onChange={(v) => onChange(`${v}-${month || "01"}`)}
          />
        </HStack>
        {field.errors.map((error) => (
          <Banner key={error} status="error" title={error} />
        ))}
      </VStack>
    );
  }
  if (field.type === "date")
    return (
      <>
        <input type="hidden" name={field.name} value={String(value)} />
        <DateInput
          label={field.label}
          isRequired={field.required}
          description={field.help || undefined}
          status={base.status}
          value={(String(value) || undefined) as ISODateString | undefined}
          onChange={(v) => onChange(v || "")}
          statusVariant="detached"
          hasClear={!field.required}
          format="system_date"
          placeholder="Pilih tanggal"
        />
        {field.key === "followup_date" && (
          <HStack gap={2} wrap="wrap">
            {[
              { label: "Besok", days: 1 },
              { label: "3 hari", days: 3 },
              { label: "1 minggu", days: 7 },
            ].map(({ label, days }) => (
              <Button
                key={days}
                size="sm"
                variant="secondary"
                label={label}
                onClick={() => {
                  const date = new Date(Date.now() + days * 86400000);
                  onChange(
                    new Intl.DateTimeFormat("en-CA", {
                      timeZone: "Asia/Jakarta",
                    }).format(date),
                  );
                }}
              />
            ))}
          </HStack>
        )}
      </>
    );
  return (
    <TextInput
      {...base}
      description={
        field.type === "month"
          ? "Format tahun-bulan, contoh 2026-10"
          : base.description
      }
      value={String(value)}
      onChange={onChange}
      type={field.type === "password" ? "password" : "text"}
      autoComplete={
        field.key === "username"
          ? "username"
          : field.type === "password"
            ? "current-password"
            : undefined
      }
      statusVariant="detached"
    />
  );
}

export function Fields({
  spec,
  values,
  onChange,
  size,
}: {
  size?: "md" | "lg";
  spec: FormSpec;
  values: Record<string, string | boolean>;
  onChange: (name: string, value: string | boolean) => void;
}) {
  const isDecision =
    spec.fields.some((f) => f.key === "key") &&
    spec.fields.some((f) => f.key === "outcome");
  const outcomeChanged =
    isDecision &&
    values.outcome !== spec.fields.find((f) => f.key === "outcome")?.value;
  return (
    <VStack gap={4}>
      {spec.errors.map((e, i) => (
        <Banner
          key={i}
          status="error"
          title={e}
          role="alert"
          data-form-errors
          tabIndex={-1}
        />
      ))}
      {spec.fields
        .filter((field) => {
          const outcome = values.outcome;

          if (isDecision && field.key === "next_date")
            return (
              outcome === "SNOOZED" ||
              (!outcomeChanged && field.errors.length > 0)
            );
          if (isDecision && field.key === "order_id")
            return (
              outcome === "DONE" || (!outcomeChanged && field.errors.length > 0)
            );
          return true;
        })
        .map((field) => (
          <FieldControl
            key={field.name}
            size={size}
            field={{
              ...field,
              ...(isDecision && field.key === "note"
                ? {
                    label:
                      values.outcome === "DISMISSED"
                        ? "Alasan menutup rekomendasi"
                        : values.outcome === "SNOOZED"
                          ? "Catatan pengingat (opsional)"
                          : "Hasil tindak lanjut",
                  }
                : {}),
              required:
                field.required ||
                (field.key === "next_date" && values.outcome === "SNOOZED") ||
                (field.key === "note" &&
                  (values.outcome === "DISMISSED" ||
                    (values.outcome === "DONE" && !values.order_id))),
              errors:
                values[field.name] !== field.value ||
                (outcomeChanged &&
                  ["note", "order_id", "next_date"].includes(field.key))
                  ? []
                  : field.errors,
            }}
            value={values[field.name] ?? field.value}
            onChange={(v) => onChange(field.name, v)}
          />
        ))}
    </VStack>
  );
}

// Keep the form mounted while confirming discard: returning to it preserves every field.
const FormChangeContext = createContext<(() => void) | null>(null);

export function useFields(spec: FormSpec) {
  const { markDirty } = useApp();
  const onDirty = useContext(FormChangeContext);
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(spec.fields.map((f) => [f.name, f.value])),
  );
  return {
    values,
    onChange: (name: string, value: string | boolean) => {
      markDirty();
      onDirty?.();
      setValues((v) => ({ ...v, [name]: value }));
    },
  };
}

export function ServerForm({
  action,
  id,
  children,
  onSubmit,
}: {
  action?: string;
  id?: string;
  children: ReactNode;
  onSubmit?: (data: FormData) => void;
}) {
  const { page, submit, busy } = useApp();
  return (
    <form
      id={id}
      method="post"
      aria-busy={busy}
      action={action || page.url}
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (busy) return;
        const data = new FormData(e.currentTarget);
        if (onSubmit) onSubmit(data);
        else void submit(action || page.url, data);
      }}
    >
      <input type="hidden" name="csrfmiddlewaretoken" value={page.csrf} />
      {children}
    </form>
  );
}

export function SimpleForm({
  spec,
  action,
  label = "Simpan",
  extra,
  preview,
  onValuesChange,
  variant = "primary",
  id,
  hideSubmit = false,
  fullWidth = false,
}: {
  spec: FormSpec;
  action?: string;
  label?: string;
  extra?: ReactNode;
  preview?: (values: Record<string, string | boolean>) => ReactNode;
  onValuesChange?: (
    name: string,
    value: string | boolean,
    values: Record<string, string | boolean>,
  ) => Record<string, string | boolean>;
  variant?: "primary" | "destructive";
  id?: string;
  hideSubmit?: boolean;
  fullWidth?: boolean;
}) {
  const fields = useFields(spec);
  const { busy } = useApp();
  return (
    <ServerForm action={action} id={id}>
      <VStack gap={6}>
        <Fields
          spec={spec}
          values={fields.values}
          onChange={(name, value) => {
            fields.onChange(name, value);
            for (const [key, next] of Object.entries(
              onValuesChange?.(name, value, {
                ...fields.values,
                [name]: value,
              }) || {},
            ))
              fields.onChange(key, next);
          }}
          size={fullWidth ? "lg" : "md"}
        />
        {preview?.(fields.values)}
        {extra}
        {!hideSubmit && (
          <HStack hAlign="end">
            <Button
              width={fullWidth ? "100%" : undefined}
              size={fullWidth ? "lg" : "md"}
              type="submit"
              label={label}
              variant={variant}
              isLoading={busy}
            />
          </HStack>
        )}
      </VStack>
    </ServerForm>
  );
}

export function FormDialog({
  isOpen,
  onOpenChange,
  title,
  children,
  width = "36rem",
  footer,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  width?: string;
  footer?: ReactNode;
}) {
  const { busy, clearDirty, page } = useApp();
  const { contentPadding } = useResponsive();
  const [changed, setChanged] = useState(
    !!(
      page.data.action_dialog ||
      page.data.target_dialog ||
      page.data.directive_dialog ||
      page.data.raw_material_dialog ||
      page.data.dialog
    ),
  );
  const [discard, setDiscard] = useState(false);
  useEffect(() => {
    if (!isOpen) {
      setChanged(false);
      setDiscard(false);
    }
  }, [isOpen]);
  const close = (open: boolean) => {
    if (open || busy) return;
    if (changed) setDiscard(true);
    else {
      clearDirty();
      onOpenChange(false);
    }
  };
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={close}
      purpose="form"
      width={width}
      maxHeight="85dvh"
      padding={0}
    >
      <Layout
        height="auto"
        padding={contentPadding}
        defaultHasDividers
        header={
          <DialogHeader
            key={discard ? "discard" : "form"}
            hasDivider={false}
            title={discard ? "Buang perubahan?" : title}
            onOpenChange={discard ? () => setDiscard(false) : close}
          />
        }
        content={
          <LayoutContent
            padding={0}
            style={{ maxHeight: "calc(85dvh - 9rem)", overflowY: "auto" }}
          >
            <section hidden={discard}>
              <RequestFeedback />
              <FormChangeContext value={() => setChanged(true)}>
                {children}
              </FormChangeContext>
            </section>
            {discard && (
              <VStack padding={contentPadding} gap={4}>
                <Text>
                  Isian belum disimpan. Anda bisa melanjutkan pengisian atau
                  membuang perubahan.
                </Text>
              </VStack>
            )}
          </LayoutContent>
        }
        footer={
          discard ? (
            <LayoutFooter key="discard-actions" padding={contentPadding}>
              <HStack gap={2} hAlign="end" wrap="wrap">
                <Button
                  label="Lanjut mengisi"
                  type="button"
                  onClick={() => setDiscard(false)}
                />
                <Button
                  label="Buang perubahan"
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    clearDirty();
                    setChanged(false);
                    setDiscard(false);
                    onOpenChange(false);
                  }}
                />
              </HStack>
            </LayoutFooter>
          ) : footer ? (
            <LayoutFooter key="form-actions" padding={contentPadding}>
              {footer}
            </LayoutFooter>
          ) : undefined
        }
      />
    </Dialog>
  );
}
