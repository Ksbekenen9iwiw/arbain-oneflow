import { proportional } from "@astryxdesign/core/Table";
import { Grid } from "@astryxdesign/core/Grid";
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
  BatchStatus,
  ServerForm,
  money,
  quantity,
  dateLabel,
} from "../ui";
import { useApp } from "../router";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { FormDialog, SimpleForm } from "../ui";
import type { Row } from "../types";
import { StockCondition, MovementView, stockContext } from "./StockParts";
export default function ProductDetail() {
  const { page, navigate, busy, clearDirty } = useApp();
  const d = page.data,
    p = d.product;
  const [panel, setPanel] = useState(false);
  const [supplyDialog, setSupplyDialog] = useState<{
    open: string;
    po: string;
  }>({
    open: d.dialog || "",
    po: d.dialog_po || "",
  });
  const closeSupplyDialog = (open: boolean) => {
    if (!open && !busy) {
      clearDirty();
      setSupplyDialog({ open: "", po: "" });
    }
  };
  const receiveSpec = () => {
    if (supplyDialog.open === "receive" && d.receive_form)
      return d.receive_form;
    const entry = (d.receive_forms || []).find(
      (form: Row) => form.id === supplyDialog.po,
    );
    return entry ? entry.form : null;
  };
  const supplyForm = () =>
    supplyDialog.open === "settings" && d.supply_form ? (
      <SimpleForm
        spec={d.supply_form}
        action={withReturn(`/products/${p.id}/supply/settings/`, d.back_url)}
        label="Simpan pengaturan"
        fullWidth
      />
    ) : supplyDialog.open === "purchase" && d.purchase_form ? (
      <SimpleForm
        spec={d.purchase_form}
        action={withReturn(`/products/${p.id}/supply/orders/`, d.back_url)}
        label="Catat pengadaan"
      />
    ) : supplyDialog.open === "receive" && receiveSpec() ? (
      <SimpleForm
        spec={receiveSpec()}
        action={withReturn(
          `/supply/orders/${supplyDialog.po}/receive/`,
          d.back_url,
        )}
        label="Simpan penerimaan"
      />
    ) : supplyDialog.open === "cancel" && d.cancel_form ? (
      <SimpleForm
        spec={d.cancel_form}
        action={withReturn(
          `/supply/orders/${supplyDialog.po}/cancel/`,
          d.back_url,
        )}
        label="Batalkan pengadaan"
        variant="destructive"
      />
    ) : null;
  const update = (changes: Record<string, string>) => {
    const params = new URLSearchParams(page.url.split("?")[1] || "");
    for (const [k, v] of Object.entries(changes))
      v ? params.set(k, v) : params.delete(k);
    void navigate(`/products/${p.id}/` + (params.size ? "?" + params : ""));
  };
  return (
    <>
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
                    variant="secondary"
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
                      variant="secondary"
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
                  <Fact label="Stok bebas">
                    <Heading level={2}>
                      {quantity(p.available)} {p.unit}
                    </Heading>
                  </Fact>
                  <Fact label="Kondisi">
                    <StockCondition product={p} />
                  </Fact>
                </HStack>
                <Text type="supporting">
                  Stok bebas = fisik − reservasi; belum mengecualikan batch
                  ditahan atau kedaluwarsa. Diperbarui{" "}
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
                    aria-label="Detail persediaan"
                    value={d.selected_section}
                    onChange={(section) => update({ section, page: "1" })}
                    hasDivider
                  >
                    <Tab
                      value="batches"
                      label={`Batch & kedaluwarsa (${d.batches.length})`}
                    />
                    <Tab value="supply" label="Pengadaan" />
                    <Tab value="movements" label="Riwayat mutasi" />
                    <Tab
                      value="reservations"
                      label={`Reservasi (${d.reservations.length})`}
                    />
                  </TabList>
                  {d.selected_section === "batches" && (
                    <VStack gap={4} data-tour="product-batches">
                      <VStack gap={1}>
                        <Heading level={2}>Batch & masa simpan</Heading>
                        <Text type="supporting">
                          FEFO mengambil batch dengan tanggal kedaluwarsa
                          terdekat lebih dahulu. Stok ditahan atau kedaluwarsa
                          tetap tercatat fisik tetapi tidak dapat dialokasikan.
                        </Text>
                      </VStack>
                      <HStack gap={6} wrap="wrap">
                        <Fact label="Fisik">
                          {quantity(d.batch_summary.on_hand)} {p.unit}
                        </Fact>
                        <Fact label="Dicadangkan">
                          {quantity(d.batch_summary.reserved)} {p.unit}
                        </Fact>
                        <Fact label="Stok bebas">
                          {quantity(d.batch_summary.available)} {p.unit}
                        </Fact>
                        <Fact label="Ditahan / kedaluwarsa">
                          {quantity(d.batch_summary.ineligible)} {p.unit}
                        </Fact>
                        <Fact label="Minimum sisa masa simpan">
                          {d.shelf_life_days === null ||
                          d.shelf_life_days === undefined
                            ? "Perlu konfigurasi"
                            : `${quantity(d.shelf_life_days)} hari`}
                        </Fact>
                      </HStack>
                      {(d.shelf_life_days === null ||
                        d.shelf_life_days === undefined) && (
                        <Banner
                          status="warning"
                          title="Masa simpan minimum belum dikonfigurasi"
                          description="FEFO berjalan tanpa syarat masa simpan. Isi minimum sisa masa simpan pada Edit produk sesuai kebijakan yang berlaku."
                        />
                      )}
                      <DataTable
                        rows={d.batches}
                        empty={
                          <Empty
                            title="Belum ada batch"
                            description="Catat barang masuk dengan kode batch dan tanggal kedaluwarsa."
                          />
                        }
                        columns={[
                          {
                            key: "code",
                            width: proportional(1.7, { minWidth: 136 }),
                            header: "Kode batch",
                            renderCell: (r) => (
                              <VStack gap={1}>
                                <Text weight="medium">{r.code}</Text>
                                {!r.is_complete && (
                                  <Text type="supporting">Belum lengkap</Text>
                                )}
                              </VStack>
                            ),
                          },
                          {
                            key: "received_date",
                            width: proportional(1.2, { minWidth: 96 }),
                            header: "Diterima",
                            renderCell: (r) => (
                              <Text>{dateLabel(r.received_date)}</Text>
                            ),
                          },
                          {
                            key: "expiry_date",
                            width: proportional(1.4, { minWidth: 112 }),
                            header: "Kedaluwarsa",
                            renderCell: (r) => (
                              <VStack gap={1}>
                                <Text>{dateLabel(r.expiry_date)}</Text>
                                <Text type="supporting">
                                  {r.is_expired
                                    ? "Sudah kedaluwarsa"
                                    : r.days_left == null
                                      ? "Tanggal belum diisi"
                                      : `${quantity(r.days_left)} hari lagi`}
                                </Text>
                              </VStack>
                            ),
                          },
                          {
                            key: "on_hand",
                            width: proportional(0.8, { minWidth: 64 }),
                            header: "Fisik",
                            align: "end",
                            renderCell: (r) => (
                              <Text hasTabularNumbers>
                                {quantity(r.on_hand)}
                              </Text>
                            ),
                          },
                          {
                            key: "reserved",
                            width: proportional(1.2, { minWidth: 96 }),
                            header: "Reservasi",
                            align: "end",
                            renderCell: (r) => (
                              <Text hasTabularNumbers>
                                {quantity(r.reserved)}
                              </Text>
                            ),
                          },
                          {
                            key: "available",
                            width: proportional(1.2, { minWidth: 96 }),
                            header: "Stok bebas",
                            align: "end",
                            renderCell: (r) => (
                              <Text hasTabularNumbers>
                                {quantity(r.available)}
                              </Text>
                            ),
                          },
                          {
                            key: "status",
                            width: proportional(2.75, { minWidth: 220 }),
                            header: "Status",
                            renderCell: (r) => (
                              <BatchStatus batch={r} today={page.today} />
                            ),
                          },
                          {
                            key: "batch_action",
                            width: proportional(1.2, { minWidth: 96 }),
                            header: "Tindakan",
                            renderCell: (r) => (
                              <ServerForm
                                action={`/products/${p.id}/batches/${r.id}/status/`}
                              >
                                <input
                                  type="hidden"
                                  name="status"
                                  value={
                                    r.status === "HELD" ? "ACTIVE" : "HELD"
                                  }
                                />
                                <Button
                                  size="sm"
                                  type="submit"
                                  variant="secondary"
                                  label={
                                    r.status === "HELD" ? "Aktifkan" : "Tahan"
                                  }
                                />
                              </ServerForm>
                            ),
                          },
                        ]}
                      />
                    </VStack>
                  )}
                  {d.selected_section === "supply" && (
                    <VStack gap={4} data-tour="product-supply">
                      <VStack gap={1}>
                        <HStack hAlign="between" vAlign="center">
                          <Heading level={2}>Perencanaan pasokan</Heading>
                          {page.role === "MANAGER" && (
                            <Button
                              label="Catat pengadaan"
                              variant="secondary"
                              onClick={() =>
                                setSupplyDialog({ open: "purchase", po: "" })
                              }
                            />
                          )}
                        </HStack>
                        <Text type="supporting">
                          Rata-rata harian memakai unit terkirim pada hari
                          kalender penuh; stok layak mengikuti aturan FEFO.
                          Rekomendasi hanya saran — keputusan tetap pada Anda.
                        </Text>
                      </VStack>
                      {d.error && (
                        <Banner
                          status="error"
                          title="Tindakan belum berhasil"
                          description={d.error.message}
                        />
                      )}
                      {!d.supply.configured ? (
                        <Banner
                          status="warning"
                          title="Atur kebutuhan produk terlebih dahulu"
                          description={
                            page.role === "MANAGER"
                              ? "Pilih periode penjualan, waktu pengisian ulang, target cakupan, dan cadangan agar saran jumlah dapat dihitung."
                              : "Manajer perlu mengisi pengaturan produk sebelum rekomendasi tersedia. Anda tetap dapat mencatat penerimaan pengadaan."
                          }
                        />
                      ) : (
                        <VStack gap={4}>
                          <HStack gap={4} vAlign="center" hAlign="between">
                            <VStack gap={2}>
                              <Text type="supporting">Saran tambahan stok</Text>
                              <Heading level={2}>
                                {d.supply.recommend_quantity == null
                                  ? "Belum dapat dihitung"
                                  : `${quantity(d.supply.recommend_quantity)} ${p.unit}`}
                              </Heading>
                              <Text color="secondary">
                                {d.supply.stockout_date
                                  ? `Proyeksi habis ${dateLabel(d.supply.stockout_date)} · periksa jadwal kedatangan.`
                                  : Number(d.supply.recommend_quantity) > 0
                                    ? `Pesan sekarang · waktu pengisian ulang ${d.supply.config.lead_time_days} hari.`
                                    : "Tinjau laju penjualan dan stok sebelum menambah pengadaan."}
                              </Text>
                            </VStack>
                            <Status value={d.supply.risk} />
                          </HStack>
                          {d.supply.risk === "RISIKO_KOSONG_TERLAMBAT" && (
                            <Banner
                              status="warning"
                              title="Periksa jadwal pengadaan berjalan"
                              description={`Cocokkan estimasi tiba dengan proyeksi stok habis${d.supply.stockout_date ? ` pada ${dateLabel(d.supply.stockout_date)}` : ""}. Pengadaan yang terlambat perlu dikonfirmasi ulang ke pemasok.`}
                            />
                          )}
                          <Grid columns={4} gap={4}>
                            <Fact label="Stok layak">
                              {d.supply.eligible == null
                                ? "—"
                                : `${quantity(d.supply.eligible)} ${p.unit}`}
                            </Fact>
                            <Fact label="Penjualan rata-rata">
                              {d.supply.velocity
                                ? `${d.supply.velocity.rate} ${p.unit}/hari`
                                : "—"}
                            </Fact>
                            <Fact label="Cukup untuk">
                              {d.supply.coverage_days == null
                                ? "Belum dapat dihitung"
                                : `${d.supply.coverage_days} hari`}
                            </Fact>
                            <Fact label="Sedang dipesan">
                              {quantity(d.supply.outstanding_units)} {p.unit}
                            </Fact>
                          </Grid>
                          <Text type="supporting">
                            Periode {d.supply.config.analysis_period_days} hari
                            · Target {d.supply.config.coverage_target_days} hari
                            · Cadangan {d.supply.config.safety_stock_days} hari
                            · Batas pemicu {d.supply.trigger ?? "—"} {p.unit}
                          </Text>
                        </VStack>
                      )}
                      {(d.supply.reasons || []).length > 0 && (
                        <Collapsible
                          trigger="Alasan perhitungan"
                          defaultIsOpen={false}
                        >
                          <VStack gap={2}>
                            {d.supply.reasons.map((reason: string) => (
                              <Text key={reason}>{reason}</Text>
                            ))}
                            {d.supply.caveats.map((caveat: string) => (
                              <Text key={caveat} type="supporting">
                                ⚠ {caveat}
                              </Text>
                            ))}
                          </VStack>
                        </Collapsible>
                      )}
                      {page.role === "MANAGER" && d.supply_form && (
                        <HStack>
                          <Button
                            label={
                              d.supply.configured
                                ? "Ubah pengaturan perhitungan"
                                : "Atur perhitungan"
                            }
                            onClick={() =>
                              setSupplyDialog({ open: "settings", po: "" })
                            }
                          />
                        </HStack>
                      )}
                      <Heading level={3}>Pengadaan tercatat</Heading>
                      <DataTable
                        rows={d.purchase_orders}
                        empty={
                          <Empty
                            title="Belum ada catatan pengadaan"
                            description="Catat pengadaan terkonfirmasi agar ikut dihitung dalam proyeksi."
                          />
                        }
                        columns={[
                          { key: "number", header: "Ref" },
                          {
                            key: "ordered",
                            header: "Dipesan",
                            align: "end",
                            renderCell: (r) => (
                              <Text hasTabularNumbers>
                                {quantity(r.ordered)}
                              </Text>
                            ),
                          },
                          {
                            key: "received",
                            header: "Diterima",
                            align: "end",
                            renderCell: (r) => (
                              <Text hasTabularNumbers>
                                {quantity(r.received)} / sisa{" "}
                                {quantity(r.remaining)}
                              </Text>
                            ),
                          },
                          {
                            key: "expected_date",
                            header: "Estimasi tiba",
                            renderCell: (r) => (
                              <Text>
                                {r.expected_date
                                  ? dateLabel(r.expected_date)
                                  : "Belum tercatat"}
                              </Text>
                            ),
                          },
                          {
                            key: "status",
                            header: "Status",
                            renderCell: (r) => (
                              <Status
                                value={r.status}
                                label={
                                  r.status === "CONFIRMED" &&
                                  Number(r.received) > 0
                                    ? "Diterima sebagian"
                                    : r.status_label
                                }
                              />
                            ),
                          },
                          {
                            key: "note",
                            header: "Referensi",
                            renderCell: (r) => <Text>{r.note || "—"}</Text>,
                          },
                          {
                            key: "action",
                            header: "Tindakan",
                            renderCell: (r) => (
                              <HStack gap={2}>
                                {r.status === "CONFIRMED" &&
                                  Number(r.remaining) > 0 && (
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      label="Catat penerimaan"
                                      onClick={() =>
                                        setSupplyDialog({
                                          open: "receive",
                                          po: r.id,
                                        })
                                      }
                                    />
                                  )}
                                {page.role === "MANAGER" &&
                                  r.status === "CONFIRMED" &&
                                  Number(r.received) === 0 && (
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      label="Batalkan"
                                      onClick={() =>
                                        setSupplyDialog({
                                          open: "cancel",
                                          po: r.id,
                                        })
                                      }
                                    />
                                  )}
                              </HStack>
                            ),
                          },
                        ]}
                      />
                    </VStack>
                  )}
                  {d.selected_section === "movements" && (
                    <MovementView data={d} update={update} singleProduct />
                  )}
                  {d.selected_section === "reservations" && (
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
      <FormDialog
        isOpen={!!supplyDialog.open}
        onOpenChange={closeSupplyDialog}
        title={
          supplyDialog.open === "settings"
            ? "Pengaturan pengadaan"
            : supplyDialog.open === "purchase"
              ? "Catat pengadaan terkonfirmasi"
              : supplyDialog.open === "receive"
                ? "Catat penerimaan pengadaan"
                : "Batalkan pengadaan"
        }
      >
        <VStack padding={6} gap={4}>
          <Text type="supporting">
            {supplyDialog.open === "settings"
              ? "Parameter berlaku untuk produk ini. Perubahan menghitung ulang saran tanpa membuat pesanan pengadaan."
              : supplyDialog.open === "purchase"
                ? "Catat barang yang sudah dipesan. Stok bertambah setelah penerimaan dicatat."
                : supplyDialog.open === "receive"
                  ? "Isi jumlah yang benar-benar diterima beserta batch dan kedaluwarsanya. Sisa pengadaan tetap terbuka."
                  : "Pembatalan tidak mengubah stok fisik. Sertakan alasan untuk riwayat."}
          </Text>
          {d.error && <Banner status="error" title={d.error.message} />}
          {supplyForm()}
        </VStack>
      </FormDialog>
    </>
  );
}
