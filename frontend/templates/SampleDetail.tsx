import { proportional } from "@astryxdesign/core/Table";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { List, ListItem } from "@astryxdesign/core/List";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { MotionPanel, MotionStack } from "../motion";
import { ProductIdentity } from "../ProductIdentity";
import { sampleJourney, sampleStage } from "../sampleJourney";
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
  BatchStatus,
  Banner,
  Fact,
  DataTable,
  Empty,
  FormDialog,
  SimpleForm,
  Fields,
  useFields,
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
  const commercial = d.can_view_commercial === true;
  const journey = sampleJourney(sample, page.role || "");
  const stage = sampleStage(sample, page.role || "");
  const [requestedTab, setTab] = useQueryState(
    "tab",
    commercial && sample.fulfillment_status === "RECEIVED"
      ? "evaluation"
      : "products",
  );
  const tab = (commercial
    ? [
        "products",
        ...(sample.fulfillment_status === "RECEIVED" ? ["evaluation"] : []),
        "evidence",
        "history",
      ]
    : ["products", "history"]
  ).includes(requestedTab)
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
                    label="Ajukan sampel"
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
                    label="Konfirmasi penerimaan"
                    variant="primary"
                    onClick={() => setDialog("receive")}
                  />
                )}
                {d.can_schedule && (
                  <Button
                    label={
                      d.evaluation?.scheduled
                        ? "Ubah jadwal"
                        : "Jadwalkan tindak lanjut"
                    }
                    onClick={() => setDialog("schedule")}
                  />
                )}
                {d.can_followup && (
                  <Button
                    label="Catat evaluasi"
                    variant="primary"
                    onClick={() => setDialog("outcome")}
                  />
                )}
                {d.can_cancel && (
                  <DropdownMenu
                    presentation="popover"
                    button={{ label: "Lainnya", variant: "secondary" }}
                    alignment="end"
                    items={[
                      {
                        label: "Batalkan pengajuan",
                        variant: "destructive",
                        onClick: () => setDialog("cancel"),
                      },
                    ]}
                  />
                )}
              </HStack>
            }
          />
        }
        end={
          <MotionPanel width="20rem" padding={5} role="complementary">
            <VStack gap={6}>
              <VStack gap={2}>
                <Heading level={2}>
                  {commercial ? "Pelanggan" : "Penerima sampel"}
                </Heading>
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
              {commercial && (
                <>
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
                        {sample.decided_by?.name} ·{" "}
                        {dateLabel(sample.decided_at)}
                      </Text>
                    </VStack>
                  )}
                  <Collapsible
                    trigger={
                      sample.decided_at
                        ? "Dasar keputusan sebelumnya"
                        : "Rekomendasi sistem"
                    }
                    defaultIsOpen={!sample.decided_at}
                  >
                    <VStack gap={3}>
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
                      {(d.recommendation.reasons || []).map(
                        (reason: string) => (
                          <Text key={reason}>{reason}</Text>
                        ),
                      )}
                      <Text type="supporting">
                        Dasar pengulangan memakai riwayat produk yang sama. Buka
                        tab Riwayat pelanggan untuk memeriksa bukti pendukung.
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
                  </Collapsible>

                  <Button
                    label="Lihat riwayat pendukung"
                    onClick={() => setTab("evidence")}
                  />
                </>
              )}
              {!commercial && (
                <Text type="supporting">
                  Hubungi penerima untuk koordinasi pengiriman. Evaluasi
                  pelanggan ditangani sales.
                </Text>
              )}
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
              <VStack gap={3} data-tour="sample-overview">
                <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
                  <HStack gap={3} vAlign="center" wrap="wrap">
                    <Heading level={2}>Progres sampel</Heading>
                    <Status value={stage.value} label={stage.label} />
                  </HStack>
                  <Text type="supporting">
                    Dibuat {dateLabel(sample.created_at)}
                  </Text>
                </HStack>
                <Text color="secondary">{journey.description}</Text>
              </VStack>
              {commercial &&
                sample.fulfillment_status === "RECEIVED" &&
                d.evaluation.scheduled && (
                  <Banner
                    status="info"
                    title={`Tindak lanjut ${dateLabel(d.evaluation.scheduled.date)}`}
                    description={
                      d.evaluation.scheduled.note ||
                      "Jadwal ini juga tercatat pada aktivitas pelanggan. Catat evaluasi di sini untuk menyelesaikannya."
                    }
                  />
                )}
              <TabList
                aria-label="Detail sampel"
                role="tablist"
                value={tab}
                onChange={setTab}
                hasDivider
              >
                <Tab
                  value="products"
                  label={commercial ? "Pengajuan & produk" : "Produk & batch"}
                  panelId="sample-products"
                />
                {commercial && sample.fulfillment_status === "RECEIVED" && (
                  <Tab
                    value="evaluation"
                    label="Evaluasi & pembelian"
                    panelId="sample-evaluation"
                  />
                )}
                {commercial && (
                  <Tab
                    value="evidence"
                    label="Riwayat pelanggan"
                    panelId="sample-evidence"
                  />
                )}
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
                  aria-label={
                    commercial ? "Pengajuan & produk" : "Produk & batch"
                  }
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
                              width: proportional(2, { minWidth: 240 }),
                              header: "Status",
                              renderCell: (row) => (
                                <BatchStatus batch={row} today={page.today} />
                              ),
                            },
                          ]}
                        />
                      </VStack>
                    )}
                  </VStack>
                  {commercial && (
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
                  )}
                </MotionStack>
              )}
              {tab === "evaluation" &&
                commercial &&
                sample.fulfillment_status === "RECEIVED" && (
                  <MotionStack
                    gap={6}
                    motionKey={tab}
                    id="sample-evaluation"
                    role="tabpanel"
                    aria-label="Evaluasi & pembelian"
                  >
                    <VStack gap={3}>
                      <Heading level={2}>Catatan evaluasi</Heading>
                      {d.evaluation.events.length ? (
                        <List hasDividers density="balanced">
                          {d.evaluation.events.map((event: Row) => (
                            <ListItem
                              key={event.id}
                              label={`${event.outcome === "NOT_FOLLOWED_UP" ? "Jadwal tindak lanjut" : event.outcome_label} · ${dateLabel(event.date)}`}
                              description={
                                <VStack gap={1}>
                                  <Text>
                                    {event.response ||
                                      event.note ||
                                      "Jadwal tercatat pada aktivitas pelanggan."}
                                  </Text>
                                  {event.response && event.note && (
                                    <Text type="supporting">{event.note}</Text>
                                  )}
                                  <Text type="supporting">
                                    {event.actor?.name}
                                  </Text>
                                </VStack>
                              }
                            />
                          ))}
                        </List>
                      ) : (
                        <Text type="supporting">
                          Belum ada tanggapan yang dicatat.
                        </Text>
                      )}
                    </VStack>
                    <VStack gap={3}>
                      <HStack hAlign="between" vAlign="center" gap={3}>
                        <Heading level={2}>Pembelian lanjutan</Heading>
                        {d.can_create_order && (
                          <Button
                            label="Buat pesanan"
                            href={withReturn(
                              `/orders/new/?customer=${sample.customer.id}`,
                              page.url,
                            )}
                          />
                        )}
                      </HStack>
                      {sample.order ? (
                        <VStack gap={2}>
                          <Text>
                            Pesanan terkirim ini ditautkan sebagai hasil
                            pemberian sampel.
                          </Text>
                          <HStack>
                            <Button
                              label={`Buka ${sample.order.number}`}
                              href={withReturn(
                                `/orders/${sample.order.id}/`,
                                page.url,
                              )}
                            />
                          </HStack>
                        </VStack>
                      ) : (
                        <Text type="supporting">
                          Belum ada pesanan yang ditautkan. Setelah terkirim,
                          pilih pesanan melalui Catat evaluasi → Membeli.
                        </Text>
                      )}
                      {d.evaluation.orders.length > 0 && (
                        <>
                          <Text weight="semibold">
                            Pesanan pelanggan sejak penerimaan sampel
                          </Text>
                          <Text type="supporting">
                            Belum ditautkan ke sampel ini. Periksa pesanan yang
                            sesuai sebelum mencatat hasil membeli.
                          </Text>
                          <List hasDividers density="balanced">
                            {d.evaluation.orders.map((order: Row) => (
                              <ListItem
                                key={order.id}
                                label={order.number}
                                description={
                                  <HStack gap={2}>
                                    <Status value={order.status} />
                                    <Text type="supporting">
                                      {money(order.total)}
                                    </Text>
                                  </HStack>
                                }
                                endContent={
                                  <Button
                                    label="Buka pesanan"
                                    href={withReturn(
                                      `/orders/${order.id}/`,
                                      page.url,
                                    )}
                                  />
                                }
                              />
                            ))}
                          </List>
                        </>
                      )}
                    </VStack>
                    <HStack>
                      <Button
                        label="Lihat sampel pelanggan"
                        href={withReturn(
                          `/customers/${sample.customer.id}/?tab=samples`,
                          page.url,
                        )}
                      />
                    </HStack>
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
                            <Empty
                              title="Belum ada pengajuan sampel sebelumnya"
                              description="Riwayat pengajuan pelanggan ini akan tampil di sini."
                            />
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
                          empty={
                            <Empty
                              title="Belum ada sampel diterima"
                              description="Sampel muncul setelah penerimaan pelanggan dicatat."
                            />
                          }
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
                            <Empty
                              title="Belum ada tindak lanjut tercatat"
                              description="Jadwal tindak lanjut dari evaluasi sampel akan tampil di sini."
                            />
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
                            <Empty
                              title="Belum ada pembelian yang ditautkan"
                              description="Pesanan yang dibuat dari evaluasi sampel akan tampil di sini."
                            />
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
                                <Text hasTabularNumbers>
                                  {money(row.total)}
                                </Text>
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
                  {commercial && (
                    <VStack gap={3} paddingBlockStart={4}>
                      <Heading level={3}>Tindak lanjut pengajuan ini</Heading>
                      {d.history.followups.some(
                        (row: Row) => row.request_number === sample.number,
                      ) ? (
                        <List hasDividers density="balanced">
                          {d.history.followups
                            .filter(
                              (row: Row) =>
                                row.request_number === sample.number,
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
                  )}
                  {commercial && sample.order && (
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
            <SampleEvaluationForm
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

function SampleEvaluationForm({
  spec,
  action,
  label,
}: {
  spec: import("../types").FormSpec;
  action: string;
  label: string;
}) {
  const fields = useFields(spec);
  const { busy } = useApp();
  const buying = fields.values.outcome === "PURCHASED";
  const visible = {
    ...spec,
    fields: spec.fields
      .filter((f) => f.key !== "order_id" || buying)
      .map((f) => (f.key === "order_id" ? { ...f, required: true } : f)),
  };
  return (
    <ServerForm action={action}>
      <VStack gap={4}>
        <Fields
          spec={visible}
          values={fields.values}
          onChange={fields.onChange}
        />
        <Text type="supporting">
          {buying
            ? "Hanya pesanan terkirim yang dapat ditautkan. Sampel tidak menambah omzet."
            : "Hasil ini tersimpan pada sampel dan menyelesaikan aktivitas evaluasi yang terhubung. Jika masih perlu dihubungi, jadwalkan tindak lanjut berikutnya setelah menyimpan."}
        </Text>
        <HStack hAlign="end">
          <Button
            type="submit"
            variant="primary"
            label={label}
            isLoading={busy}
          />
        </HStack>
      </VStack>
    </ServerForm>
  );
}
