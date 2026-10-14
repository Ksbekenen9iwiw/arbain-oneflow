// Copyright (c) Meta Platforms, Inc. and affiliates.
// Adapted from Astryx 0.7.0 form-two-column: context alongside a single-submit form.
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";

import {
  VStack,
  HStack,
  dateLabel,
  Text,
  Heading,
  Button,
  PageHeader,
  SimpleForm,
  Fact,
  money,
  quantity,
  Banner,
} from "../ui";
import { useApp } from "../router";
export default function FormPage() {
  const { page, busy } = useApp();
  const d = page.data,
    product = d.stock_product || d.product;
  const editing = page.screen === "product_edit";
  return (
    <Layout
      height="fill"
      contentWidth={800}
      defaultHasDividers
      header={
        <PageHeader
          title={
            editing
              ? "Edit produk"
              : d.stock_mode === "count"
                ? "Hitung & koreksi fisik"
                : d.stock_mode === "receive"
                  ? "Barang masuk"
                  : d.heading
          }
          description={d.customer?.name || product?.name}
          back={{
            href: d.back_url || "/stock/",
            label: editing ? "Produk & stok" : "Kembali",
          }}
        />
      }
      content={
        <LayoutContent padding={6} data-oneflow-scroll>
          <VStack gap={6}>
            {d.activity && (
              <VStack gap={4}>
                <HStack gap={6}>
                  <Fact label="Aktivitas">{d.activity.kind_label}</Fact>
                  <Fact label="Jadwal">
                    {dateLabel(
                      d.activity.scheduled_date || d.activity.followup_date,
                    )}
                  </Fact>
                  <Fact label="Penanggung jawab">{d.activity.sales.name}</Fact>
                </HStack>
                <Text type="supporting">
                  Menyimpan hasil akan menandai aktivitas ini selesai. Isi
                  tanggal tindak lanjut jika perlu membuat aktivitas berikutnya.
                </Text>
                <Fact label="Catatan sebelumnya">
                  {d.activity.note || "Belum ada catatan"}
                </Fact>
              </VStack>
            )}
            {(product || d.help_text) && (
              <VStack gap={4}>
                {(d.help_text || editing) && (
                  <Text color="secondary">
                    {d.help_text ||
                      "Harga baru berlaku untuk pesanan berikutnya. Harga pada pesanan yang sudah dibuat tetap tersimpan."}
                  </Text>
                )}
                {product && (
                  <HStack gap={6} wrap="wrap">
                    <Fact label="Identitas produk">
                      {product.sku} · {product.unit}
                    </Fact>
                    <Fact label="Stok tersedia">
                      {quantity(product.available)} {product.unit}
                    </Fact>
                    {product.on_hand !== undefined && (
                      <Fact label="Fisik / direservasi">
                        {quantity(product.on_hand)} /{" "}
                        {quantity(product.reserved)}
                      </Fact>
                    )}
                    {editing && (
                      <Fact label="Harga saat ini">
                        {money(d.original_price)}
                      </Fact>
                    )}
                  </HStack>
                )}
                {d.stock_mode === "count" && (
                  <Banner
                    status="warning"
                    title="Masukkan jumlah fisik, bukan selisih"
                    description="Koreksi tidak menghapus reservasi pesanan yang sudah dikonfirmasi."
                  />
                )}
              </VStack>
            )}
            <SimpleForm
              spec={d.form}
              id="record-form"
              hideSubmit
              preview={(values) => {
                const raw = String(
                  values[
                    editing
                      ? "price_rupiah"
                      : d.stock_mode === "count"
                        ? "counted_quantity"
                        : "quantity"
                  ] ?? "",
                );
                if (!/^\d+$/.test(raw) || (!editing && !d.stock_mode))
                  return null;
                const next = BigInt(raw);
                if (editing) {
                  const delta = next - BigInt(d.original_price);
                  return (
                    <Fact label="Pratinjau harga baru">
                      {money(raw)} · {delta > 0n ? "+" : ""}
                      {money(delta.toString())} dari harga tersimpan
                    </Fact>
                  );
                }
                const physical =
                  d.stock_mode === "count"
                    ? next
                    : BigInt(product.on_hand) + next;
                const available = physical - BigInt(product.reserved);
                return (
                  <Banner
                    status={available < 0n ? "warning" : "info"}
                    title={`Setelah disimpan: fisik ${quantity(physical.toString())}, tersedia ${quantity(available.toString())}`}
                    description={
                      available < 0n
                        ? "Jumlah fisik di bawah reservasi. Konfirmasi baru untuk produk ini akan diblokir."
                        : "Pratinjau berdasarkan saldo saat halaman dimuat; server memeriksa saldo terbaru."
                    }
                  />
                );
              }}
            />
          </VStack>
        </LayoutContent>
      }
      footer={
        <LayoutFooter padding={6}>
          <HStack hAlign="between" gap={3}>
            <Button
              label="Batal"
              href={d.back_url || "/stock/"}
              isDisabled={busy}
            />
            <Button
              form="record-form"
              type="submit"
              variant={
                page.url.includes("/cancel/") ? "destructive" : "primary"
              }
              isLoading={busy}
              label={
                d.submit_label ||
                (editing
                  ? "Simpan produk"
                  : d.stock_mode === "count"
                    ? "Simpan hasil hitung"
                    : d.stock_mode === "receive"
                      ? "Catat barang masuk"
                      : page.url.includes("/cancel/")
                        ? "Batalkan pesanan"
                        : "Simpan")
              }
            />
          </HStack>
        </LayoutFooter>
      }
    />
  );
}
