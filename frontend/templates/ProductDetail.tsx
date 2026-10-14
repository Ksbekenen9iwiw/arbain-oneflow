import { MotionPanel } from "../motion";
import { ProductIdentity } from "../ProductIdentity";
import { withReturn, backLabel } from "../navigation";
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Adapted from the scaffolded Astryx detail-page: header, content and end panel.
import { useState } from "react";
import { Layout, LayoutHeader, LayoutContent } from "@astryxdesign/core/Layout";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import {
  HStack,
  VStack,
  StackItem,
  Heading,
  Text,
  Link,
  Button,
  Fact,
  DataTable,
  Empty,
  Banner,
  Status,
  money,
  quantity,
  dateLabel,
} from "../ui";
import { useApp } from "../router";
import { StockCondition, MovementView, stockContext } from "./StockParts";
export default function ProductDetail() {
  const { page, navigate } = useApp();
  const d = page.data,
    p = d.product;
  const [panel, setPanel] = useState(true);
  const update = (changes: Record<string, string>) => {
    const params = new URLSearchParams(page.url.split("?")[1] || "");
    for (const [k, v] of Object.entries(changes))
      v ? params.set(k, v) : params.delete(k);
    void navigate(`/products/${p.id}/` + (params.size ? "?" + params : ""));
  };
  return (
    <Layout
      height="fill"
      defaultHasDividers
      header={
        <LayoutHeader padding={6}>
          <VStack gap={3}>
            <Link href={d.back_url} color="secondary">
              ← {backLabel(d.back_url)}
            </Link>
            <HStack gap={4} hAlign="between" vAlign="center">
              <StackItem size="fill">
                <ProductIdentity sku={p.sku} name={p.name} size="detail">
                  <VStack gap={2}>
                    <Heading level={1}>{p.name}</Heading>
                    <HStack gap={3} vAlign="center">
                      <Text color="secondary">
                        {p.sku} · {p.unit}
                      </Text>
                      <Status
                        value="DRAFT"
                        label={p.is_active ? "Aktif dijual" : "Nonaktif"}
                      />
                    </HStack>
                  </VStack>
                </ProductIdentity>
              </StackItem>
              {d.can_manage && (
                <HStack gap={2}>
                  <Button
                    label="Hitung & koreksi fisik"
                    href={stockContext(`/stock/${p.id}/reconcile/`, page.url)}
                  />
                  <Button
                    label="Barang masuk"
                    variant="primary"
                    href={stockContext(`/stock/${p.id}/receive/`, page.url)}
                  />
                </HStack>
              )}
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      end={
        panel ? (
          <MotionPanel width="17rem" padding={4} role="complementary">
            <VStack gap={4}>
              <HStack hAlign="between" vAlign="center">
                <Heading level={2}>Informasi</Heading>
                <Button
                  label="Sembunyikan"
                  variant="ghost"
                  onClick={() => setPanel(false)}
                />
              </HStack>
              <Fact label="Harga per satuan">
                {money(p.price)} / {p.unit}
              </Fact>
              <Fact label="Batas minimum">
                {quantity(p.min_stock)} {p.unit}
              </Fact>
              <Fact label="Status produk">
                {p.is_active
                  ? "Aktif dijual"
                  : "Nonaktif — tidak tersedia untuk pesanan baru"}
              </Fact>
              {d.can_manage && (
                <Button
                  label="Edit produk"
                  href={stockContext(`/products/${p.id}/edit/`, page.url)}
                />
              )}
            </VStack>
          </MotionPanel>
        ) : undefined
      }
      content={
        <LayoutContent padding={6} data-oneflow-scroll>
          <VStack gap={6}>
            <VStack gap={4} data-tour="product-overview">
              <HStack hAlign="between" vAlign="center">
                <Heading level={2}>Stok saat ini</Heading>
                {!panel && (
                  <Button
                    label="Informasi produk"
                    variant="ghost"
                    onClick={() => setPanel(true)}
                  />
                )}
              </HStack>
              <HStack gap={6} wrap="wrap">
                {d.can_manage && (
                  <>
                    <Fact label="Fisik">
                      {quantity(p.on_hand)} {p.unit}
                    </Fact>
                    <Fact label="Reservasi">
                      {quantity(p.reserved)} {p.unit}
                    </Fact>
                  </>
                )}
                <Fact label="Tersedia">
                  <Heading level={2}>
                    {quantity(p.available)} {p.unit}
                  </Heading>
                </Fact>
                <Fact label="Kondisi">
                  <StockCondition product={p} />
                </Fact>
              </HStack>
              <Text type="supporting">
                Tersedia = fisik − reservasi · Saldo diperbarui{" "}
                {dateLabel(p.updated_at, true)} WIB
              </Text>
              {p.stock_state === "conflict" && (
                <Banner
                  status="warning"
                  title="Fisik lebih kecil daripada reservasi"
                  description={
                    d.can_manage
                      ? "Catat jumlah fisik yang benar, lalu periksa pesanan pada tab Reservasi. Konfirmasi baru diblokir selama stok bebas negatif."
                      : "Koordinasikan dengan gudang. Konfirmasi baru diblokir selama stok bebas negatif."
                  }
                />
              )}
            </VStack>
            {d.can_manage && (
              <>
                <TabList
                  aria-label="Riwayat dan reservasi produk"
                  value={d.selected_section}
                  onChange={(section) => update({ section, page: "1" })}
                >
                  <Tab value="movements" label="Riwayat mutasi" />
                  <Tab
                    value="reservations"
                    label={`Reservasi (${d.reservations.length})`}
                  />
                </TabList>
                {d.selected_section === "movements" ? (
                  <MovementView data={d} update={update} singleProduct />
                ) : (
                  <VStack gap={4}>
                    <Text color="secondary">
                      Pesanan dikonfirmasi yang belum dikirim. Total alokasi:{" "}
                      {quantity(d.reservation_total)} {p.unit}.
                    </Text>
                    {d.reservation_total !== p.reserved && (
                      <Banner
                        status="warning"
                        title="Saldo reservasi berbeda dari alokasi pesanan"
                        description="Periksa pencatatan bersama tim. Koreksi fisik tidak mengubah reservasi."
                      />
                    )}
                    <DataTable
                      rows={d.reservations}
                      empty={
                        <Empty
                          title="Tidak ada pesanan yang mereservasi produk ini"
                          description="Reservasi dibuat setelah pesanan dikonfirmasi."
                        />
                      }
                      columns={[
                        {
                          key: "number",
                          header: "Pesanan",
                          renderCell: (r) => (
                            <Link
                              href={withReturn(
                                `/orders/${r.order.id}/`,
                                page.url,
                              )}
                            >
                              {r.order.number}
                            </Link>
                          ),
                        },
                        {
                          key: "customer",
                          header: "Pelanggan",
                          renderCell: (r) => (
                            <Text>{r.order.customer.name}</Text>
                          ),
                        },
                        {
                          key: "date",
                          header: "Dikonfirmasi",
                          renderCell: (r) => (
                            <Text>{dateLabel(r.order.confirmed_at)}</Text>
                          ),
                        },
                        {
                          key: "quantity",
                          header: "Dialokasikan",
                          align: "end",
                          renderCell: (r) => (
                            <Text hasTabularNumbers>
                              {quantity(r.quantity)} {p.unit}
                            </Text>
                          ),
                        },
                      ]}
                    />
                  </VStack>
                )}
              </>
            )}
          </VStack>
        </LayoutContent>
      }
    />
  );
}
