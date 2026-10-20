// Uses the existing Astryx table-page frame in Stock.
import { proportional } from "@astryxdesign/core/Table";
import { useState } from "react";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import {
  ResultsSummary,
  FilterRow,
  VStack,
  HStack,
  StackItem,
  Text,
  Button,
  Link,
  DataTable,
  Empty,
  Status,
  quantity,
} from "../ui";
import { ProductIdentity } from "../ProductIdentity";
import { useApp } from "../router";
import { withReturn } from "../navigation";
import type { Row } from "../types";

export default function SupplyPlanning({
  data: d,
  update,
}: {
  data: Row;
  update: (values: Record<string, string>) => void;
}) {
  const { page, busy, refreshing } = useApp();
  const [query, setQuery] = useState(d.query || "");
  return (
    <VStack gap={4} data-tour="supply-planning">
      <Text type="supporting">
        Prioritaskan produk yang berisiko habis. Buka perhitungan untuk meninjau
        saran dan pengadaan yang sedang berjalan.
      </Text>
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
            label="Prioritas pengadaan"
            width="16rem"
            value={d.selected_risk}
            options={[
              { value: "", label: `Semua (${d.planning_counts.all})` },
              {
                value: "attention",
                label: `Perlu perhatian (${d.planning_counts.attention})`,
              },
            ]}
            onChange={(risk) => update({ risk, q: query })}
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
          d.query || d.selected_risk
            ? { onClick: () => update({ q: "", risk: "" }) }
            : undefined
        }
      >
        {quantity(d.planning.length)} produk
      </ResultsSummary>
      <DataTable
        rows={d.planning}
        empty={
          <Empty
            kind={d.query || d.selected_risk ? "search" : "empty"}
            title={
              d.query || d.selected_risk
                ? "Tidak ada produk yang cocok"
                : "Belum ada produk untuk dipantau"
            }
            description={
              d.query || d.selected_risk
                ? "Ubah pencarian atau reset filter."
                : "Produk aktif akan tampil di sini beserta perhitungan kebutuhan stoknya."
            }
          />
        }
        columns={[
          {
            key: "product",
            width: proportional(2.4, { minWidth: 220 }),
            header: "Produk",
            renderCell: (r) => (
              <ProductIdentity name={r.product.name} sku={r.product.sku}>
                <VStack gap={1}>
                  <Link
                    weight="semibold"
                    href={withReturn(
                      `/products/${r.id}/?section=supply`,
                      page.url,
                    )}
                  >
                    {r.product.name}
                  </Link>
                  <Text type="supporting">
                    {r.product.sku} · {r.product.unit}
                  </Text>
                  {r.velocity && (
                    <Text type="supporting">
                      {r.velocity.rate} {r.product.unit}/hari ·{" "}
                      {r.velocity.period_days} hari
                      {r.velocity.complete ? "" : " · riwayat terbatas"}
                    </Text>
                  )}
                </VStack>
              </ProductIdentity>
            ),
          },
          {
            key: "risk",
            width: proportional(2, { minWidth: 190 }),
            header: "Prioritas",
            renderCell: (r) => <Status value={r.risk} />,
          },
          {
            key: "eligible",
            width: proportional(1.2, { minWidth: 112 }),
            header: "Stok layak",
            align: "end",
            renderCell: (r) => (
              <Text hasTabularNumbers>
                {r.eligible == null ? "—" : quantity(r.eligible)}
              </Text>
            ),
          },
          {
            key: "outstanding_units",
            width: proportional(1.2, { minWidth: 112 }),
            header: "Dipesan",
            align: "end",
            renderCell: (r) => (
              <Text hasTabularNumbers>
                {r.configured ? quantity(r.outstanding_units) : "—"}
              </Text>
            ),
          },
          {
            key: "recommend_quantity",
            width: proportional(1.2, { minWidth: 112 }),
            header: "Saran tambah",
            align: "end",
            renderCell: (r) => (
              <Text weight="semibold" hasTabularNumbers>
                {r.recommend_quantity == null
                  ? "—"
                  : quantity(r.recommend_quantity)}
              </Text>
            ),
          },
          {
            key: "action",
            width: proportional(1.8, { minWidth: 150 }),
            header: "Tindakan",
            renderCell: (r) => (
              <Button
                size="sm"
                variant="secondary"
                label={
                  r.configured
                    ? "Tinjau pengadaan"
                    : page.role === "MANAGER"
                      ? "Atur perhitungan"
                      : "Lihat kebutuhan"
                }
                href={withReturn(`/products/${r.id}/?section=supply`, page.url)}
              />
            ),
          },
        ]}
      />
      <Text type="supporting">
        Saran menggunakan penjualan terkirim, waktu pengisian ulang, target
        cakupan, cadangan, dan pengadaan berjalan. Sampel tidak dihitung sebagai
        penjualan.
      </Text>
    </VStack>
  );
}
