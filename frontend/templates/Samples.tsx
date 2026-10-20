import type { Row } from "../types";
import { sampleStage } from "../sampleJourney";
import { proportional } from "@astryxdesign/core/Table";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { RecordIdentity } from "../RecordIdentity";
import { useState } from "react";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { DateInput } from "@astryxdesign/core/DateInput";
import { Pagination } from "@astryxdesign/core/Pagination";
import type { ISODateString } from "@astryxdesign/core/Calendar";
import {
  ResultsSummary,
  FilterRow,
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
import { withReturn, listReturn, backLabel } from "../navigation";

const requestLabels: Record<string, string> = {
  DRAFT: "Draf",
  SUBMITTED: "Menunggu keputusan",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
};

export default function Samples() {
  const { page, navigate, busy, refreshing } = useApp();
  const d = page.data;
  const back = listReturn(page.url);
  const resetUrl = back ? withReturn("/samples/", back) : "/samples/";
  const [query, setQuery] = useState(d.query || "");
  const [from, setFrom] = useState(d.date_from || "");
  const [to, setTo] = useState(d.date_to || "");
  const update = (changes: Record<string, string> = {}) => {
    const params = new URLSearchParams({
      return_to: back || "",
      q: query,
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
    d.query ||
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
          back={back ? { href: back, label: backLabel(back) } : undefined}
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
          <VStack gap={4} data-tour="samples-overview">
            {page.role !== "WAREHOUSE" && (
              <TabList
                aria-label="Status pengajuan sampel"
                value={d.selected_status || ""}
                onChange={(status) => update({ status, page: "1" })}
                hasDivider
              >
                <Tab value="" label="Semua" />
                {[
                  "SUBMITTED",
                  "DRAFT",
                  "APPROVED",
                  "REJECTED",
                  "CANCELLED",
                ].map((status) => (
                  <Tab
                    key={status}
                    value={status}
                    label={`${requestLabels[status]} (${d.status_counts[status] || 0})`}
                  />
                ))}
              </TabList>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                update({ page: "1" });
              }}
            >
              <FilterRow>
                <StackItem size="fill">
                  <TextInput
                    label="Cari pengajuan"
                    placeholder="Nomor pengajuan atau nama pelanggan"
                    startIcon="search"
                    width="100%"
                    value={query}
                    onChange={setQuery}
                  />
                </StackItem>
                <Button
                  type="submit"
                  variant="secondary"
                  label="Cari"
                  isLoading={refreshing}
                  isDisabled={busy}
                />
              </FilterRow>
            </form>
            <Collapsible
              trigger="Filter lanjutan"
              defaultIsOpen={
                !!(
                  d.selected_customer ||
                  d.selected_sales ||
                  from ||
                  to ||
                  d.selected_fulfillment
                )
              }
            >
              <VStack gap={3}>
                <FilterRow>
                  <Selector
                    label="Pemenuhan"
                    width="12rem"
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
                      width="12rem"
                      value={d.selected_sales || ""}
                      options={[
                        { value: "", label: "Semua sales" },
                        ...d.sales_options,
                      ]}
                      onChange={(sales) => update({ sales, page: "1" })}
                    />
                  )}
                </FilterRow>
                <FilterRow>
                  <StackItem>
                    <DateInput
                      placeholder="Pilih tanggal"
                      label="Dibuat mulai"
                      value={(from || undefined) as ISODateString | undefined}
                      onChange={(value) => setFrom(value || "")}
                      hasClear
                      format="system_date"
                    />
                  </StackItem>
                  <StackItem>
                    <DateInput
                      placeholder="Pilih tanggal"
                      label="Sampai"
                      value={(to || undefined) as ISODateString | undefined}
                      onChange={(value) => setTo(value || "")}
                      hasClear
                      format="system_date"
                    />
                  </StackItem>
                  <Button
                    variant="secondary"
                    label="Terapkan periode"
                    onClick={() => update({ page: "1" })}
                    isLoading={refreshing}
                    isDisabled={busy}
                  />
                </FilterRow>
              </VStack>
            </Collapsible>
            {d.date_error && <Banner status="warning" title={d.date_error} />}
            <ResultsSummary reset={filtered ? { href: resetUrl } : undefined}>
              {quantity(d.total)} pengajuan
            </ResultsSummary>
            <DataTable
              rows={d.samples}
              empty={
                <Empty
                  kind={filtered ? "search" : "empty"}
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
                  action={
                    !filtered && page.role !== "WAREHOUSE" ? (
                      <Button
                        label="Ajukan sampel"
                        href={withReturn("/samples/new/", page.url)}
                        variant="primary"
                      />
                    ) : undefined
                  }
                />
              }
              columns={[
                {
                  key: "number",
                  width: proportional(1, { minWidth: 96 }),
                  header: "Nomor",
                  renderCell: (row) => (
                    <VStack gap={1}>
                      <Link
                        data-tour="sample-record"
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
                  width: proportional(1.8, { minWidth: 170 }),
                  header: "Pelanggan",
                  renderCell: (row) => (
                    <VStack gap={1}>
                      <RecordIdentity
                        name={row.customer.name}
                        company
                        supporting={row.customer.code}
                      />
                    </VStack>
                  ),
                },
                ...(page.role === "SALES"
                  ? []
                  : [
                      {
                        key: "sales",
                        header: "Sales",
                        renderCell: (row: Row) => <Text>{row.sales.name}</Text>,
                      },
                    ]),
                {
                  key: "created_at",
                  header: "Dibuat",
                  renderCell: (row) => <Text>{dateLabel(row.created_at)}</Text>,
                },
                {
                  key: "status",
                  width: proportional(1.6, { minWidth: 170 }),
                  header: "Tahap saat ini",
                  renderCell: (row) => {
                    const stage = sampleStage(
                      {
                        status: row.status,
                        fulfillment_status: row.fulfillment_status,
                        outcome: row.outcome,
                      },
                      page.role || "",
                    );
                    return <Status value={stage.value} label={stage.label} />;
                  },
                },
                {
                  key: "action",
                  width: proportional(1.4, { minWidth: 140 }),
                  header: "Tindakan",
                  renderCell: (row) => (
                    <Button
                      size="sm"
                      label={
                        page.role === "MANAGER" && row.status === "SUBMITTED"
                          ? "Tinjau pengajuan"
                          : page.role === "WAREHOUSE" &&
                              row.fulfillment_status === "WAITING"
                            ? "Siapkan sampel"
                            : row.status === "APPROVED" &&
                                row.fulfillment_status === "RECEIVED" &&
                                page.role !== "WAREHOUSE"
                              ? "Buka evaluasi"
                              : row.status === "DRAFT"
                                ? "Buka draf"
                                : "Lihat detail"
                      }
                      href={withReturn(`/samples/${row.id}/`, page.url)}
                    />
                  ),
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
