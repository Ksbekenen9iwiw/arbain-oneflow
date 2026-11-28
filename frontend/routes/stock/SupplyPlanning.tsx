// Uses the existing Astryx table-page frame in Stock.
import { proportional } from "@/kit";
import { TextInput } from "@/kit";
import { Selector } from "@/kit";
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
  useSearchInput,
  resetLabel,
} from "../../ui";
import { ProductIdentity } from "../../ProductIdentity";
import { useApp } from "../../router";
import { withReturn } from "../../navigation";
import type { Row } from "../../types";

export default function SupplyPlanning({
  data: d,
  update,
}: {
  data: Row;
  update: (values: Record<string, string>) => void;
}) {
  const { page, revision } = useApp();
  const [query, setQuery] = useSearchInput(d.query || "", revision, (q) =>
    update({ q }),
  );
  return (
    <VStack gap={4} data-tour="supply-planning">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: query });
        }}
      >
        <FilterRow>
          <StackItem size="fill" style={{ minWidth: "14rem" }}>
            <TextInput
              label="Cari produk"
              placeholder="Nama produk atau SKU"
              startIcon="search"
              width="100%"
              hasClear
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
        </FilterRow>
      </form>
      <ResultsSummary
        reset={
          d.query || d.selected_risk
            ? {
                label: resetLabel(d.query, d.selected_risk),
                onClick: () => {
                  setQuery("");
                  update({ q: "", risk: "" });
                },
              }
            : undefined
        }
      >
        {quantity(d.planning.length)} produk
      </ResultsSummary>
      <DataTable
        title="Pengadaan"
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
    </VStack>
  );
}
