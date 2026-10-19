import { useState } from "react";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { DateInput } from "@astryxdesign/core/DateInput";
import { Pagination } from "@astryxdesign/core/Pagination";
import type { ISODateString } from "@astryxdesign/core/Calendar";
import {
  VStack,
  HStack,
  StackItem,
  Text,
  Button,
  Link,
  Empty,
  PageHeader,
  Status,
  Banner,
  DataTable,
  dateLabel,
  quantity,
} from "../ui";
import { useApp } from "../router";
import { withReturn } from "../navigation";

const requestLabels: Record<string, string> = {
  DRAFT: "Draf",
  SUBMITTED: "Diajukan",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
};

export default function Samples() {
  const { page, navigate, busy } = useApp();
  const d = page.data;
  const [from, setFrom] = useState(d.date_from || "");
  const [to, setTo] = useState(d.date_to || "");
  const update = (changes: Record<string, string> = {}) => {
    const params = new URLSearchParams({
      status: d.selected_status || "",
      fulfillment: d.selected_fulfillment || "",
      customer: d.selected_customer || "",
      sales: d.selected_sales || "",
      from,
      to,
      sort: d.selected_sort || "-created_at",
      ...changes,
    });
    for (const [key, value] of [...params]) if (!value) params.delete(key);
    void navigate("/samples/" + (params.size ? "?" + params : ""));
  };
  const filtered =
    d.selected_status ||
    d.selected_fulfillment ||
    d.selected_customer ||
    d.selected_sales ||
    from ||
    to;
  return (
    <Layout
      height="fill"
      header={
        <PageHeader
          title="Pengajuan sampel"
          description={
            page.role === "WAREHOUSE"
              ? "Pengajuan disetujui yang perlu dipenuhi gudang."
              : "Ajukan, tinjau, dan telusuri pemberian sampel pelanggan."
          }
          actions={
            <HStack gap={2}>
              {page.role === "MANAGER" && (
                <Button
                  label="Atur kebijakan"
                  href={withReturn("/samples/policy/", page.url)}
                />
              )}
              {page.role !== "WAREHOUSE" && (
                <Button
                  label="Buat pengajuan"
                  variant="primary"
                  href={withReturn("/samples/new/", page.url)}
                />
              )}
            </HStack>
          }
        />
      }
      content={
        <LayoutContent padding={6} data-oneflow-scroll>
          <VStack gap={4}>
            <HStack gap={3} vAlign="end" wrap="wrap">
              <Selector
                label="Status pengajuan"
                width="13rem"
                value={d.selected_status || ""}
                options={[
                  { value: "", label: "Semua status" },
                  ...d.status_options,
                ]}
                onChange={(status) => update({ status, page: "1" })}
              />
              <Selector
                label="Pemenuhan"
                width="13rem"
                value={d.selected_fulfillment || ""}
                options={[
                  { value: "", label: "Semua tahap" },
                  ...d.fulfillment_options,
                ]}
                onChange={(fulfillment) =>
                  update({ fulfillment, page: "1" })
                }
              />
              <Selector
                label="Pelanggan"
                width="16rem"
                hasSearch
                value={d.selected_customer || ""}
                options={[
                  { value: "", label: "Semua pelanggan" },
                  ...d.customer_options,
                ]}
                onChange={(customer) => update({ customer, page: "1" })}
              />
              {page.role === "MANAGER" && (
                <Selector
                  label="Sales"
                  width="13rem"
                  value={d.selected_sales || ""}
                  options={[
                    { value: "", label: "Semua sales" },
                    ...d.sales_options,
                  ]}
                  onChange={(sales) => update({ sales, page: "1" })}
                />
              )}
              <StackItem>
                <DateInput
                  label="Dibuat mulai"
                  value={(from || undefined) as ISODateString | undefined}
                  onChange={(value) => setFrom(value || "")}
                  hasClear
                  format="system_date"
                />
              </StackItem>
              <StackItem>
                <DateInput
                  label="Sampai"
                  value={(to || undefined) as ISODateString | undefined}
                  onChange={(value) => setTo(value || "")}
                  hasClear
                  format="system_date"
                />
              </StackItem>
              <Button
                label="Terapkan periode"
                onClick={() => update({ page: "1" })}
                isLoading={busy}
              />
              {filtered && (
                <Button label="Reset filter" href="/samples/" variant="secondary" />
              )}
            </HStack>
            {d.date_error && <Banner status="warning" title={d.date_error} />}
            <Text type="supporting">{quantity(d.total)} pengajuan</Text>
            <DataTable
              rows={d.samples}
              empty={
                <Empty
                  title={
                    filtered
                      ? "Tidak ada pengajuan yang cocok"
                      : "Belum ada pengajuan sampel"
                  }
                  description={
                    filtered
                      ? "Ubah atau reset filter untuk melihat pengajuan lain."
                      : page.role === "WAREHOUSE"
                        ? "Pengajuan akan tampil setelah disetujui manajer."
                        : "Buat draf untuk mulai mengajukan sampel pelanggan."
                  }
                />
              }
              columns={[
                {
                  key: "number",
                  header: "Pengajuan",
                  renderCell: (row) => (
                    <VStack gap={1}>
                      <Link
                        weight="semibold"
                        href={withReturn(`/samples/${row.id}/`, page.url)}
                      >
                        {row.number}
                      </Link>
                      <Text type="supporting">{row.lines.length} produk</Text>
                    </VStack>
                  ),
                },
                {
                  key: "customer",
                  header: "Pelanggan",
                  renderCell: (row) => (
                    <VStack gap={1}>
                      <Text>{row.customer.name}</Text>
                      <Text type="supporting">{row.customer.code}</Text>
                    </VStack>
                  ),
                },
                {
                  key: "sales",
                  header: "Sales",
                  renderCell: (row) => <Text>{row.sales.name}</Text>,
                },
                {
                  key: "created_at",
                  header: "Dibuat",
                  renderCell: (row) => <Text>{dateLabel(row.created_at)}</Text>,
                },
                {
                  key: "status",
                  header: "Pengajuan",
                  renderCell: (row) => (
                    <Status value={row.status} label={requestLabels[row.status]} />
                  ),
                },
                {
                  key: "fulfillment_status",
                  header: "Pemenuhan",
                  renderCell: (row) => (
                    <Status
                      value={row.fulfillment_status}
                      label={row.fulfillment_label}
                    />
                  ),
                },
                {
                  key: "outcome",
                  header: "Hasil",
                  renderCell: (row) => <Text>{row.outcome_label}</Text>,
                },
              ]}
            />
            {Number(d.pages) > 1 && (
              <Pagination
                page={Number(d.page)}
                totalItems={Number(d.total)}
                pageSize={20}
                onChange={(pageNumber) => update({ page: String(pageNumber) })}
                isDisabled={busy}
                label="Halaman pengajuan sampel"
              />
            )}
          </VStack>
        </LayoutContent>
      }
    />
  );
}
