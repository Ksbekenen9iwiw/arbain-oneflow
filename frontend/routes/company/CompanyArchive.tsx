// Copyright (c) Meta Platforms, Inc. and affiliates.
// Adapted from Astryx table-page: padded document stack, filters and flat records.
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Pagination } from "@astryxdesign/core/Pagination";
import { Selector } from "@astryxdesign/core/Selector";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { proportional, type TableColumn } from "@astryxdesign/core/Table";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useApp } from "../../router";
import type { Row } from "../../types";
import {
  Button,
  DataTable,
  Empty,
  Fact,
  HStack,
  Heading,
  Status,
  Text,
  VStack,
  dateLabel,
  quantity,
  useSearchInput,
} from "../../ui";

const descriptions: Record<string, string> = {
  sales: "Jumlah, retur, dan unit laku dari rekap produk masing-masing sales.",
  visits:
    "Setiap baris adalah catatan kunjungan. Satu outlet dapat muncul lebih dari sekali.",
  outlet_sales:
    "Jumlah, retur, dan unit laku per outlet seperti tercatat di rekap mitra.",
  stock:
    "Snapshot jumlah produk di outlet. Cakupan global dan wilayah bisa bertumpang tindih.",
  ledger:
    "Catatan historis per outlet dan produk. A, M, R, L, dan S mengikuti label kolom di PDF.",
  notes: "Catatan kerja dari mitra untuk memahami konteks laporan.",
  sources:
    "Buka dokumen asli untuk memeriksa angka, kolom, dan halaman sumber.",
};

function textColumn(key: string, header: string, weight = 1): TableColumn<Row> {
  return { key, header, width: proportional(weight, { minWidth: 95 }) };
}

function amountColumn(key: string, header: string): TableColumn<Row> {
  return {
    key,
    header,
    align: "end",
    width: proportional(0.7, { minWidth: 70 }),
    renderCell: (row) => (row[key] == null ? "—" : quantity(row[key])),
  };
}

const sourceColumn: TableColumn<Row> = {
  key: "source_url",
  header: "Sumber",
  width: proportional(1, { minWidth: 100 }),
  renderCell: (row) => (
    <VStack gap={1}>
      {row.issue && (
        <>
          <Status value="WARNING" label="Perlu tinjau" />
          <Text type="supporting">{row.issue}</Text>
        </>
      )}
      <Button
        href={row.source_url}
        target="_blank"
        rel="noopener"
        size="sm"
        label={`Buka hlm. ${row.page}`}
        variant="secondary"
      />
    </VStack>
  ),
};

function columnsFor(tab: string): TableColumn<Row>[] {
  const sales = textColumn("sales", "Sales");
  const outlet = textColumn("outlet", "Outlet", 2);
  const product = textColumn("product", "Produk", 2);
  const region = textColumn("region", "Wilayah");
  const column = (key: string, label = key, weight = 1): TableColumn<Row> => ({
    key,
    header: label,
    width: proportional(weight, { minWidth: weight > 1 ? 140 : 80 }),
    renderCell: (row) => row.details?.[key] || "—",
  });
  if (tab === "sales" || tab === "outlet_sales") {
    return [
      sales,
      ...(tab === "outlet_sales" ? [outlet] : []),
      product,
      amountColumn("quantity", "Jumlah"),
      amountColumn("returned", "Retur"),
      amountColumn("sold", "Laku"),
      sourceColumn,
    ];
  }
  if (tab === "visits") {
    return [
      {
        key: "observed_date",
        header: "Tanggal",
        renderCell: (row) =>
          row.observed_date ? dateLabel(row.observed_date) : "Perlu ditinjau",
      },
      sales,
      outlet,
      column("Alamat", "Lokasi sumber", 1.5),
      sourceColumn,
    ];
  }
  if (tab === "stock") {
    return [
      sales,
      { ...region, renderCell: (row) => row.region || "Global" },
      product,
      amountColumn("quantity", "Jumlah"),
      sourceColumn,
    ];
  }
  if (tab === "ledger") {
    return [
      sales,
      outlet,
      region,
      product,
      {
        key: "dates",
        header: "Setor / ambil",
        width: proportional(1.2, { minWidth: 110 }),
        renderCell: (row) => (
          <VStack gap={1}>
            <Text>{row.details["Tanggal setor"] || "—"}</Text>
            <Text type="supporting">{row.details["Tanggal ambil"] || "—"}</Text>
          </VStack>
        ),
      },
      {
        key: "values",
        header: "A · M · R · L · S",
        width: proportional(1.2, { minWidth: 110 }),
        renderCell: (row) => (
          <Text hasTabularNumbers>
            {["A", "M", "R", "L", "S"]
              .map((key) => row.details[key] || "—")
              .join(" · ")}
          </Text>
        ),
      },
      sourceColumn,
    ];
  }
  if (tab === "notes") return [column("Catatan", "Catatan", 4), sourceColumn];
  return [
    {
      key: "name",
      header: "Dokumen",
      width: proportional(4),
      renderCell: (row) => (
        <VStack gap={1}>
          <Text weight="semibold">{row.name}</Text>
          <Text type="supporting">
            {row.path.replace(/\/[^/]+$/, "") !== row.name
              ? row.path.replace(/\/[^/]+$/, "")
              : ""}
          </Text>
        </VStack>
      ),
    },
    {
      key: "url",
      header: "Sumber",
      renderCell: (row) => (
        <Button
          href={row.url}
          target="_blank"
          rel="noopener"
          label="Buka dokumen"
          size="sm"
          variant="secondary"
        />
      ),
    },
  ];
}

