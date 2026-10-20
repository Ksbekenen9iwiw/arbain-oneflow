import SupplyPlanning from "./SupplyPlanning";
import { ProductIdentity } from "../ProductIdentity";
import { stockTabUrl, listReturn, backLabel, withReturn } from "../navigation";
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Keeps the Astryx table-page frame; separates products from paginated history.
import { useState } from "react";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { IconButton } from "@astryxdesign/core/IconButton";
import { EllipsisHorizontalIcon } from "@heroicons/react/24/outline";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { proportional, type TableColumn } from "@astryxdesign/core/Table";
import {
  ResultsSummary,
  FilterRow,
  VStack,
  HStack,
  StackItem,
  Text,
  Link,
  Button,
  PageHeader,
  Empty,
  Banner,
  money,
  quantity,
  Status,
} from "../ui";
import { useApp } from "../router";
import {
  ServerTable,
  StockCondition,
  MovementView,
  stockContext,
} from "./StockParts";
import type { Row } from "../types";
export default function Stock() {
  const { page, navigate, busy, refreshing } = useApp();
  const d = page.data,
    manage = page.role !== "SALES",
    history = d.selected_tab === "movements";
  const back = listReturn(page.url);
  const resetUrl = back ? withReturn("/stock/", back) : "/stock/";
  const [query, setQuery] = useState(d.query || "");
  const update = (changes: Record<string, string>) => {
    const params = new URLSearchParams(page.url.split("?")[1] || "");
    for (const [k, v] of Object.entries(changes))
      v ? params.set(k, v) : params.delete(k);
    void navigate("/stock/" + (params.size ? "?" + params : ""));
  };
  const filtered =
    d.query || d.stock_filter || d.selected_status || d.selected_sort !== "sku";
  const columns: TableColumn<Row>[] = [
    {
      key: "name",
      header: "Produk",
      sortable: true,
      width: proportional(2, { minWidth: 60 }),
      renderCell: (r) => (
        <ProductIdentity sku={r.sku} name={r.name} size="row">
          <VStack gap={1}>
            <Link
              data-tour="product-record"
              weight="medium"
              href={stockContext(`/products/${r.id}/`, page.url)}
            >
              {r.name}
            </Link>
            <Text type="supporting">
              {r.sku} · {r.unit}
              {!r.is_active ? " · Nonaktif" : ""}
            </Text>
          </VStack>
        </ProductIdentity>
      ),
    },
    {
      key: "price",
      header: "Harga satuan",
      sortable: true,
      align: "end",
      width: proportional(1.2, { minWidth: 60 }),
      renderCell: (r) => <Text hasTabularNumbers>{money(r.price)}</Text>,
    },
    ...(manage
      ? [
          {
            key: "on_hand",
            header: "Fisik",
            sortable: true,
            align: "end" as const,
            width: proportional(0.65, { minWidth: 60 }),
            renderCell: (r: Row) => (
              <Text hasTabularNumbers>{quantity(r.on_hand)}</Text>
            ),
          },
          {
            key: "reserved",
            header: "Reservasi",
            sortable: true,
            align: "end" as const,
            width: proportional(0.85, { minWidth: 60 }),
            renderCell: (r: Row) => (
              <Text hasTabularNumbers>{quantity(r.reserved)}</Text>
            ),
          },
        ]
      : []),
    {
      key: "available",
      header: "Stok bebas",
      sortable: true,
      align: "end",
      width: proportional(1, { minWidth: 60 }),
      renderCell: (r) => (
        <VStack gap={1}>
          <Text weight="semibold" hasTabularNumbers>
            {quantity(r.available)}
          </Text>
          <Text type="supporting">Min. {quantity(r.min_stock)}</Text>
        </VStack>
      ),
    },
    {
      key: "condition",
      header: "Kondisi stok",
      width: proportional(1.5, { minWidth: 60 }),
      renderCell: (r) => <StockCondition product={r} />,
    },
    ...(manage
      ? [
          {
            key: "actions",
            header: "Tindakan",
            width: proportional(1.7, { minWidth: 60 }),
            renderCell: (r: Row) => (
              <HStack gap={2} vAlign="center">
                <Button
                  size="sm"
                  variant="secondary"
                  label="Barang masuk"
                  href={stockContext(`/stock/${r.id}/receive/`, page.url)}
                />
                <DropdownMenu
                  presentation="popover"
                  renderTrigger={(props) => (
                    <IconButton
                      {...props}
                      label={`Tindakan untuk ${r.name}`}
                      icon={<EllipsisHorizontalIcon />}
                      size="sm"
                      variant="secondary"
                    />
                  )}
                  alignment="end"
                  items={[
                    {
                      label: "Hitung & koreksi fisik",
                      href: stockContext(`/stock/${r.id}/reconcile/`, page.url),
                    },
                    {
                      label: "Batch & kedaluwarsa",
                      href: stockContext(
                        `/products/${r.id}/?section=batches`,
                        page.url,
                      ),
                    },
                    {
                      label: "Perencanaan pengadaan",
                      href: stockContext(
                        `/products/${r.id}/?section=supply`,
                        page.url,
                      ),
                    },
                    {
                      label: "Edit produk",
                      href: stockContext(`/products/${r.id}/edit/`, page.url),
                    },
                  ]}
                />
              </HStack>
            ),
          },
        ]
      : []),
  ];
  return (
    <Layout
      height="fill"
      header={
        <PageHeader
          back={back ? { href: back, label: backLabel(back) } : undefined}
          title="Produk & stok"
          description="Ketersediaan produk dan pencatatan stok gudang."
          actions={
            manage && (
              <Button
                label="Tambah produk"
                variant="primary"
                href={stockContext("/products/new/", page.url)}
              />
            )
          }
        />
      }
      content={
        <LayoutContent padding={6} data-oneflow-scroll>
          <VStack gap={4}>
            {manage && (
              <TabList
                hasDivider
                aria-label="Produk dan riwayat stok"
                value={d.selected_tab}
                onChange={(v) => void navigate(stockTabUrl(page.url, v))}
              >
                <Tab value="products" label="Produk" />
                <Tab value="planning" label="Pengadaan" />
                <Tab value="movements" label="Riwayat mutasi" />
              </TabList>
            )}
            {d.selected_tab === "planning" ? (
              <SupplyPlanning data={d} update={update} />
            ) : history ? (
              <MovementView data={d} update={update} />
            ) : (
              <>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    update({ q: query });
                  }}
                >
                  <FilterRow>
                    <StackItem size="fill">
                      <TextInput
                        label="Cari produk"
                        placeholder="Nama produk atau SKU"
                        startIcon="search"
                        width="100%"
                        value={query}
                        onChange={setQuery}
                      />
                    </StackItem>
                    <Selector
                      label="Status produk"
                      width="12rem"
                      value={d.selected_status}
                      options={[
                        { value: "", label: "Semua status" },
                        { value: "active", label: "Aktif" },
                        { value: "inactive", label: "Nonaktif" },
                      ]}
                      onChange={(status) => update({ status, q: query })}
                    />
                    <Selector
                      label="Kondisi stok"
                      width="15rem"
                      value={d.stock_filter}
                      options={[
                        {
                          value: "",
                          label: `Semua (${d.condition_counts.all})`,
                        },
                        {
                          value: "ready",
                          label: `Memenuhi minimum (${d.condition_counts.ready})`,
                        },
                        {
                          value: "low",
                          label: `Di bawah minimum (${d.condition_counts.low})`,
                        },
                        {
                          value: "empty",
                          label: `Stok bebas habis (${d.condition_counts.empty})`,
                        },
                        {
                          value: "conflict",
                          label: `Konflik stok (${d.condition_counts.conflict})`,
                        },
                      ]}
                      onChange={(filter) => update({ filter, q: query })}
                    />
                    <Button
                      variant="secondary"
                      label="Cari"
                      type="submit"
                      isLoading={refreshing}
                      isDisabled={busy}
                    />
                  </FilterRow>
                </form>
                <ResultsSummary
                  reset={filtered ? { href: resetUrl } : undefined}
                >
                  {d.products.length} produk · Stok bebas = fisik − reservasi.
                  Kelayakan kirim diperiksa per batch.
                </ResultsSummary>
                {d.stock_filter === "low" && (
                  <Text type="supporting">
                    Produk dengan stok tersedia di bawah batas minimum, termasuk
                    stok habis atau konflik.
                  </Text>
                )}
                {d.products.some((p: Row) => p.stock_state === "conflict") && (
                  <Banner
                    status="warning"
                    title="Ada stok fisik di bawah reservasi"
                    description={
                      manage
                        ? "Periksa hasil hitung dan pesanan yang mereservasi produk melalui detailnya."
                        : "Koordinasikan dengan gudang sebelum mengonfirmasi pesanan untuk produk ini."
                    }
                  />
                )}
                <ServerTable
                  rows={d.products}
                  columns={columns}
                  sort={d.selected_sort}
                  update={update}
                  empty={
                    <Empty
                      kind={filtered ? "search" : "empty"}
                      title={
                        filtered
                          ? "Tidak ada produk yang cocok"
                          : "Belum ada produk"
                      }
                      description={
                        filtered
                          ? "Ubah pencarian atau reset filter."
                          : manage
                            ? "Tambahkan produk, lalu catat barang masuk untuk mengisi stok."
                            : "Produk akan tampil setelah ditambahkan oleh gudang atau manajer."
                      }
                      action={
                        !filtered && manage ? (
                          <Button
                            label="Tambah produk"
                            href={stockContext("/products/new/", page.url)}
                          />
                        ) : undefined
                      }
                    />
                  }
                />
              </>
            )}
          </VStack>
        </LayoutContent>
      }
    />
  );
}
