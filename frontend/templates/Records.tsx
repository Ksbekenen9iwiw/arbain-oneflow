// Copyright (c) Meta Platforms, Inc. and affiliates.
// Adapted from Astryx 0.7.0 table-page: header, scoped search and full-width data rows.
import { useState, type ReactNode } from "react";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { proportional, type TableColumn } from "@astryxdesign/core/Table";
import {
  VStack,
  StackItem,
  HStack,
  Text,
  Button,
  Link,
  DataTable,
  Status,
  Empty,
  PageHeader,
  money,
  quantity,
  dateLabel,
  Banner,
  Heading,
} from "../ui";
import { withReturn } from "../navigation";
import { useApp } from "../router";
import type { Row } from "../types";
export function OrderTable({
  rows,
  showCustomer = true,
  actionLabel,
  empty,
}: {
  rows: Row[];
  showCustomer?: boolean;
  actionLabel?: string;
  empty?: ReactNode;
}) {
  const { page } = useApp();
  return (
    <DataTable
      rows={rows}
      columns={[
        {
          key: "number",
          sortable: true,
          header: "Pesanan",
          renderCell: (r) => (
            <Link
              href={withReturn("/orders/" + r.id + "/", page.url)}
              weight="semibold"
            >
              {r.number}
            </Link>
          ),
        },
        ...(showCustomer
          ? [
              {
                key: "customer",
                header: "Pelanggan",
                width: proportional(2),
                renderCell: (r: Row) =>
                  page.role === "WAREHOUSE" ? (
                    <Text>{r.customer.name}</Text>
                  ) : (
                    <Link
                      href={withReturn(
                        `/customers/${r.customer.id}/?tab=orders`,
                        page.url,
                      )}
                    >
                      {r.customer.name}
                    </Link>
                  ),
              },
            ]
          : []),
        {
          key: "created_at",
          sortable: true,
          header: "Tanggal",
          renderCell: (r) => (
            <Text color="secondary">{dateLabel(r.created_at)}</Text>
          ),
        },
        {
          key: "status",
          header: "Status",
          renderCell: (r) => <Status value={r.status} />,
        },
        {
          key: "total",
          sortable: true,
          header: "Nilai pesanan",
          align: "end",
          renderCell: (r) => <Text hasTabularNumbers>{money(r.total)}</Text>,
        },
        ...(actionLabel
          ? [
              {
                key: "action",
                header: "Tindakan",
                renderCell: (r: Row) => (
                  <Button
                    label={actionLabel}
                    size="sm"
                    variant="secondary"
                    href={withReturn(`/orders/${r.id}/`, page.url)}
                  />
                ),
              },
            ]
          : []),
      ]}
      empty={
        empty || (
          <Empty
            title="Belum ada pesanan"
            description="Pesanan yang sesuai akan tampil di sini."
          />
        )
      }
    />
  );
}
export default function Records() {
  const { page, navigate, busy, refreshing } = useApp();
  const d = page.data,
    screen = page.screen,
    canManage = page.role !== "SALES";
  const [query, setQuery] = useState(d.query || "");
  const [scope, setScope] = useState(d.selected_status || d.stock_filter || "");
  const isOrders = screen === "orders",
    isStock = screen === "stock";
  const title = isOrders ? "Pesanan" : isStock ? "Produk & stok" : "Pelanggan";
  const allRows: Row[] = isOrders
    ? d.orders
    : isStock
      ? d.products
      : d.customers;
  const [owner, setOwner] = useState(d.selected_sales || "");
  const owners = Array.from(
    new Map(
      allRows
        .map((r) => r.owner || r.sales)
        .filter(Boolean)
        .map((r) => [r.id, r]),
    ).values(),
  );
  const rows = owner
    ? allRows.filter((r) => (r.owner || r.sales)?.id === owner)
    : allRows;
  const choices = isOrders
    ? [
        { value: "", label: "Semua status" },
        { value: "DRAFT", label: "Draft" },
        { value: "CONFIRMED", label: "Dikonfirmasi" },
        { value: "SHIPPED", label: "Terkirim" },
        { value: "CANCELLED", label: "Dibatalkan" },
      ]
    : [
        { value: "", label: "Semua produk" },
        { value: "low", label: "Stok menipis" },
        { value: "conflict", label: "Konflik stok" },
      ];
  const search = (newScope = scope, newOwner = owner) => {
    const q = new URLSearchParams();
    if (isOrders && newOwner) q.set("sales", newOwner);
    if (isOrders && newScope === "SHIPPED" && d.shipped_from && d.shipped_to) {
      q.set("shipped_from", d.shipped_from);
      q.set("shipped_to", d.shipped_to);
    }
    if (query) q.set("q", query);
    if (newScope) q.set(isOrders ? "status" : "filter", newScope);
    void navigate(
      (isOrders ? "/orders/" : isStock ? "/stock/" : "/customers/") +
        (q.size ? "?" + q : ""),
    );
  };
  const columns: TableColumn<Row>[] = isStock
    ? [
        {
          key: "name",
          sortable: true,
          header: "Produk",
          width: proportional(2),
          renderCell: (r) => (
            <VStack gap={1}>
              <Text weight="medium">{r.name}</Text>
              <Text type="supporting">
                {r.sku} · per {r.unit}
              </Text>
            </VStack>
          ),
        },
        {
          key: "price",
          sortable: true,
          width: proportional(1.5),
          header: "Harga satuan",
          align: "end",
          renderCell: (r) => <Text hasTabularNumbers>{money(r.price)}</Text>,
        },
        ...(canManage
          ? [
              {
                key: "on_hand",
                sortable: true,
                width: proportional(0.75, { minWidth: 72 }),
                header: "Fisik",
                align: "end" as const,
                renderCell: (r: Row) => (
                  <Text hasTabularNumbers>{quantity(r.on_hand)}</Text>
                ),
              },
              {
                key: "reserved",
                sortable: true,
                header: "Reservasi",
                align: "end" as const,
                renderCell: (r: Row) => (
                  <Text hasTabularNumbers>{quantity(r.reserved)}</Text>
                ),
              },
            ]
          : []),
        {
          key: "available",
          sortable: true,
          header: "Tersedia",
          align: "end",
          renderCell: (r) => (
            <Text weight="semibold" hasTabularNumbers>
              {quantity(r.available)}
            </Text>
          ),
        },
        {
          key: "state",
          header: "Kondisi",
          renderCell: (r) => (
            <Status
              value={
                BigInt(r.available) < 0
                  ? "STOCK_CONFLICT"
                  : !r.is_active
                    ? "DRAFT"
                    : BigInt(r.available) === 0n
                      ? "STOCK_EMPTY"
                      : BigInt(r.available) < BigInt(r.min_stock)
                        ? "STOCK_LOW"
                        : "STOCK_READY"
              }
              label={
                BigInt(r.available) < 0
                  ? "Konflik stok"
                  : !r.is_active
                    ? "Nonaktif"
                    : BigInt(r.available) === 0n
                      ? "Stok bebas habis"
                      : BigInt(r.available) < BigInt(r.min_stock)
                        ? "Menipis"
                        : "Tersedia"
              }
            />
          ),
        },
        ...(canManage
          ? [
              {
                key: "actions",
                header: "Tindakan",
                width: proportional(2),
                renderCell: (r: Row) => (
                  <HStack gap={3} wrap="wrap">
                    <Link href={"/stock/" + r.id + "/receive/"}>
                      Barang masuk
                    </Link>
                    <Link href={"/stock/" + r.id + "/reconcile/"}>Koreksi</Link>
                    <Link href={"/products/" + r.id + "/edit/"}>Edit</Link>
                  </HStack>
                ),
              },
            ]
          : []),
      ]
    : [
        {
          key: "name",
          sortable: true,
          header: "Pelanggan",
          width: proportional(2),
          renderCell: (r) => (
            <VStack gap={1}>
              <Link href={"/customers/" + r.id + "/"} weight="semibold">
                {r.name}
              </Link>
              <Text type="supporting">{r.code}</Text>
            </VStack>
          ),
        },
        {
          key: "phone",
          header: "Kontak",
          renderCell: (r) => <Text>{r.phone || "Belum diisi"}</Text>,
        },
        {
          key: "owner",
          header: "Penanggung jawab",
          width: proportional(2),
          renderCell: (r) => <Text>{r.owner.name}</Text>,
        },
        {
          key: "is_active",
          header: "Status",
          renderCell: (r) => (
            <Status
              value={r.is_active ? "READY" : "DRAFT"}
              label={r.is_active ? "Aktif" : "Nonaktif"}
            />
          ),
        },
      ];
  return (
    <Layout
      height="fill"
      header={
        <PageHeader
          title={title}
          description={
            isOrders
              ? "Dari draft hingga barang terkirim."
              : isStock
                ? "Ketersediaan produk untuk pesanan dan pengiriman."
                : "Kelola hubungan dan tindak lanjut pelanggan."
          }
          actions={
            (isStock ? canManage : page.role !== "WAREHOUSE") ? (
              <Button
                label={
                  isStock
                    ? "Tambah produk"
                    : isOrders
                      ? "Buat pesanan"
                      : "Tambah pelanggan"
                }
                variant="primary"
                href={
                  isStock
                    ? "/products/new/"
                    : isOrders
                      ? "/orders/new/"
                      : "/customers/new/"
                }
              />
            ) : undefined
          }
        />
      }
      content={
        <LayoutContent padding={6} data-oneflow-scroll>
          <VStack gap={6}>
            {isOrders && d.shipped_from && (
              <HStack hAlign="between">
                <Text type="supporting">
                  Tanggal pengiriman: {dateLabel(d.shipped_from)} –{" "}
                  {dateLabel(d.shipped_to)} (WIB)
                </Text>
                <Link
                  href={
                    "/orders/?" +
                    new URLSearchParams({
                      status: "SHIPPED",
                      ...(owner ? { sales: owner } : {}),
                    })
                  }
                >
                  Semua tanggal
                </Link>
              </HStack>
            )}
            {isStock && Number(d.stock_summary.conflict_count) > 0 && (
              <Banner
                status="error"
                title={`${d.stock_summary.conflict_count} produk memiliki konflik stok`}
                description="Stok fisik di bawah reservasi. Konfirmasi baru diblokir; koordinasikan stok sebelum melanjutkan."
              />
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                search();
              }}
            >
              <HStack gap={3} vAlign="end">
                <StackItem size="fill">
                  <TextInput
                    label="Cari"
                    value={query}
                    onChange={setQuery}
                    placeholder={
                      isOrders
                        ? "Nomor pesanan atau pelanggan"
                        : isStock
                          ? "Nama produk atau SKU"
                          : "Nama atau kode pelanggan"
                    }
                    width="100%"
                    startIcon="search"
                  />
                </StackItem>
                {(isOrders || isStock) && (
                  <Selector
                    label={isOrders ? "Status" : "Kondisi stok"}
                    options={choices}
                    value={scope}
                    onChange={(v) => {
                      setScope(v);
                      search(v);
                    }}
                    width="16rem"
                  />
                )}
                <StackItem>
                  <Button
                    type="submit"
                    label="Cari"
                    isLoading={refreshing}
                    isDisabled={busy}
                  />
                </StackItem>
                {(d.query || scope) && (
                  <Button
                    label="Reset"
                    variant="ghost"
                    href={
                      isOrders
                        ? "/orders/"
                        : isStock
                          ? "/stock/"
                          : "/customers/"
                    }
                  />
                )}
              </HStack>
            </form>
            <HStack hAlign="between" vAlign="center" gap={3}>
              <Text type="supporting">
                {rows.length}{" "}
                {isOrders ? "pesanan" : isStock ? "produk" : "pelanggan"} · klik
                judul kolom untuk mengurutkan
              </Text>
              {page.role === "MANAGER" &&
                !isStock &&
                (isOrders ? d.sales_options.length > 0 : owners.length > 1) && (
                  <Selector
                    label="Penanggung jawab"
                    value={owner}
                    onChange={(v) => {
                      setOwner(v);
                      if (isOrders) search(scope, v);
                    }}
                    width="16rem"
                    options={[
                      { value: "", label: "Semua sales" },
                      ...(isOrders
                        ? d.sales_options
                        : owners.map((r) => ({ value: r.id, label: r.name }))),
                    ]}
                  />
                )}
            </HStack>
            {isOrders ? (
              <OrderTable
                rows={rows}
                empty={
                  d.query || scope || owner ? (
                    <Empty
                      title="Tidak ada pesanan yang cocok"
                      description="Ubah kata kunci atau hapus filter untuk melihat pesanan lain."
                      action={<Button href="/orders/" label="Hapus filter" />}
                    />
                  ) : undefined
                }
              />
            ) : (
              <DataTable
                rows={rows}
                columns={columns}
                empty={
                  <Empty
                    title="Tidak ada hasil"
                    description="Coba kata kunci atau filter lain."
                    action={
                      d.query || scope ? (
                        <Button
                          href={isStock ? "/stock/" : "/customers/"}
                          label="Hapus filter"
                        />
                      ) : undefined
                    }
                  />
                }
              />
            )}
            {isStock && canManage && (
              <VStack gap={4}>
                <Heading level={2}>Mutasi terbaru</Heading>
                <Text color="secondary">
                  30 mutasi terakhir · tersedia = fisik − direservasi
                </Text>
                <DataTable
                  rows={d.movements}
                  columns={[
                    {
                      key: "created_at",
                      sortable: true,
                      header: "Waktu",
                      renderCell: (r) => (
                        <Text>{dateLabel(r.created_at, true)}</Text>
                      ),
                    },
                    {
                      key: "product",
                      header: "Produk",
                      renderCell: (r) => <Text>{r.product.name}</Text>,
                    },
                    { key: "kind", header: "Mutasi" },
                    {
                      key: "delta",
                      header: "Perubahan",
                      align: "end",
                      renderCell: (r) => (
                        <Text hasTabularNumbers>
                          {BigInt(r.delta) > 0 ? "+" : ""}
                          {quantity(r.delta)}
                        </Text>
                      ),
                    },
                    { key: "reason", header: "Alasan" },
                    {
                      key: "actor",
                      header: "Oleh",
                      renderCell: (r) => <Text>{r.actor.name}</Text>,
                    },
                  ]}
                />
              </VStack>
            )}
          </VStack>
        </LayoutContent>
      }
    />
  );
}