export default function CompanyArchive() {
  const { page, navigate, revision, busy } = useApp();
  const data = page.data;
  const tab = data.tab;
  const update = (changes: Record<string, string>, nextQuery = query) => {
    const params = new URLSearchParams({
      month: data.month,
      tab,
      q: nextQuery,
      sales: data.sales,
      region: data.region,
      review: data.flagged ? "1" : "",
      ...changes,
    });
    for (const [key, value] of [...params]) if (!value) params.delete(key);
    void navigate("/company-data/" + (params.size ? "?" + params : ""));
  };
  const [query, setQuery] = useSearchInput(
    data.search || "",
    revision,
    (value) => update({ q: value }, value),
  );
  const options = (values: string[], defaultLabel?: string) => [
    ...(defaultLabel ? [{ value: "", label: defaultLabel }] : []),
    ...values.map((value) => ({ value, label: value })),
  ];
  const sourceTab = tab === "sources";
  const filtered = Boolean(query || data.sales || data.region || data.flagged);
  return (
    <Layout
      height="fill"
      contentWidth={1200}
      content={
        <LayoutContent padding={0} data-oneflow-scroll>
          <VStack padding={4} gap={8}>
            <VStack gap={6} paddingBlockEnd={4}>
              <HStack hAlign="between" vAlign="center" wrap="wrap" gap={4}>
                <VStack gap={2}>
                  <Heading level={1}>Data perusahaan</Heading>
                  <Text color="secondary">
                    Laporan historis CV Arba’in · {data.source_count} dokumen
                    sumber
                  </Text>
                </VStack>
                {!!data.month && (
                  <Selector
                    label="Periode laporan"
                    value={data.month}
                    options={options(data.months)}
                    isDisabled={busy}
                    onChange={(month) =>
                      update({
                        month,
                        sales: "",
                        region: "",
                        review: "",
                        q: "",
                      })
                    }
                  />
                )}
              </HStack>
              {!!data.month && (
                <>
                  <TabList
                    role="tablist"
                    aria-label="Kategori laporan"
                    hasDivider
                    value={tab}
                    onChange={(next) =>
                      update({
                        tab: String(next),
                        q: "",
                        sales: "",
                        region: "",
                        review: "",
                      })
                    }
                  >
                    {data.tabs.map(([key, label]: [string, string]) => (
                      <Tab key={key} value={key} label={label} />
                    ))}
                  </TabList>
                  {sourceTab ? (
                    <Text color="secondary">{descriptions[tab]}</Text>
                  ) : (
                    <>
                      <HStack gap={3} vAlign="end" wrap="wrap">
                        <TextInput
                          label="Cari dalam laporan"
                          placeholder="Produk, outlet, atau lokasi"
                          value={query}
                          onChange={setQuery}
                          width="20rem"
                        />
                        {!!data.all_sales.length && (
                          <Selector
                            label="Sales sumber"
                            value={data.sales}
                            options={options(data.all_sales, "Semua sales")}
                            onChange={(sales) => update({ sales })}
                          />
                        )}
                        {!!data.all_regions.length && (
                          <Selector
                            label="Wilayah"
                            value={data.region}
                            options={options(data.all_regions, "Semua wilayah")}
                            onChange={(region) => update({ region })}
                          />
                        )}
                        <Button
                          variant={data.flagged ? "primary" : "secondary"}
                          aria-pressed={data.flagged}
                          label="Perlu tinjau"
                          onClick={() =>
                            update({ review: data.flagged ? "" : "1" })
                          }
                        />
                        {filtered && (
                          <Button
                            label="Reset filter"
                            variant="secondary"
                            onClick={() =>
                              update(
                                { q: "", sales: "", region: "", review: "" },
                                "",
                              )
                            }
                          />
                        )}
                      </HStack>
                      <Text color="secondary">{descriptions[tab]}</Text>
                    </>
                  )}
                </>
              )}
            </VStack>
            {!data.month ? (
              <Empty
                title="Belum ada laporan perusahaan"
                description="Dokumen yang diimpor akan tampil di sini."
              />
            ) : (
              <VStack gap={4}>
                {!sourceTab && (
                  <HStack gap={6} wrap="wrap" aria-live="polite">
                    <Fact
                      label={
                        filtered ? "Baris sesuai filter" : "Baris dalam laporan"
                      }
                    >
                      {quantity(data.total)}
                    </Fact>
                    {tab === "sales" && (
                      <>
                        <Fact label="Jumlah di sumber">
                          {quantity(data.summary.quantity || 0)}
                        </Fact>
                        <Fact label="Retur di sumber">
                          {quantity(data.summary.returned || 0)}
                        </Fact>
                        <Fact label="Laku di sumber">
                          {quantity(data.summary.sold || 0)}
                        </Fact>
                      </>
                    )}
                  </HStack>
                )}
                <DataTable
                  rows={sourceTab ? data.sources : data.rows}
                  columns={columnsFor(tab)}
                  empty={
                    <Empty
                      kind={filtered ? "search" : "empty"}
                      title={
                        filtered
                          ? "Tidak ada baris yang cocok"
                          : "Belum ada laporan di kategori ini"
                      }
                    />
                  }
                />
                {!sourceTab && Number(data.total) > Number(data.page_size) && (
                  <Pagination
                    label="Halaman laporan"
                    page={Number(data.page_number)}
                    pageSize={Number(data.page_size)}
                    totalItems={Number(data.total)}
                    onChange={(next) => update({ page: String(next) })}
                  />
                )}
              </VStack>
            )}
          </VStack>
        </LayoutContent>
      }
    />
  );
}
