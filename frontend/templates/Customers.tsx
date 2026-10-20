import { RecordIdentity } from "../RecordIdentity";
import { withReturn, listReturn, backLabel } from "../navigation";
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Adapted from Astryx 0.7.0 table-page: unified toolbar, scoped tabs, full-width table.
import { useState } from "react";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import {
  Table,
  proportional,
  useTableSortable,
  type TableSortState,
  type TableColumn,
} from "@astryxdesign/core/Table";
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
} from "../ui";
import { useApp } from "../router";
import type { Row } from "../types";
export const customerContext = withReturn;
export default function Customers() {
  const { page, navigate, busy, refreshing } = useApp();
  const d = page.data;
  const back = listReturn(page.url);
  const resetUrl = back ? withReturn("/customers/", back) : "/customers/";
  const [query, setQuery] = useState(d.query);
  const manager = page.role === "MANAGER";
  const update = (changes: Record<string, string>) => {
    const params = new URLSearchParams({
      return_to: back || "",
      q: query,
      sales: d.selected_sales,
      status: d.selected_status,
      view: d.selected_view,
      sort: d.selected_sort,
      ...changes,
    });
    for (const [key, value] of [...params])
      if (!value || (key === "sort" && value === "name")) params.delete(key);
    void navigate("/customers/" + (params.size ? "?" + params : ""));
  };
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
          : "name",
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
          supporting={`${r.code}${r.phone ? ` · ${r.phone}` : ""}${!r.is_active ? " · Nonaktif" : ""}`}
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
      width: proportional(2),
      renderCell: (r) => {
        const next = r.summary.next_activity;
        return next ? (
          <VStack gap={1}>
            <Text>{next.kind}</Text>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Text type="supporting">
                {next.due ? dateLabel(next.due) : "Belum dijadwalkan"}
              </Text>
              {Number(r.summary.overdue_count) > 0 ? (
                <Status
                  value="OVERDUE"
                  label={`${r.summary.overdue_count} terlambat`}
                />
              ) : next.due === page.today ? (
                <Status value="DUE_TODAY" />
              ) : null}
            </HStack>
          </VStack>
        ) : (
          <Text color="secondary">Tidak ada aktivitas terbuka</Text>
        );
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
      renderCell: (r) => (
        <Button
          size="sm"
          variant="secondary"
          label={r.summary.next_activity ? "Catat hasil" : "Buka profil"}
          href={customerContext(
            r.summary.next_activity
              ? `/activities/${r.summary.next_activity.id}/complete/`
              : `/customers/${r.id}/`,
            page.url,
          )}
        />
      ),
    },
  ];
  const filtered =
    d.query || d.selected_sales || d.selected_status || d.selected_view;
  return (
    <Layout
      height="fill"
      header={
        <PageHeader
          back={back ? { href: back, label: backLabel(back) } : undefined}
          title="Pelanggan"
          description={
            manager
              ? "Hubungan pelanggan dan tindak lanjut tim."
              : "Pelanggan dan tindak lanjut yang menjadi tanggung jawab Anda."
          }
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
        <LayoutContent padding={6} data-oneflow-scroll>
          <VStack gap={4}>
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
                <StackItem size="fill">
                  <TextInput
                    label="Cari pelanggan"
                    value={query}
                    onChange={setQuery}
                    placeholder="Nama, kode, atau nomor telepon"
                    startIcon="search"
                    width="100%"
                  />
                </StackItem>
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
                  ]}
                  onChange={(v) => update({ status: v })}
                />
                <Button
                  type="submit"
                  variant="secondary"
                  label="Cari"
                  isLoading={refreshing}
                  isDisabled={busy}
                />
              </FilterRow>
            </form>

            <ResultsSummary
              reset={
                filtered || d.selected_sort !== "name"
                  ? { href: resetUrl }
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
