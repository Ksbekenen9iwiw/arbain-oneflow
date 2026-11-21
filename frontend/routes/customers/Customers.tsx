import { Collapsible } from "@/kit";
import { RecordIdentity } from "../../RecordIdentity";
import { withReturn, listReturn, backLabel } from "../../navigation";
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Adapted from Astryx 0.7.0 table-page: unified toolbar, scoped tabs, full-width table.
import { useState } from "react";
import { Layout, LayoutContent } from "@/kit";
import { TextInput } from "@/kit";
import { Selector } from "@/kit";
import { TabList, Tab } from "@/kit";
import {
  proportional,
  useTableSortable,
  type TableSortState,
  type TableColumn,
} from "@/kit";
import {
  tablePresentation,
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
  dateLabel,
  Status,
  useResponsive,
  useSearchInput,
  resetLabel,
  Table,
} from "../../ui";
import { useApp } from "../../router";
import type { Row } from "../../types";
export const customerContext = withReturn;
export default function Customers() {
  const { page, navigate, revision } = useApp();
  const { contentPadding } = useResponsive();
  const d = page.data;
  const back = listReturn(page.url);
  const manager = page.role === "MANAGER";
  const update = (changes: Record<string, string>, nextQuery = query) => {
    const params = new URLSearchParams({
      return_to: back || "",
      q: nextQuery,
      sales: d.selected_sales,
      status: d.selected_status,
      view: d.selected_view,
      sort: d.selected_sort,
      ...changes,
    });
    for (const [key, value] of [...params])
      if (!value || (key === "sort" && value === "next_due")) params.delete(key);
    void navigate(
      "/customers/" + (params.size ? "?" + params : ""),
      false,
      "view" in changes ? { selected_view: changes.view } : undefined,
    );
  };
  const [query, setQuery] = useSearchInput(
    d.query || "",
    revision,
    (nextQuery) => update({ q: nextQuery }, nextQuery),
  );
  const sort: TableSortState = [
    {
      sortKey: d.selected_sort.replace("-", ""),
      direction: d.selected_sort.startsWith("-") ? "descending" : "ascending",
    },
  ];
  const sorting = useTableSortable({
    sort,
    allowUnsortedState: false,
    onSortChange: (next) =>
      update({
        sort: next.length
          ? (next[0].direction === "descending" ? "-" : "") + next[0].sortKey
          : "next_due",
      }),
  });
  const columns: TableColumn<Row>[] = [
    {
      key: "name",
      header: "Pelanggan",
      sortable: true,
      width: proportional(2.5),
      renderCell: (r) => (
        <RecordIdentity
          name={r.name}
          company
          supporting={`${r.source_pending ? "Outlet dari laporan" : r.code}${r.phone ? ` · ${r.phone}` : ""}${r.source_pending ? " · Perlu verifikasi" : !r.is_active ? " · Nonaktif" : ""}`}
        >
          <Link
            data-tour="customer-record"
            weight="semibold"
            href={customerContext(`/customers/${r.id}/`, page.url)}
          >
            {r.name}
          </Link>
        </RecordIdentity>
      ),
    },
    {
      key: "next_due",
      header: "Aktivitas berikutnya",
      sortable: true,
      width: proportional(1.4),
      renderCell: (r) => {
        const next = r.summary.next_activity;
        return next ? (
          <VStack gap={1}>
            <Text>{next.kind}</Text>
            <Text type="supporting" hasTabularNumbers>
              {next.due ? dateLabel(next.due) : "Belum dijadwalkan"}
            </Text>
          </VStack>
        ) : (
          <Text color="secondary">Tidak ada aktivitas terbuka</Text>
        );
      },
    },
    {
      key: "activity_status",
      header: "Status",
      width: proportional(1.2),
      renderCell: (r) => {
        const next = r.summary.next_activity;
        if (!next) return <Text color="secondary">—</Text>;
        if (Number(r.summary.overdue_count) > 0) {
          return (
            <Status
              value="OVERDUE"
              label={`${r.summary.overdue_count} terlambat`}
            />
          );
        }
        if (next.due === page.today) {
          return <Status value="DUE_TODAY" />;
        }
        return <Status value="PLANNED" label="Terjadwal" />;
      },
    },
    {
      key: "stage",
      header: "Tahap terakhir",
      width: proportional(1.5),
      renderCell: (r) => (
        <VStack gap={1}>
          <Text>{r.summary.latest_stage || "Belum ada aktivitas"}</Text>
          {r.summary.latest_recorded_at && (
            <Text type="supporting">
              {dateLabel(r.summary.latest_recorded_at)}
            </Text>
          )}
        </VStack>
      ),
    },
    ...(manager
      ? [
          {
            key: "owner",
            header: "Sales",
            width: proportional(1.25),
            renderCell: (r: Row) => <RecordIdentity name={r.owner.name} />,
          },
        ]
      : []),
    {
      key: "action",
      header: "Tindakan",
      width: proportional(1.1),
      align: "end",
      renderCell: (r) => {
        const next = r.summary.next_activity;
        return next && next.due && next.due <= page.today ? (
          <Button
            size="sm"
            variant="secondary"
            label="Catat hasil"
            href={customerContext(
              `/activities/${next.id}/complete/`,
              page.url,
            )}
          />
        ) : null;
      },
    },
  ];
  const filtered = Boolean(d.query || d.selected_sales || d.selected_status);
  return (
    <Layout
      height="fill"
      header={
        <PageHeader
          back={back ? { href: back, label: backLabel(back) } : undefined}
          title="Pelanggan" 
          actions={
            <Button
              variant="primary"
              label="Tambah pelanggan"
              href={customerContext("/customers/new/", page.url)}
            />
          }
        />
      }
      content={
        <LayoutContent padding={contentPadding} data-oneflow-scroll>
          <VStack gap={4} className="oneflow-tablecard">
            <TabList
              hasDivider
              aria-label="Prioritas pelanggan"
              value={d.selected_view || "all"}
              onChange={(v) => update({ view: v === "all" ? "" : v })}
            >
              <Tab value="all" label={`Semua (${d.view_counts.all})`} />
              <Tab
                value="overdue"
                label={`Terlambat (${d.view_counts.overdue})`}
              />
              <Tab value="today" label={`Hari ini (${d.view_counts.today})`} />
            </TabList>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                update({});
              }}
            >
              <FilterRow>
                <StackItem size="fill" style={{ minWidth: "14rem" }}>
                  <TextInput
                    label="Cari pelanggan"
                    value={query}
                    onChange={setQuery}
                    placeholder="Nama, kode, atau nomor telepon"
                    startIcon="search"
                    hasClear
                    width="100%"
                  />
                </StackItem>
              </FilterRow>
              <Collapsible
                trigger={
                  d.selected_sales || d.selected_status
                    ? "Filter · aktif"
                    : "Filter"
                }
                defaultIsOpen={Boolean(d.selected_sales || d.selected_status)}
              >
                <FilterRow>
                  {manager && (
                    <Selector
                      label="Sales"
                      width="12rem"
                      value={d.selected_sales}
                      options={[
                        { value: "", label: "Semua sales" },
                        ...d.sales_options,
                      ]}
                      onChange={(v) => update({ sales: v })}
                    />
                  )}
                  <Selector
                    label="Status pelanggan"
                    width="12rem"
                    value={d.selected_status}
                    options={[
                      { value: "", label: "Semua status" },
                      { value: "active", label: "Aktif" },
                      { value: "inactive", label: "Nonaktif" },
                      { value: "pending", label: "Perlu verifikasi" },
                    ]}
                    onChange={(v) => update({ status: v })}
                  />
                </FilterRow>
              </Collapsible>
            </form>

            <ResultsSummary
              reset={
                filtered || d.selected_sort !== "next_due"
                  ? {
                      label: resetLabel(
                        d.query,
                        d.selected_sales ||
                          d.selected_status ||
                          d.selected_sort !== "next_due",
                      ),
                      onClick: () => {
                        setQuery("");
                        update(
                          { q: "", sales: "", status: "", sort: "next_due" },
                          "",
                        );
                      },
                    }
                  : undefined
              }
            >
              {d.customers.length} pelanggan
              {d.selected_view === "overdue"
                ? " dengan aktivitas melewati jadwal"
                : d.selected_view === "today"
                  ? " dengan aktivitas terjadwal hari ini"
                  : ""}
            </ResultsSummary>
            {d.customers.length ? (
              <Table
                {...tablePresentation}
                data={d.customers}
                columns={columns}
                plugins={{ sort: sorting }}
                idKey="id"
              />
            ) : (
              <Empty
                kind={filtered ? "search" : "empty"}
                title={
                  filtered
                    ? "Tidak ada pelanggan yang cocok"
                    : "Belum ada pelanggan"
                }
                description={
                  filtered
                    ? "Ubah pencarian atau reset filter untuk melihat pelanggan lain."
                    : "Tambahkan pelanggan pertama untuk mulai mencatat aktivitas dan pesanan."
                }
                action={
                  !filtered ? (
                    <Button
                      href={customerContext("/customers/new/", page.url)}
                      label="Tambah pelanggan"
                    />
                  ) : undefined
                }
              />
            )}
          </VStack>
        </LayoutContent>
      }
    />
  );
}
