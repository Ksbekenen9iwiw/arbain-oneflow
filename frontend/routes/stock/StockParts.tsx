import { ProductIdentity } from "../../ProductIdentity";
import { withReturn } from "../../navigation";
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Astryx TablePaginatedTable pattern, with pagination and sorting owned by Django.
import { useEffect, useState } from "react";
import { TextInput } from "@/kit";
import {
  proportional,
  useTableSortable,
  type TableColumn,
} from "@/kit";
import { Pagination } from "@/kit";
import { Selector } from "@/kit";
import { DateInput } from "@/kit";
import type { ISODateString } from "@/kit";
import {
  FilterRow,
  ResultsSummary,
  HStack,
  tablePresentation,
  VStack,
  StackItem,
  Text,
  Link,
  Button,
  Status,
  Empty,
  Banner,
  quantity,
  dateLabel,
  Table,
} from "../../ui";
import { useApp } from "../../router";
import { useDelayedBusy } from "../../RequestFeedback";
import type { Row } from "../../types";
export const stockContext = withReturn;
export function StockCondition({ product }: { product: Row }) {
  const labels: Record<string, string> = {
    conflict: "Konflik stok",
    unverified: "Saldo belum diverifikasi",
    empty: "Siap jual habis",
    low: "Menipis",
    ready: "Memenuhi minimum",
  };
  return (
    <Status
      value={
        product.stock_state === "unverified"
          ? "WARNING"
          : product.stock_state === "conflict"
            ? "STOCK_CONFLICT"
            : product.stock_state === "empty"
              ? "STOCK_EMPTY"
              : product.stock_state === "low"
                ? "STOCK_LOW"
                : product.stock_state === "ready"
                  ? "STOCK_READY"
                  : "DRAFT"
      }
      label={labels[product.stock_state]}
    />
  );
}
export function ServerTable({
  rows,
  columns,
  sort,
  update,
  empty,
  title,
}: {
  title: string;
  rows: Row[];
  columns: TableColumn<Row>[];
  sort: string;
  update: (changes: Record<string, string>) => void;
  empty?: React.ReactNode;
}) {
  const sorting = useTableSortable({
    sort: [
      {
        sortKey: sort.replace("-", ""),
        direction: sort.startsWith("-") ? "descending" : "ascending",
      },
    ],
    allowUnsortedState: false,
    onSortChange: (next) =>
      update({
        sort:
          (next[0]?.direction === "descending" ? "-" : "") +
          (next[0]?.sortKey || "created_at"),
        page: "1",
      }),
  });
  return rows.length ? (
    <Table
      title={title}
      {...tablePresentation}
      data={rows}
      columns={columns}
      idKey="id"
      plugins={{ sort: sorting }}
    />
  ) : (
    empty || (
      <Empty
        kind="search"
        title="Tidak ada mutasi yang cocok"
      />
    )
  );
}
export function MovementView({
  data: d,
  update,
  singleProduct = false,
}: {
  data: Row;
  update: (changes: Record<string, string>) => void;
  singleProduct?: boolean;
}) {
  const { page, busy, refreshing, revision } = useApp();
  const delayedBusy = useDelayedBusy(busy);
  const delayedRefreshing = useDelayedBusy(refreshing);
  const [from, setFrom] = useState(d.date_from || ""),
    [to, setTo] = useState(d.date_to || "");
  useEffect(() => {
    setFrom(d.date_from || "");
    setTo(d.date_to || "");
  }, [revision]);
  const [search, setSearch] = useState(d.query || "");
  useEffect(() => setSearch(d.query || ""), [revision]);
  const exportUrl = () => {
    const params = new URLSearchParams(page.url.split("?")[1] || "");
    params.set("tab", "movements");
    params.set("format", "csv");
    params.delete("page");
    if (singleProduct) params.set("product", String(d.selected_product));
    return "/stock/?" + params;
  };
  const filtered =
    d.query ||
    d.selected_actor ||
    d.selected_kind ||
    d.date_from ||
    d.date_to ||
    (!singleProduct && d.selected_product);
  return (
    <VStack gap={4}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          update({ from, to, q: search, page: "1" });
        }}
      >
        <VStack gap={3}>
          <FilterRow>
            {!singleProduct && (
              <StackItem size="fill" style={{ minWidth: "14rem" }}>
                <Selector
                  label="Produk"
                  width="100%"
                  value={d.selected_product}
                  options={[
                    { value: "", label: "Semua produk" },
                    ...d.product_options,
                  ]}
                  onChange={(product) => update({ product, page: "1" })}
                />
              </StackItem>
            )}
            <Selector
              label="Jenis"
              width="12rem"
              value={d.selected_kind}
              options={[{ value: "", label: "Semua jenis" }, ...d.kind_options]}
              onChange={(kind) => update({ kind, page: "1" })}
            />
            <Selector
              label="Pelaku"
              width="12rem"
              value={d.selected_actor}
              options={[{ value: "", label: "Semua orang" }, ...d.actor_options]}
              onChange={(actor) => update({ actor, page: "1" })}
            />
          </FilterRow>
          <FilterRow>
            <StackItem size="fill" style={{ minWidth: "12rem" }}>
              <TextInput
                label={singleProduct ? "Cari kode batch" : "Cari produk atau kode batch"}
                startIcon="search"
                hasClear
                width="100%"
                value={search}
                onChange={setSearch}
              />
            </StackItem>
            <DateInput
              label="Mulai tanggal"
              placeholder="Pilih tanggal"
              value={(from || undefined) as ISODateString | undefined}
              onChange={(v) => setFrom(v || "")}
              format="system_date"
              hasClear
            />
            <DateInput
              label="Sampai tanggal"
              placeholder="Pilih tanggal"
              value={(to || undefined) as ISODateString | undefined}
              onChange={(v) => setTo(v || "")}
              format="system_date"
              hasClear
            />
            <Button
              variant="secondary"
              label="Terapkan"
              type="submit"
              isLoading={delayedRefreshing}
              isDisabled={delayedBusy}
            />
          </FilterRow>
        </VStack>
      </form>
      {d.date_error && <Banner status="warning" title={d.date_error} />}
      <ResultsSummary
        reset={
          filtered
            ? {
                onClick: () =>
                  update({
                    from: "",
                    to: "",
                    kind: "",
                    actor: "",
                    product: "",
                    q: "",
                    page: "1",
                    sort: "-created_at",
                  }),
              }
            : undefined
        }
      >
        {d.movement_total} catatan · WIB
        {singleProduct ? " · Produk ini saja" : ""}
        {Number(d.movement_total) > 0 && (
          <>
            {" · "}
            <a href={exportUrl()} download>
              Unduh CSV
            </a>
          </>
        )}
      </ResultsSummary>
      <ServerTable
        title="Log transaksi"
        rows={d.movements}
        sort={d.selected_sort}
        update={update}
        empty={
          <Empty
            kind={filtered ? "search" : "empty"}
            title={
              filtered ? "Tidak ada catatan yang cocok" : "Belum ada catatan"
            }
            description={
              filtered
                ? "Ubah atau reset filter."
                : "Barang masuk, pengiriman, koreksi, tukar batch, dan pembatalan tercatat di sini."
            }
          />
        }
        columns={[
          {
            key: "created_at",
            header: "Waktu",
            sortable: true,
            width: proportional(1.3, { minWidth: 60 }),
            renderCell: (r) => (
              <Text color="secondary">{dateLabel(r.created_at, true)}</Text>
            ),
          },
          ...(!singleProduct
            ? [
                {
                  key: "product",
                  header: "Produk",
                  width: proportional(1.5, { minWidth: 60 }),
                  renderCell: (r: Row) => (
                    <ProductIdentity
                      sku={r.product.sku}
                      name={r.product.name}
                      size="row"
                    >
                      <VStack gap={1}>
                        <Link
                          href={stockContext(
                            `/products/${r.product.id}/`,
                            page.url,
                          )}
                        >
                          {r.product.name}
                        </Link>
                        <Text type="supporting">{r.product.sku}</Text>
                      </VStack>
                    </ProductIdentity>
                  ),
                },
              ]
            : []),
          {
            key: "kind",
            header: "Jenis",
            width: proportional(1, { minWidth: 60 }),
            renderCell: (r) => <Text>{r.kind}</Text>,
          },
          {
            key: "batch",
            header: "Batch",
            width: proportional(1, { minWidth: 60 }),
            renderCell: (r) => (
              <Text color={r.batch_code ? undefined : "secondary"}>
                {r.batch_code || "—"}
              </Text>
            ),
          },
          {
            key: "delta",
            header: "Jumlah",
            sortable: true,
            align: "end",
            width: proportional(1, { minWidth: 60 }),
            renderCell: (r) => (
              <Text hasTabularNumbers color={r.physical ? undefined : "secondary"}>
                {r.physical && BigInt(r.delta) > 0n ? "+" : ""}
                {quantity(r.physical ? r.delta : r.quantity)} {r.product.unit}
              </Text>
            ),
          },
          {
            key: "reason",
            header: "Alasan / referensi",
            width: proportional(2, { minWidth: 60 }),
            renderCell: (r) => (
              <VStack gap={1}>
                <Text>{r.reason}</Text>
                {r.order_id && (
                  <Link href={withReturn(`/orders/${r.order_id}/`, page.url)}>
                    Lihat OF-{r.order_id.padStart(4, "0")}
                  </Link>
                )}
                {r.sample_request_id && (
                  <Link
                    href={withReturn(
                      `/samples/${r.sample_request_id}/`,
                      page.url,
                    )}
                  >
                    Lihat SP-{r.sample_request_id.padStart(4, "0")}
                  </Link>
                )}
              </VStack>
            ),
          },
          {
            key: "actor",
            header: "Oleh",
            width: proportional(1, { minWidth: 60 }),
            renderCell: (r) => <Text>{r.actor.name}</Text>,
          },
        ]}
      />
      {Number(d.movement_pages) > 1 && (
        <Pagination
          page={Number(d.movement_page)}
          totalItems={Number(d.movement_total)}
          pageSize={Number(d.page_size)}
          onChange={(n) => update({ page: String(n) })}
          isDisabled={delayedBusy}
          label="Halaman riwayat mutasi"
        />
      )}
    </VStack>
  );
}
