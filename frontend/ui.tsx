import type { ComponentProps, ReactNode } from "react";
import {
  LayoutHeader,
  VStack,
  HStack,
  StackItem,
  Section,
} from "@/kit";
import { Text, Heading } from "@/kit";
import { Button } from "@/kit";
import { Banner } from "@/kit";
import { Link } from "@/kit";
import { Token } from "@/kit";
import { Icon } from "@/kit";
import {
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import type { Row } from "./types";
import { useResponsive } from "./responsive";

export { useResponsive } from "./responsive";
export {
  Empty,
  tablePresentation,
  FilterRow,
  useSearchInput,
  resetLabel,
  ResultsSummary,
  DataTable,
  Table,
} from "./components/DataKit";
export {
  FieldControl,
  Fields,
  useFields,
  ServerForm,
  SimpleForm,
  FormDialog,
} from "./components/FormKit";

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
  paddingBlockEnd,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  back?: { href: string; label: string };
  leading?: ReactNode;
  paddingBlockEnd?: ComponentProps<typeof LayoutHeader>["paddingBlockEnd"];
}) {
  const { isMobile, contentPadding } = useResponsive();
  return (
    <LayoutHeader padding={contentPadding} paddingBlockEnd={paddingBlockEnd}>
      <VStack gap={3}>
        {back && (
          <HStack gap={2} vAlign="center">
            <Link href={back.href} color="secondary">
              ← {back.label}
            </Link>
          </HStack>
        )}
        <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
          <HStack gap={3} vAlign="center">
            {leading}
            <VStack gap={1}>
              <Heading level={1}>{title}</Heading>
              {description && <Text type="supporting">{description}</Text>}
            </VStack>
          </HStack>
          {actions && (
            <VStack width={isMobile ? "100%" : undefined}>{actions}</VStack>
          )}
        </HStack>
      </VStack>
    </LayoutHeader>
  );
}

const STATUS_LABELS: Row = {
  DRAFT: "Draf",
  SUBMITTED: "Menunggu keputusan",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  WAITING: "Belum dikirim",
  RECEIVED: "Diterima",
  ACTIVE: "Aktif",
  HELD: "Ditahan",
  DATA_INCOMPLETE: "Data belum lengkap",
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
  STOCK_EMPTY: "Siap jual habis",
  STOCK_LOW: "Menipis",
  STOCK_READY: "Cukup",
  PASOKAN_AMAN: "Aman",
  PERLU_PENGADAAN: "Perlu pengadaan",
  RISIKO_KOSONG_TERLAMBAT: "Risiko kosong, percepat",
  PERLU_KONFIGURASI: "Perlu konfigurasi",
  PERLU_DITINJAU: "Perlu ditinjau",
  CRITICAL: "Alarm kritis",
  WARNING: "Perlu pengadaan",
  SAFE: "Aman",
  FAST: "Laku keras",
  SLOW: "Kurang laku",
  DEAD: "Tidak laku di apotek",
  STOP: "Jangan dibawa",
  PRIORITY: "Prioritaskan bawa",
  REDUCE: "Kurangi bawaan",
  BILLED_PAID: "Ditagih (> 2 item)",
  NOT_BILLED: "Belum ditagih (≤ 2 item)",
  DEFERRED: "Penagihan tunda",
  NEAR_EXPIRY: "Wajib tarik ≤ 6 bln ED",
  DAMAGED: "Tarik barang rusak",
};

const CRITICAL_STATUSES = new Set([
  "OVERDUE",
  "STOCK_CONFLICT",
  "STOCK_EMPTY",
  "WAITING_STOCK",
  "RISIKO_KOSONG_TERLAMBAT",
  "CRITICAL",
  "DEAD",
  "STOP",
  "NEAR_EXPIRY",
  "DAMAGED",
]);

const WARNING_STATUSES = new Set([
  "STOCK_LOW",
  "PERLU_PENGADAAN",
  "PERLU_KONFIGURASI",
  "HELD",
  "DATA_INCOMPLETE",
  "REVIEW",
  "NEEDS_REVIEW",
  "REJECT_SUGGESTED",
  "PERLU_DITINJAU",
  "WARNING",
  "SLOW",
  "REDUCE",
  "DEFERRED",
]);

const GREEN_STATUSES = new Set([
  "SHIPPED",
  "DONE",
  "STOCK_READY",
  "PASOKAN_AMAN",
  "APPROVED",
  "RECEIVED",
  "RECOMMENDED",
  "APPROVE_SUGGESTED",
  "SAFE",
  "FAST",
  "PRIORITY",
  "BILLED_PAID",
]);

const BLUE_STATUSES = new Set([
  "CONFIRMED",
  "READY",
  "SUBMITTED",
  "DUE_TODAY",
  "PERLU_DITINJAU",
]);

export function Status({ value, label }: { value: string; label?: string }) {
  const critical = CRITICAL_STATUSES.has(value);
  const warning = WARNING_STATUSES.has(value);
  const color = critical
    ? "red"
    : warning
      ? "orange"
      : GREEN_STATUSES.has(value)
        ? "green"
        : BLUE_STATUSES.has(value)
          ? "blue"
          : "gray";

  return (
    <HStack hAlign="start">
      <Token
        label={label || STATUS_LABELS[value] || value}
        icon={
          critical || warning ? (
            <Icon
              icon={critical ? ExclamationCircleIcon : ExclamationTriangleIcon}
              color="inherit"
            />
          ) : undefined
        }
        color={color}
        size="sm"
      />
    </HStack>
  );
}

// Describes batch data, not authorization to ship; Django validates dispatch.
export function BatchStatus({ batch, today }: { batch: Row; today: string }) {
  if (batch.expiry_date && batch.expiry_date < today)
    return <Status value="OVERDUE" label="Kedaluwarsa" />;
  if (batch.status === "HELD") return <Status value="HELD" label="Ditahan" />;
  if (!batch.expiry_date || batch.is_complete === false)
    return (
      <Status
        value="DATA_INCOMPLETE"
        label={
          !batch.expiry_date
            ? "Kedaluwarsa belum tercatat"
            : "Data batch belum lengkap"
        }
      />
    );
  return <Status value={batch.status} label={batch.status_label || "Aktif"} />;
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
