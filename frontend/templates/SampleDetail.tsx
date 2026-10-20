import { List, ListItem } from "@astryxdesign/core/List";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { MotionPanel, MotionStack } from "../motion";
import { ProductIdentity } from "../ProductIdentity";
import { sampleJourney } from "../sampleJourney";
import { useQueryState } from "../router";
import { useState } from "react";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Divider } from "@astryxdesign/core/Divider";
import {
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  Link,
  PageHeader,
  Status,
  Banner,
  Fact,
  DataTable,
  Empty,
  FormDialog,
  SimpleForm,
  ServerForm,
  dateLabel,
  money,
  quantity,
} from "../ui";
import { useApp } from "../router";
import { withReturn, backLabel } from "../navigation";
import type { Row } from "../types";

export default function SampleDetail() {
  const { page, busy, clearDirty } = useApp();
  const d = page.data;
  const sample = d.sample;
  const journey = sampleJourney(sample, page.role || "");
  const [requestedTab, setTab] = useQueryState("tab", "products");
  const tab = ["products", "evidence", "history"].includes(requestedTab)
    ? requestedTab
    : "products";
  const [dialog, setDialog] = useState(d.dialog || "");
  const actionUrl = (action: string) =>
    withReturn(`/samples/${sample.id}/${action}/`, d.back_url);
  const close = (open: boolean) => {
    if (!open && !busy) {
      clearDirty();
      setDialog("");
    }
  };
  const allocationRows = sample.lines.flatMap((line: Row) =>
    (line.allocations || []).map((allocation: Row) => ({
      ...allocation,
      id: `${line.id}-${allocation.id}`,
      product_sku: line.product.sku,
      unit: line.product.unit,
    })),
  );
  return (
    <>
      <Layout
        height="fill"
        defaultHasDividers
        header={
          <PageHeader
            title={sample.number}
            description={`${sample.customer.name} · ${sample.sales.name}`}
            back={{ href: d.back_url, label: backLabel(d.back_url) }}
            actions={
              <HStack gap={2} wrap="wrap">
                {d.can_edit && (
                  <Button
                    label="Edit draf"
                    href={withReturn(`/samples/${sample.id}/edit/`, d.back_url)}
                  />
                )}
                {d.can_submit && (
                  <Button
                    label="Ajukan"
                    variant="primary"
                    onClick={() => setDialog("submit")}
                  />
                )}
                {d.can_decide && (
                  <Button
                    label="Tinjau & putuskan"
                    variant="primary"
                    onClick={() => setDialog("decision")}
                  />
                )}
                {d.can_ship && (
                  <Button
                    label="Tandai dikirim"
                    variant="primary"
                    onClick={() => setDialog("ship")}
                  />
                )}
                {d.can_receive && (
                  <Button
                    label="Tandai diterima"
                    variant="primary"
                    onClick={() => setDialog("receive")}
                  />
                )}
                {d.can_followup && (
                  <Button
                    label="Jadwalkan tindak lanjut"
                    onClick={() => setDialog("schedule")}
                  />
                )}
                {d.can_followup && (
                  <Button
                    label="Catat hasil"
                    onClick={() => setDialog("outcome")}
                  />
                )}
                {d.can_cancel && (
                  <Button
                    label="Batalkan pengajuan"
                    variant="secondary"
                    onClick={() => setDialog("cancel")}
                  />
                )}
              </HStack>
            }
          />
        }
        end={
          <MotionPanel width="20rem" padding={5} role="complementary">
            <VStack gap={5}>
              <VStack gap={2}>
                <Heading level={2}>Pelanggan</Heading>
                {page.role === "WAREHOUSE" ? (
                  <Text weight="semibold">{sample.customer.name}</Text>
                ) : (
                  <Link
                    weight="semibold"
                    href={withReturn(
                      `/customers/${sample.customer.id}/`,
                      page.url,
                    )}
                  >
                    {sample.customer.name}
                  </Link>
                )}
                <Text type="supporting">
                  {sample.customer.phone || "Nomor belum diisi"}
                </Text>
                <Text type="supporting">
                  {sample.customer.address || "Alamat belum diisi"}
                </Text>
              </VStack>
              <Divider />
              {sample.decided_at && (
                <VStack gap={2}>
                  <Heading level={2}>Keputusan manajer</Heading>
                  <Status
                    value={
                      sample.status === "REJECTED" ? "REJECTED" : "APPROVED"
                    }
                  />
                  <Text>
                    {sample.decision_note || "Sesuai rekomendasi sistem."}
                  </Text>
                  <Text type="supporting">
                    {sample.decided_by?.name} · {dateLabel(sample.decided_at)}
                  </Text>
                </VStack>
              )}
              <VStack gap={3}>
                <Heading level={2}>
                  {sample.decided_at
                    ? "Dasar rekomendasi"
                    : "Rekomendasi sistem"}
                </Heading>
                {!d.policy.configured && (
                  <Banner
                    status="warning"
                    title="Kebijakan belum dikonfigurasi"
                    description="Manajer tetap dapat meninjau manual atau membuka pengaturan kebijakan sampel."
                  />
                )}
                <Status
                  value={d.recommendation.result}
                  label={d.recommendation.label}
                />
                {(d.recommendation.reasons || []).map((reason: string) => (
                  <Text key={reason}>{reason}</Text>
                ))}
                <Text type="supporting">
                  Dasar pengulangan memakai riwayat produk yang sama. Buka tab
                  Riwayat pelanggan untuk memeriksa bukti pendukung.
                </Text>
                {page.role === "MANAGER" && (
                  <Button
                    href={withReturn("/samples/policy/", page.url)}
                    label="Atur kebijakan"
                    size="sm"
                    variant="secondary"
                  />
                )}
              </VStack>

              <Button
                label="Lihat riwayat pendukung"
                onClick={() => setTab("evidence")}
              />
            </VStack>
          </MotionPanel>
        }
        content={
          <LayoutContent padding={6} data-oneflow-scroll>
            <VStack gap={6}>
              {d.error && (
                <Banner
                  status="error"
                  title="Tindakan belum berhasil"
                  description={d.error.message}
                />
              )}
              <VStack gap={2} data-tour="sample-overview">
                <Heading level={2}>{journey.title}</Heading>
                <Text color="secondary">{journey.description}</Text>
              </VStack>
              <HStack gap={6} wrap="wrap">
                <Fact label="Status pengajuan">
                  <Status value={sample.status} label={sample.status_label} />
                </Fact>
                <Fact label="Pemenuhan">
                  <Status
                    value={sample.fulfillment_status}
                    label={sample.fulfillment_label}
                  />
                </Fact>
                <Fact label="Hasil tindak lanjut">{sample.outcome_label}</Fact>
                <Fact label="Dibuat">{dateLabel(sample.created_at)}</Fact>
              </HStack>
              <TabList
                aria-label="Detail sampel"
                role="tablist"
                value={tab}
                onChange={setTab}
                hasDivider
              >
                <Tab
                  value="products"
                  label="Pengajuan & produk"
                  panelId="sample-products"
                />
                <Tab
                  value="evidence"
                  label="Riwayat pelanggan"
                  panelId="sample-evidence"
                />
                <Tab
                  value="history"
                  label="Jejak proses"
                  panelId="sample-history"
                />
              </TabList>
              {tab === "products" && (
                <MotionStack
                  gap={6}
                  motionKey={tab}
                  id="sample-products"
                  role="tabpanel"
                  aria-label="Pengajuan & produk"
                >
                  <VStack gap={4}>
                    <Heading level={2}>Produk sampel</Heading>
                    <DataTable
                      rows={sample.lines}
                      columns={[
                        {
                          key: "sku",
                          header: "Produk",
                          renderCell: (row) => (
                            <ProductIdentity
                              name={row.product.name}
                              sku={row.product.sku}
                            >
                              <VStack gap={1}>
                                <Text weight="semibold">
                                  {row.product.name}
                                </Text>
                                <Text type="supporting">{row.product.sku}</Text>
                              </VStack>
                            </ProductIdentity>
                          ),
                        },
                        {
                          key: "quantity",
                          header: "Jumlah",
                          align: "end",
                          renderCell: (row) => (
                            <Text hasTabularNumbers>
                              {quantity(row.quantity)} {row.product.unit}
                            </Text>
                          ),
                        },
                      ]}
                    />
                    {allocationRows.length > 0 && (
                      <VStack gap={3}>
                        <Heading level={3}>Alokasi pengambilan gudang</Heading>
                        <DataTable
                          rows={allocationRows}
                          columns={[
                            { key: "product_sku", header: "Produk" },
                            { key: "batch_code", header: "Batch" },
                            {
                              key: "expiry_date",
                              header: "Kedaluwarsa",
                              renderCell: (row) => (
                                <Text>
                                  {row.expiry_date
                                    ? dateLabel(row.expiry_date)
                                    : "Belum tercatat"}
                                </Text>
                              ),
                            },
                            {
                              key: "quantity",
                              header: "Ambil",
                              align: "end",
                              renderCell: (row) => (
                                <Text>
                                  {quantity(row.quantity)} {row.unit}
                                </Text>
                              ),
                            },
                            {
                              key: "status",
                              header: "Status",
                              renderCell: (row) => (
                                <Status
                                  value={
                                    row.expiry_date &&
                                    row.expiry_date < page.today
                                      ? "OVERDUE"
                                      : row.status
                                  }
                                  label={
                                    row.expiry_date &&
                                    row.expiry_date < page.today
                                      ? "Kedaluwarsa"
                                      : row.status_label
                                  }
                                />
                              ),
                            },
                          ]}
                        />
                      </VStack>
                    )}
                  </VStack>
                  <VStack gap={4}>
                    <Heading level={2}>Dasar pengajuan</Heading>
                    <Fact label="Tujuan pemberian">
                      {sample.purpose || "Belum tercatat"}
                    </Fact>
                    <Fact label="Kebutuhan pelanggan">
                      {sample.customer_need || "Belum tercatat"}
                    </Fact>
                    <Fact label="Potensi pesanan">
                      {sample.potential_orders || "Belum tercatat"}
                    </Fact>
                    <Fact label="Profil usaha">
                      {sample.business_profile || "Belum tercatat"}
                    </Fact>
                    <Fact label="Catatan pendukung">
                      {sample.notes || "Belum tercatat"}
                    </Fact>
                  </VStack>
                </MotionStack>
              )}
              {tab === "evidence" && (
                <MotionStack
                  gap={6}
                  motionKey={tab}
                  id="sample-evidence"
                  role="tabpanel"
                  aria-label="Riwayat pelanggan"
                >
                  <VStack gap={4}>
                    <Heading level={2}>Riwayat pelanggan</Heading>
                    {!d.history.has_history ? (
                      <Empty
                        title="Belum ada riwayat"
                        description="Calon pelanggan baru tidak otomatis dianggap memiliki track record buruk."
                      />
                    ) : (
                      <>
                        <HStack gap={6} wrap="wrap">
                          <Fact label="Pembelian terkirim">
                            {quantity(d.history.purchase_count)}
                          </Fact>
                          <Fact label="Nilai pembelian">
                            {money(d.history.purchase_total)}
                          </Fact>
                          <Fact label="Transaksi terakhir">
                            {d.history.last_purchase_at
                              ? dateLabel(d.history.last_purchase_at)
                              : "Belum tercatat"}
                          </Fact>
                        </HStack>
                        <Heading level={3}>Pengajuan sebelumnya</Heading>
                        <DataTable
                          rows={d.history.previous_samples}
                          empty={
                            <Empty title="Belum ada pengajuan sampel sebelumnya" />
                          }
                          columns={[
                            {
                              key: "number",
                              header: "Pengajuan",
                              renderCell: (row) => (
                                <Link
                                  href={withReturn(
                                    `/samples/${row.id}/`,
                                    page.url,
                                  )}
                                >
                                  {row.number}
                                </Link>
                              ),
                            },
                            {
                              key: "created_at",
                              header: "Tanggal",
                              renderCell: (row) => (
                                <Text>{dateLabel(row.created_at)}</Text>
                              ),
                            },
                            {
                              key: "status",
                              header: "Keputusan",
                              renderCell: (row) => (
                                <Status
                                  value={row.status}
                                  label={row.status_label}
                                />
                              ),
                            },
                            {
                              key: "fulfillment_status",
                              header: "Pemenuhan",
                              renderCell: (row) => (
                                <Text>{row.fulfillment_label}</Text>
                              ),
                            },
                            {
                              key: "outcome",
                              header: "Hasil",
                              renderCell: (row) => (
                                <Text>{row.outcome_label}</Text>
                              ),
                            },
                          ]}
                        />
                        <Heading level={3}>Sampel yang diterima</Heading>
                        <DataTable
                          rows={d.history.received_samples}
                          empty={<Empty title="Belum ada sampel diterima" />}
                          columns={[
                            { key: "number", header: "Pengajuan" },
                            {
                              key: "received_at",
                              header: "Diterima",
                              renderCell: (row) => (
                                <Text>{dateLabel(row.received_at)}</Text>
                              ),
                            },
                            {
                              key: "products",
                              header: "Produk & jumlah",
                              renderCell: (row) => (
                                <VStack gap={1}>
                                  {row.lines.map((line: Row) => (
                                    <Text key={line.id}>
                                      {line.product.name} ·{" "}
                                      {quantity(line.quantity)}{" "}
                                      {line.product.unit}
                                    </Text>
                                  ))}
                                </VStack>
                              ),
                            },
                            {
                              key: "outcome",
                              header: "Hasil",
                              renderCell: (row) => (
                                <Text>{row.outcome_label}</Text>
                              ),
                            },
                          ]}
                        />
                        <Heading level={3}>Tindak lanjut & tanggapan</Heading>
                        <DataTable
                          rows={d.history.followups}
                          empty={
                            <Empty title="Belum ada tindak lanjut tercatat" />
                          }
                          columns={[
                            { key: "request_number", header: "Pengajuan" },
                            {
                              key: "followup_date",
                              header: "Tanggal",
                              renderCell: (row) => (
                                <Text>{dateLabel(row.followup_date)}</Text>
                              ),
                            },
                            {
                              key: "response",
                              header: "Tanggapan",
                              renderCell: (row) => (
                                <Text>{row.response || "Belum tercatat"}</Text>
                              ),
                            },
                            {
                              key: "outcome",
                              header: "Evaluasi",
                              renderCell: (row) => (
                                <Text>{row.outcome_label}</Text>
                              ),
                            },
                            {
                              key: "note",
                              header: "Catatan",
                              renderCell: (row) => (
                                <Text>{row.note || "Belum tercatat"}</Text>
                              ),
                            },
                          ]}
                        />
                        <Heading level={3}>Pembelian yang ditautkan</Heading>
                        <DataTable
                          rows={d.history.linked_orders}
                          empty={
                            <Empty title="Belum ada pembelian yang ditautkan" />
                          }
                          columns={[
                            {
                              key: "number",
                              header: "Pesanan",
                              renderCell: (row) => (
                                <Link
                                  href={withReturn(
                                    `/orders/${row.id}/`,
                                    page.url,
                                  )}
                                >
                                  {row.number}
                                </Link>
                              ),
                            },
                            {
                              key: "total",
                              header: "Nilai",
                              align: "end",
                              renderCell: (row) => (
                                <Text>{money(row.total)}</Text>
                              ),
                            },
                          ]}
                        />
                      </>
                    )}
                  </VStack>
                </MotionStack>
              )}
              {tab === "history" && (
                <MotionStack
                  gap={3}
                  motionKey={tab}
                  id="sample-history"
                  role="tabpanel"
                  aria-label="Jejak proses"
                >
                  <Heading level={2}>Jejak proses</Heading>
                  <Text>
                    Draf dibuat · {dateLabel(sample.created_at, true)} ·{" "}
                    {sample.sales.name}
                  </Text>

                  {sample.decided_at && (
                    <Text>
                      Keputusan · {dateLabel(sample.decided_at, true)} ·{" "}
                      {sample.decided_by?.name}
                      {sample.decision_note ? ` · ${sample.decision_note}` : ""}
                    </Text>
                  )}
                  {sample.shipped_at && (
                    <Text>
                      Dikirim · {dateLabel(sample.shipped_at, true)} ·{" "}
                      {sample.shipped_by?.name}
                    </Text>
                  )}
                  {sample.received_at && (
                    <Text>
                      Diterima · {dateLabel(sample.received_at, true)} ·{" "}
                      {sample.received_by?.name}
                    </Text>
                  )}
                  {sample.cancelled_at && (
                    <Text>
                      Dibatalkan · {dateLabel(sample.cancelled_at, true)} ·{" "}
                      {sample.cancel_reason}
                    </Text>
                  )}
                  <VStack gap={3} paddingBlockStart={4}>
                    <Heading level={3}>Tindak lanjut pengajuan ini</Heading>
                    {d.history.followups.some(
                      (row: Row) => row.request_number === sample.number,
                    ) ? (
                      <List hasDividers density="balanced">
                        {d.history.followups
                          .filter(
                            (row: Row) => row.request_number === sample.number,
                          )
                          .map((row: Row) => (
                            <ListItem
                              key={row.id}
                              label={`${row.outcome_label} · ${dateLabel(row.followup_date)}`}
                              description={
                                <VStack gap={1}>
                                  <Text>
                                    {row.response ||
                                      row.note ||
                                      "Jadwal tindak lanjut tercatat."}
                                  </Text>
                                  {row.response && row.note && (
                                    <Text>{row.note}</Text>
                                  )}
                                  <Text type="supporting">
                                    {row.actor?.name} · Dicatat{" "}
                                    {dateLabel(row.created_at, true)}
                                  </Text>
                                </VStack>
                              }
                            />
                          ))}
                      </List>
                    ) : (
                      <Text type="supporting">
                        Jadwal dan hasil evaluasi pelanggan akan tercatat di
                        sini.
                      </Text>
                    )}
                  </VStack>
                  {sample.order && (
                    <Link
                      href={withReturn(`/orders/${sample.order.id}/`, page.url)}
                    >
                      Pembelian terkait {sample.order.number}
                    </Link>
                  )}
                </MotionStack>
              )}
            </VStack>
          </LayoutContent>
        }
      />
      <FormDialog
        isOpen={!!dialog}
        onOpenChange={close}
        title={
          dialog === "decision"
            ? "Keputusan peninjau"
            : dialog === "cancel"
              ? "Batalkan pengajuan"
              : dialog === "schedule"
                ? "Jadwalkan tindak lanjut"
                : dialog === "outcome"
                  ? "Catat hasil evaluasi"
                  : dialog === "ship"
                    ? "Konfirmasi pengiriman"
                    : dialog === "receive"
                      ? "Konfirmasi penerimaan"
                      : "Ajukan draf"
        }
      >
        <VStack padding={6} gap={4}>
          {d.error && <Banner status="error" title={d.error.message} />}
          {dialog === "decision" && (
            <VStack gap={2}>
              <Status
                value={d.recommendation.result}
                label={d.recommendation.label}
              />
              <Text type="supporting">
                {(d.recommendation.reasons || []).join(" ")}
              </Text>
              <Text type="supporting">
                Isi alasan untuk penolakan, tinjauan manual, atau keputusan yang
                berbeda dari rekomendasi. Persetujuan mencadangkan stok;
                pengiriman baru menguranginya.
              </Text>
            </VStack>
          )}
          {dialog === "decision" ? (
            <SimpleForm
              spec={d.decision_form}
              action={actionUrl("decide")}
              label="Simpan keputusan"
            />
          ) : dialog === "cancel" ? (
            <SimpleForm
              spec={d.cancel_form}
              action={actionUrl("cancel")}
              label="Batalkan pengajuan"
              variant="destructive"
            />
          ) : dialog === "schedule" ? (
            <SimpleForm
              spec={d.schedule_form}
              action={actionUrl("schedule")}
              label="Simpan jadwal"
            />
          ) : dialog === "outcome" ? (
            <SimpleForm
              spec={d.outcome_form}
              action={actionUrl("outcome")}
              label="Simpan hasil"
            />
          ) : (
            <ServerForm action={actionUrl(dialog)}>
              <VStack gap={4}>
                <Text>
                  {dialog === "ship"
                    ? "Stok fisik akan dikurangi sesuai alokasi batch."
                    : dialog === "receive"
                      ? "Status diterima memulai masa evaluasi."
                      : "Manajer akan meninjau riwayat dan rekomendasi sebelum memutuskan."}
                </Text>
                <HStack hAlign="end">
                  <Button
                    type="submit"
                    variant="primary"
                    label={
                      dialog === "ship"
                        ? "Tandai sampel dikirim"
                        : dialog === "receive"
                          ? "Tandai sampel diterima"
                          : "Ajukan ke manajer"
                    }
                    isLoading={busy}
                  />
                </HStack>
              </VStack>
            </ServerForm>
          )}
        </VStack>
      </FormDialog>
    </>
  );
}
