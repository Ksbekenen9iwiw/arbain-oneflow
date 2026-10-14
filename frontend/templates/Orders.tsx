import { MotionStack } from "../motion";
import { RecordIdentity } from "../RecordIdentity";
import { ProductIdentity } from "../ProductIdentity";
import { withReturn } from "../navigation";
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Adapted from Astryx 0.7.0 table-page: one toolbar and one filtered table.
import { useState } from "react";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { DateInput } from "@astryxdesign/core/DateInput";
import type { ISODateString } from "@astryxdesign/core/Calendar";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import {
  Table,
  proportional,
  useTableSortable,
  useTableRowExpansion,
  type TableSortState,
  type TableColumn,
} from "@astryxdesign/core/Table";
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
  dateLabel,
  money,
  quantity,
} from "../ui";
import { useApp } from "../router";
import type { Row } from "../types";
export const orderLabels: Record<string, string> = {
  DRAFT: "Draft",
  CONFIRMED: "Menunggu pengiriman",
  SHIPPED: "Terkirim",
  CANCELLED: "Dibatalkan",
};
export const orderContext = withReturn;
export default function Orders() {
  const { page, navigate, busy } = useApp();
  const d = page.data;
  const [query, setQuery] = useState(d.query);
  const [from, setFrom] = useState(d.date_from_input || ""),
    [to, setTo] = useState(d.date_to_input || "");
  const manager = page.role === "MANAGER",
    warehouse = page.role === "WAREHOUSE",
    shipped = d.selected_status === "SHIPPED";
  const update = (changes: Record<string, string> = {}) => {
    const params = new URLSearchParams({
      q: query,
      sales: d.selected_sales,
      status: d.selected_status,
      sort: d.selected_sort,
      shipped_from: from,
      shipped_to: to,
      ...changes,
    });
    if (params.get("status") !== "SHIPPED") {
      params.delete("shipped_from");
      params.delete("shipped_to");
    }
    for (const [key, value] of [...params]) if (!value) params.delete(key);
    void navigate("/orders/" + (params.size ? "?" + params : ""));
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
        sort:
          (next[0]?.direction === "descending" ? "-" : "") +
          (next[0]?.sortKey || "created_at"),
      }),
  });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const expansion = useTableRowExpansion<Row>({
    expandedKeys: expanded,
    onToggle: (key) =>
      setExpanded((current) => (current.has(key) ? new Set() : new Set([key]))),
    getRowKey: (r) => r.id,
    panelVariant: "muted",
    renderExpanded: (r) => (
      <MotionStack preset="expand" gap={4} padding={4}>
        <HStack hAlign="between" vAlign="center">
          <Text weight="semibold">Produk pesanan · {r.items.length}</Text>
          <Button
            label="Detail pesanan"
            size="sm"
            variant="secondary"
            href={orderContext(`/orders/${r.id}/`, page.url)}
          />
        </HStack>
        <Table
          data={r.items}
          idKey="id"
          density="compact"
          textOverflow="wrap"
          columns={[
            {
              key: "name",
              header: "Produk",
              width: proportional(3),
              renderCell: (item: Row) => (
                <ProductIdentity sku={item.sku} name={item.name} size="compact">
                  <VStack gap={1}>
                    <Text>{item.name}</Text>
                    <Text type="supporting">{item.sku}</Text>
                  </VStack>
                </ProductIdentity>
              ),
            },
            {
              key: "quantity",
              header: "Jumlah",
              align: "end",
              width: proportional(1),
              renderCell: (item: Row) => (
                <Text hasTabularNumbers>
                  {quantity(item.quantity)} {item.unit}
                </Text>
              ),
            },
            {
              key: "price",
              header: "Harga satuan",
              align: "end",
              width: proportional(1),
              renderCell: (item: Row) => (
                <Text hasTabularNumbers>{money(item.price)}</Text>
              ),
            },
            {
              key: "subtotal",
              header: "Subtotal",
              align: "end",
              width: proportional(1),
              renderCell: (item: Row) => (
                <Text hasTabularNumbers>{money(item.subtotal)}</Text>
              ),
            },
          ]}
        />
        {r.status === "CANCELLED" && r.cancel_reason && (
          <Text type="supporting">Alasan pembatalan: {r.cancel_reason}</Text>
        )}
      </MotionStack>
    ),
  });
  const dateKey = shipped ? "shipped_at" : "created_at";
  const columns: TableColumn<Row>[] = [
    {
      key: "number",
      header: "Pesanan",
      sortable: true,
      width: proportional(1),
      renderCell: (r) => (
        <VStack gap={1}>
          <Link
            data-tour="order-record"
            weight="semibold"
            href={orderContext(`/orders/${r.id}/`, page.url)}
          >
            {r.number}
          </Link>
          <Text type="supporting">{r.items.length} produk</Text>
        </VStack>
      ),
    },
    {
      key: "customer",
      header: "Pelanggan",
      width: proportional(1.8),
      renderCell: (r) => <Text>{r.customer.name}</Text>,
    },
    {
      key: dateKey,
      header: shipped ? "Tanggal pengiriman" : "Tanggal dibuat",
      sortable: true,
      width: proportional(1.25),
      renderCell: (r) => <Text color="secondary">{dateLabel(r[dateKey])}</Text>,
    },
    {
      key: "status",
      header: "Status",
      width: proportional(1.6),
      renderCell: (r) => (
        <Status value={r.status} label={orderLabels[r.status]} />
      ),
    },
    ...(manager
      ? [
          {
            key: "sales",
            header: "Sales",
            width: proportional(1.1),
            renderCell: (r: Row) => <RecordIdentity name={r.sales.name} />,
          },
        ]
      : []),
    {
      key: "total",
      header: "Total",
      sortable: true,
      align: "end",
      width: proportional(1.1),
      renderCell: (r) => <Text hasTabularNumbers>{money(r.total)}</Text>,
    },
  ];
  const filtered =
    d.query || d.selected_status || d.selected_sales || from || to;
  return (
    <Layout
      height="fill"
      header={
        <PageHeader
          title="Pesanan"
          description={
            warehouse
              ? "Pesanan yang menunggu pengiriman dan riwayat terkirim."
              : "Pantau pesanan dari draft hingga terkirim."
          }
          actions={
            !warehouse && (
              <Button
                label="Buat pesanan"
                variant="primary"
                href={orderContext("/orders/new/", page.url)}
              />
            )
          }
        />
      }
      content={
        <LayoutContent padding={6} data-oneflow-scroll>
          <VStack gap={4}>
            <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
              <TabList
                aria-label="Status pesanan"
                value={d.selected_status || "all"}
                onChange={(v) =>
                  update({
                    status: v === "all" ? "" : v,
                    sort: v === "SHIPPED" ? "-shipped_at" : "-created_at",
                    shipped_from: "",
                    shipped_to: "",
                  })
                }
              >
                <Tab value="all" label={`Semua (${d.status_counts.all})`} />
                {d.allowed_statuses.map((s: string) => (
                  <Tab
                    key={s}
                    value={s}
                    label={`${orderLabels[s]} (${d.status_counts[s]})`}
                  />
                ))}
              </TabList>
              {(filtered ||
                d.selected_sort !==
                  (shipped ? "-shipped_at" : "-created_at")) && (
                <Button
                  href="/orders/"
                  label="Reset filter"
                  variant="secondary"
                />
              )}
            </HStack>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                update();
              }}
            >
              <VStack gap={3}>
                <HStack gap={3} vAlign="end">
                  <StackItem size="fill">
                    <TextInput
                      isLabelHidden
                      label="Cari pesanan"
                      startIcon="search"
                      placeholder="Nomor pesanan atau nama pelanggan"
                      value={query}
                      onChange={setQuery}
                      width="100%"
                    />
                  </StackItem>
                  {manager && (
                    <Selector
                      label="Sales"
                      width="14rem"
                      value={d.selected_sales}
                      options={[
                        { value: "", label: "Semua sales" },
                        ...d.sales_options,
                      ]}
                      onChange={(sales) => update({ sales })}
                    />
                  )}
                  <Button label="Cari" type="submit" isLoading={busy} />
                </HStack>
                {shipped && (
                  <HStack gap={3} vAlign="end" wrap="wrap">
                    <StackItem>
                      <DateInput
                        label="Dikirim mulai"
                        value={(from || undefined) as ISODateString | undefined}
                        onChange={(v) => setFrom(v || "")}
                        hasClear
                        format="system_date"
                        placeholder="Semua tanggal"
                      />
                    </StackItem>
                    <StackItem>
                      <DateInput
                        label="Sampai"
                        value={(to || undefined) as ISODateString | undefined}
                        onChange={(v) => setTo(v || "")}
                        hasClear
                        format="system_date"
                        placeholder="Pilih tanggal"
                      />
                    </StackItem>
                    <Button
                      label="Terapkan periode"
                      type="submit"
                      isDisabled={busy}
                    />
                    {(from || to) && (
                      <Button
                        label="Hapus periode"
                        variant="secondary"
                        onClick={() =>
                          update({ shipped_from: "", shipped_to: "" })
                        }
                      />
                    )}
                  </HStack>
                )}
              </VStack>
            </form>

            {d.date_error && <Banner status="warning" title={d.date_error} />}
            <Text type="supporting">
              {d.orders.length} pesanan
              {d.shipped_from
                ? ` · Dikirim ${dateLabel(d.shipped_from)}–${dateLabel(d.shipped_to)} (WIB)`
                : ""}
            </Text>
            {d.orders.length ? (
              <Table
                data={d.orders}
                idKey="id"
                columns={columns}
                plugins={{ sort: sorting, expansion }}
                density="compact"
                hasHover
                textOverflow="wrap"
              />
            ) : (
              <Empty
                title={
                  filtered
                    ? "Tidak ada pesanan yang cocok"
                    : "Belum ada pesanan"
                }
                description={
                  filtered
                    ? "Ubah pencarian atau reset filter untuk melihat pesanan lain."
                    : warehouse
                      ? "Pesanan akan tampil setelah dikonfirmasi oleh sales atau manajer."
                      : "Buat draft untuk mulai menyiapkan pesanan pelanggan."
                }
                action={
                  filtered ? (
                    <Button href="/orders/" label="Reset filter" />
                  ) : !warehouse ? (
                    <Button
                      href={orderContext("/orders/new/", page.url)}
                      label="Buat pesanan"
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
