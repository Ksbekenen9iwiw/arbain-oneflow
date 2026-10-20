// Uses the existing Astryx table-page frame in Stock.
import { proportional } from "@astryxdesign/core/Table";
import { useState } from "react";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import {
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
  const { page, busy } = useApp();
  const [query, setQuery] = useState(d.query || "");
  return (
    <VStack gap={4} data-tour="supply-planning">
      <Text color="secondary">
        Prioritaskan produk yang berisiko habis. Buka perhitungan untuk meninjau
        saran dan pengadaan yang sedang berjalan.
      </Text>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: query });
        }}
      >
        <HStack gap={3} vAlign="end" wrap="wrap">
          <StackItem size="fill">
            <TextInput
              label="Cari produk"
              isLabelHidden
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
          <Button type="submit" label="Cari" isLoading={busy} />
          {(d.query || d.selected_risk) && (
            <Button label="Reset" href="/stock/?tab=planning" />
          )}
        </HStack>
      </form>
      <DataTable
        rows={d.planning}
        empty={
          <Empty
            title="Tidak ada produk yang cocok"
            description="Ubah pencarian atau tampilkan semua produk aktif."
            action={<Button label="Semua produk" href="/stock/?tab=planning" />}
          />
        }
        columns={[
          {
            key: "product",
            width: proportional(2.3, { minWidth: 200 }),
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
                </VStack>
              </ProductIdentity>
            ),
          },
          {
            key: "risk",
            width: proportional(2, { minWidth: 180 }),
            header: "Prioritas",
            renderCell: (r) => <Status value={r.risk} />,
          },
          {
            key: "velocity",
            width: proportional(1, { minWidth: 96 }),
            header: "Penjualan / hari",
            align: "end",
            renderCell: (r) => (
              <VStack gap={1}>
                <Text hasTabularNumbers>{r.velocity?.rate ?? "—"}</Text>
                <Text type="supporting">
                  {r.velocity
                    ? `${r.velocity.period_days} hari${r.velocity.complete ? "" : " · riwayat terbatas"}`
                    : "Belum diatur"}
                </Text>
              </VStack>
            ),
          },
          {
            key: "eligible",
            width: proportional(0.8, { minWidth: 80 }),
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
            width: proportional(1, { minWidth: 96 }),
            header: "Sedang dipesan",
            align: "end",
            renderCell: (r) => (
              <Text hasTabularNumbers>
                {r.configured ? quantity(r.outstanding_units) : "—"}
              </Text>
            ),
          },
          {
            key: "recommend_quantity",
            width: proportional(1, { minWidth: 96 }),
            header: "Saran tambahan",
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
            width: proportional(1.7, { minWidth: 150 }),
            header: "Tindakan",
            renderCell: (r) => (
              <Button
                size="sm"
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
