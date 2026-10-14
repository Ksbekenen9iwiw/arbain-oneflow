// Copyright (c) Meta Platforms, Inc. and affiliates.
// Retains Astryx form-two-column's constrained form and pinned actions.
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import {
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  Banner,
  PageHeader,
  FieldControl,
  ServerForm,
  useFields,
  Fact,
  DataTable,
  money,
  quantity,
} from "../ui";
import { useApp } from "../router";
import type { Field, FormSpec } from "../types";
import { ProductThumbnail } from "../ProductIdentity";
export default function StockForm() {
  const { page, busy } = useApp();
  const d = page.data,
    spec: FormSpec = d.form,
    p = d.stock_product || d.product;
  const { values, onChange } = useFields(spec);
  const mutation = d.stock_form_kind === "mutation",
    editing = d.stock_form_kind === "product_edit",
    count = d.stock_mode === "count";
  const field = (key: string, extra: Partial<Field> = {}) => {
    const f = spec.fields.find((f) => f.key === key);
    return f ? (
      <FieldControl
        key={f.name}
        field={{
          ...f,
          ...extra,
          errors: values[f.name] !== f.value ? [] : f.errors,
        }}
        value={values[f.name]}
        onChange={(v) => onChange(f.name, v)}
      />
    ) : null;
  };
  const raw = String(
    values[
      mutation ? (count ? "counted_quantity" : "quantity") : "price_rupiah"
    ] ?? "",
  );
  const amount = /^\d{1,19}$/.test(raw) ? BigInt(raw) : null;
  const physical =
    mutation && amount !== null
      ? count
        ? amount
        : BigInt(p.on_hand) + amount
      : null;
  const free = physical !== null ? physical - BigInt(p.reserved) : null;
  const preview =
    physical !== null
      ? [
          {
            id: "physical",
            label: "Fisik",
            before: p.on_hand,
            after: String(physical),
          },
          {
            id: "reserved",
            label: "Reservasi",
            before: p.reserved,
            after: p.reserved,
          },
          {
            id: "available",
            label: "Tersedia",
            before: p.available,
            after: String(free),
          },
        ]
      : [];
  return (
    <Layout
      height="fill"
      contentWidth={800}
      defaultHasDividers
      header={
        <PageHeader
          title={
            mutation
              ? count
                ? "Hitung & koreksi fisik"
                : "Barang masuk"
              : editing
                ? "Edit produk"
                : "Tambah produk"
          }
          description={p ? `${p.name} · ${p.sku} · ${p.unit}` : undefined}
          leading={
            p ? (
              <ProductThumbnail sku={p.sku} name={p.name} size="detail" />
            ) : undefined
          }
          back={{ href: d.back_url, label: "Kembali" }}
        />
      }
      content={
        <LayoutContent padding={6} data-oneflow-scroll>
          <ServerForm id="stock-form">
            <VStack gap={6}>
              {spec.errors.map((error, i) => (
                <Banner
                  key={i}
                  status="error"
                  title={error}
                  data-form-errors
                  tabIndex={-1}
                />
              ))}
              {mutation ? (
                <>
                  <HStack gap={6} wrap="wrap">
                    <Fact label="Fisik saat ini">
                      {quantity(p.on_hand)} {p.unit}
                    </Fact>
                    <Fact label="Reservasi">
                      {quantity(p.reserved)} {p.unit}
                    </Fact>
                    <Fact label="Tersedia">
                      {quantity(p.available)} {p.unit}
                    </Fact>
                  </HStack>
                  <VStack gap={4}>
                    {field(count ? "counted_quantity" : "quantity", {
                      help: count
                        ? `Masukkan total ${p.unit} yang dihitung, bukan selisihnya. Reservasi pesanan tidak berubah.`
                        : `Jumlah ${p.unit} yang benar-benar diterima gudang.`,
                    })}
                    {field("reason")}
                    {field("operation_id")}
                  </VStack>
                  {physical !== null && (
                    <VStack gap={3}>
                      <Heading level={2}>Pratinjau stok</Heading>
                      <DataTable
                        rows={preview}
                        columns={[
                          {
                            key: "label",
                            header: "Saldo",
                            renderCell: (r) => <Text>{r.label}</Text>,
                          },
                          {
                            key: "before",
                            header: "Sebelum",
                            align: "end",
                            renderCell: (r) => (
                              <Text hasTabularNumbers>
                                {quantity(r.before)} {p.unit}
                              </Text>
                            ),
                          },
                          {
                            key: "delta",
                            header: "Perubahan",
                            align: "end",
                            renderCell: (r) => {
                              const n = BigInt(r.after) - BigInt(r.before);
                              return (
                                <Text hasTabularNumbers>
                                  {n > 0n ? "+" : ""}
                                  {quantity(String(n))} {p.unit}
                                </Text>
                              );
                            },
                          },
                          {
                            key: "after",
                            header: "Sesudah",
                            align: "end",
                            renderCell: (r) => (
                              <Text weight="semibold" hasTabularNumbers>
                                {quantity(r.after)} {p.unit}
                              </Text>
                            ),
                          },
                        ]}
                      />
                      {free !== null && free < 0n ? (
                        <Banner
                          status="warning"
                          title="Stok bebas akan negatif"
                          description="Hasil hitung tetap dapat disimpan. Reservasi tidak dihapus; periksa pesanan terkait sebelum konfirmasi baru."
                        />
                      ) : (
                        <Text type="supporting">
                          Berdasarkan saldo saat halaman dibuka. Server
                          memeriksa saldo terbaru saat disimpan.
                        </Text>
                      )}
                    </VStack>
                  )}
                </>
              ) : (
                <>
                  {!editing && (
                    <Banner
                      status="info"
                      title="Produk baru dimulai dengan stok 0"
                      description="Setelah produk tersimpan, catat barang masuk untuk mengisi stok."
                    />
                  )}
                  <VStack gap={4}>
                    <Heading level={2}>Identitas produk</Heading>
                    {field("name")}
                    {!editing && field("sku")}
                    {!editing && field("unit")}
                    {editing && (
                      <Text color="secondary">
                        SKU {p.sku} · Satuan {p.unit}
                      </Text>
                    )}
                  </VStack>
                  <VStack gap={4}>
                    <Heading level={2}>Harga & persediaan</Heading>
                    {field("price_rupiah")}
                    {editing &&
                      amount !== null &&
                      amount !== BigInt(d.original_price) && (
                        <Text type="supporting">
                          Harga tersimpan {money(d.original_price)} →{" "}
                          {money(String(amount))}. Harga pada pesanan yang sudah
                          dibuat tetap tersimpan.
                        </Text>
                      )}
                    {field("min_stock")}
                  </VStack>
                  <VStack gap={3}>
                    <Heading level={2}>Ketersediaan untuk pesanan</Heading>
                    {field("is_active", {
                      help: "Produk nonaktif tidak dapat ditambahkan atau dikonfirmasi pada pesanan baru. Pesanan yang sudah dikonfirmasi tetap dapat diproses.",
                    })}
                  </VStack>
                </>
              )}
            </VStack>
          </ServerForm>
        </LayoutContent>
      }
      footer={
        <LayoutFooter padding={6}>
          <HStack hAlign="between" gap={3}>
            <Button label="Batal" href={d.back_url} isDisabled={busy} />
            <Button
              form="stock-form"
              type="submit"
              variant="primary"
              label={
                mutation
                  ? count
                    ? "Simpan hasil hitung"
                    : "Catat barang masuk"
                  : "Simpan produk"
              }
              isLoading={busy}
            />
          </HStack>
        </LayoutFooter>
      }
    />
  );
}
