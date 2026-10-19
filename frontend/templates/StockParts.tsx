import { ProductIdentity } from "../ProductIdentity";
import { withReturn } from "../navigation";
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Astryx TablePaginatedTable pattern, with pagination and sorting owned by Django.
import { useState } from "react";
import {
  Table,
  proportional,
  useTableSortable,
  type TableColumn,
} from "@astryxdesign/core/Table";
import { Pagination } from "@astryxdesign/core/Pagination";
import { Selector } from "@astryxdesign/core/Selector";
import { DateInput } from "@astryxdesign/core/DateInput";
import type { ISODateString } from "@astryxdesign/core/Calendar";
import {
  HStack,
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
} from "../ui";
import { useApp } from "../router";
import type { Row } from "../types";
export const stockContext = withReturn;
export function StockCondition({ product }: { product: Row }) {
  const labels: Record<string, string> = {
    conflict: "Konflik stok",
    empty: "Stok bebas habis",
    low: "Menipis",
    ready: "Cukup",
  };
  return (
    <Status
      value={
        product.stock_state === "conflict"
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
}: {
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
      data={rows}
      columns={columns}
      idKey="id"
      plugins={{ sort: sorting }}
      hasHover
      density="compact"
      textOverflow="wrap"
    />
  ) : (
    empty || (
      <Empty
        title="Tidak ada mutasi yang cocok"
        description="Ubah filter untuk menelusuri riwayat lain."
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
  const { page, busy } = useApp();
  const [from, setFrom] = useState(d.date_from || ""),
    [to, setTo] = useState(d.date_to || "");
  const filtered =
    d.query ||
    d.selected_kind ||
    d.date_from ||
    d.date_to ||
    (!singleProduct && d.selected_product);
  return (
    <VStack gap={4}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          update({ from, to, page: "1" });
        }}
      >
        <VStack gap={3}>
          <HStack gap={3} vAlign="end" wrap="wrap">
            {!singleProduct && (
              <StackItem size="fill">
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
              label="Jenis mutasi"
              width="14rem"
              value={d.selected_kind}
              options={[{ value: "", label: "Semua jenis" }, ...d.kind_options]}
              onChange={(kind) => update({ kind, page: "1" })}
            />
          </HStack>
          <HStack gap={3} vAlign="end" wrap="wrap">
            <DateInput
              label="Dari tanggal"
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
            <Button label="Terapkan tanggal" type="submit" isLoading={busy} />
            {filtered && (
              <Button
                label="Reset riwayat"
                variant="secondary"
                onClick={() =>
                  update({
                    from: "",
                    to: "",
                    kind: "",
                    product: "",
                    q: "",
                    page: "1",
                    sort: "-created_at",
                  })
                }
              />
            )}
          </HStack>
        </VStack>
      </form>
      {d.date_error && <Banner status="warning" title={d.date_error} />}
      <Text type="supporting">
        {d.movement_total} mutasi · Waktu Indonesia Barat (WIB)
        {singleProduct ? " · Produk ini saja" : ""}
      </Text>
      <ServerTable
        rows={d.movements}
        sort={d.selected_sort}
        update={update}
        empty={
          <Empty
            title={
              filtered ? "Tidak ada mutasi yang cocok" : "Belum ada mutasi"
            }
            description={
              filtered
                ? "Ubah atau reset filter riwayat."
                : "Barang masuk, koreksi fisik, dan pengiriman akan tercatat di sini."
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
            header: "Mutasi",
            width: proportional(1, { minWidth: 60 }),
            renderCell: (r) => <Text>{r.kind}</Text>,
          },
          {
            key: "delta",
            header: "Selisih",
            sortable: true,
            align: "end",
            width: proportional(1, { minWidth: 60 }),
            renderCell: (r) => (
              <Text hasTabularNumbers>
                {BigInt(r.delta) > 0n ? "+" : ""}
                {quantity(r.delta)} {r.product.unit}
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
                  <Link href={withReturn(`/samples/${r.sample_request_id}/`, page.url)}>
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
          isDisabled={busy}
          label="Halaman riwayat mutasi"
        />
      )}
    </VStack>
  );
}
