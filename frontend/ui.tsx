import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  Layout,
  LayoutContent,
  LayoutHeader,
  LayoutFooter,
  VStack,
  HStack,
  StackItem,
  Section,
} from "@astryxdesign/core/Layout";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Selector } from "@astryxdesign/core/Selector";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import type { ISODateString } from "@astryxdesign/core/Calendar";
import { DateInput } from "@astryxdesign/core/DateInput";
import { Link } from "@astryxdesign/core/Link";
import { Token } from "@astryxdesign/core/Token";
import { Icon } from "@astryxdesign/core/Icon";
import {
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import {
  Table,
  useTableSortable,
  proportional,
  type TableColumn,
  type TableSortState,
} from "@astryxdesign/core/Table";
import { useApp } from "./router";
import type { Field, FormSpec, Row } from "./types";
import { QuantityInput } from "./QuantityInput";
export {
  VStack,
  HStack,
  StackItem,
  Section,
  Text,
  Heading,
  Button,
  Banner,
  Link,
  Table,
  Token,
};
export const money = (value: string | number) =>
  "Rp " + BigInt(value || 0).toLocaleString("id-ID");
export const quantity = (value: string | number) =>
  BigInt(value || 0).toLocaleString("id-ID");
export const dateLabel = (value?: string, time = false) =>
  value
    ? new Intl.DateTimeFormat("id-ID", {
        dateStyle: "medium",
        ...(time ? { timeStyle: "short" as const } : {}),
        timeZone: "Asia/Jakarta",
      }).format(
        new Date(value.length === 10 ? value + "T00:00:00+07:00" : value),
      )
    : "—";
export function PageHeader({
  title,
  description,
  actions,
  back,
  leading,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  back?: { href: string; label: string };
  leading?: ReactNode;
}) {
  return (
    <LayoutHeader padding={6}>
      <VStack gap={3}>
        {back && (
          <Link href={back.href} color="secondary">
            ← {back.label}
          </Link>
        )}
        <HStack gap={4} vAlign="center" hAlign="between">
          <HStack gap={3} vAlign="center">
            {leading}
            <VStack gap={2}>
              <Heading level={1}>{title}</Heading>
              {description && <Text color="secondary">{description}</Text>}
            </VStack>
          </HStack>
          {actions && <StackItem>{actions}</StackItem>}
        </HStack>
      </VStack>
    </LayoutHeader>
  );
}
export function Status({ value, label }: { value: string; label?: string }) {
  const labels: Row = {
    DRAFT: "Draft",
    SUBMITTED: "Menunggu keputusan",
    APPROVED: "Disetujui",
    REJECTED: "Ditolak",
    WAITING: "Belum dikirim",
    RECEIVED: "Diterima",
    ACTIVE: "Aktif",
    HELD: "Ditahan",
    REVIEW: "Perlu ditinjau",
    RECOMMENDED: "Direkomendasikan",
    CONFIRMED: "Menunggu pengiriman",
    SHIPPED: "Terkirim",
    CANCELLED: "Dibatalkan",
    PLANNED: "Direncanakan",
    DONE: "Selesai",
    READY: "Siap ditindaklanjuti",
    WAITING_STOCK: "Menunggu stok",
    OVERDUE: "Terlambat",
    DUE_TODAY: "Hari ini",
    STOCK_CONFLICT: "Konflik stok",
    STOCK_EMPTY: "Stok bebas habis",
    STOCK_LOW: "Menipis",
    STOCK_READY: "Cukup",
    PASOKAN_AMAN: "Aman",
    PERLU_PENGADAAN: "Perlu pengadaan",
    RISIKO_KOSONG_TERLAMBAT: "Risiko kosong, percepat",
    PERLU_KONFIGURASI: "Perlu konfigurasi",
    PERLU_DITINJAU: "Perlu ditinjau",
  };
  const critical = [
    "OVERDUE",
    "STOCK_CONFLICT",
    "STOCK_EMPTY",
    "WAITING_STOCK",
    "RISIKO_KOSONG_TERLAMBAT",
  ].includes(value);
  const warning = [
    "STOCK_LOW",
    "PERLU_PENGADAAN",
    "PERLU_KONFIGURASI",
    "HELD",
    "REVIEW",
    "NEEDS_REVIEW",
    "REJECT_SUGGESTED",
    "PERLU_DITINJAU",
  ].includes(value);
  return (
    <HStack hAlign="start">
      <Token
        label={label || labels[value] || value}
        icon={
          critical || warning ? (
            <Icon
              icon={critical ? ExclamationCircleIcon : ExclamationTriangleIcon}
              color="inherit"
            />
          ) : undefined
        }
        color={
          critical
            ? "red"
            : warning
              ? "orange"
              : [
                    "SHIPPED",
                    "DONE",
                    "STOCK_READY",
                    "PASOKAN_AMAN",
                    "APPROVED",
                    "RECEIVED",
                    "RECOMMENDED",
                    "APPROVE_SUGGESTED",
                  ].includes(value)
                ? "green"
                : [
                      "CONFIRMED",
                      "READY",
                      "SUBMITTED",
                      "DUE_TODAY",
                      "PERLU_DITINJAU",
                    ].includes(value)
                  ? "blue"
                  : "gray"
        }
        size="sm"
      />
    </HStack>
  );
}
export function Empty({
  title = "Belum ada data",
  description = "Data akan muncul di sini setelah ditambahkan.",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <VStack gap={3} hAlign="center" padding={10}>
      <Heading level={3}>{title}</Heading>
      <Text color="secondary">{description}</Text>
      {action}
    </VStack>
  );
}
export function DataTable({
  rows,
  columns,
  empty,
}: {
  rows: Row[];
  columns: TableColumn<Row>[];
  empty?: ReactNode;
}) {
  const [sort, setSort] = useState<TableSortState>([]);
  const sorting = useTableSortable({
    sort,
    onSortChange: setSort,
    allowUnsortedState: true,
  });
  const ordered = sort.length
    ? [...rows].sort((a, b) => {
        const { sortKey, direction } = sort[0];
        const av = a[sortKey],
          bv = b[sortKey];
        // Django serializes integer amounts as strings; lexical or Number sorting loses precision.
        const order =
          /^-?\d+$/.test(String(av)) && /^-?\d+$/.test(String(bv))
            ? BigInt(av) < BigInt(bv)
              ? -1
              : BigInt(av) > BigInt(bv)
                ? 1
                : 0
            : String(av ?? "").localeCompare(String(bv ?? ""), "id", {
                numeric: true,
              });
        return direction === "ascending" ? order : -order;
      })
    : rows;
  return rows.length ? (
    <Table
      data={ordered}
      plugins={{ sort: sorting }}
      columns={columns.map((column) => ({
        ...column,
        width: column.width || proportional(1, { minWidth: 96 }),
      }))}
      idKey="id"
      hasHover
      density="compact"
      textOverflow="wrap"
    />
  ) : (
    empty || <Empty />
  );
}
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
          data-form-errors
          tabIndex={-1}
        />
      ))}
      {spec.fields
        .filter((field) => {
          const outcome = values.outcome;

          if (field.key === "next_date")
            return (
              outcome === "SNOOZED" ||
              (!outcomeChanged && field.errors.length > 0)
            );
          if (field.key === "order_id")
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
  const { page, submit } = useApp();
  return (
    <form
      id={id}
      method="post"
      action={action || page.url}
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
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
export function Fact({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <VStack gap={1}>
      <Text type="supporting">{label}</Text>
      <Text>{children}</Text>
    </VStack>
  );
}

// Keep the form mounted while confirming discard: returning to it preserves every field.
const FormChangeContext = createContext<(() => void) | null>(null);
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
  const { busy, clearDirty, error, page } = useApp();
  const [changed, setChanged] = useState(
    !!(page.data.action_dialog || page.data.target_dialog || page.data.dialog),
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
        padding={6}
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
            style={{ maxHeight: "60dvh", overflowY: "auto" }}
          >
            <section hidden={discard}>
              {error && <Banner status="error" title={error} />}
              <FormChangeContext value={() => setChanged(true)}>
                {children}
              </FormChangeContext>
            </section>
            {discard && (
              <VStack padding={6} gap={4}>
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
            <LayoutFooter key="discard-actions" padding={6}>
              <HStack gap={2} hAlign="end">
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
            <LayoutFooter key="form-actions" padding={6}>
              {footer}
            </LayoutFooter>
          ) : undefined
        }
      />
    </Dialog>
  );
}
