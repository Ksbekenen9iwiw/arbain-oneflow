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
import { withReturn } from "../navigation";
import type { Row } from "../types";

export default function SampleDetail() {
  const { page, busy, clearDirty } = useApp();
  const d = page.data;
  const sample = d.sample;
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
        contentWidth={1050}
        defaultHasDividers
        header={
          <PageHeader
            title={sample.number}
            description={`${sample.customer.name} · ${sample.sales.name}`}
            back={{ href: d.back_url, label: "Pengajuan sampel" }}
            actions={
              <HStack gap={2} wrap="wrap">
                {d.can_edit && (
                  <Button
                    label="Edit draf"
                    href={withReturn(`/samples/${sample.id}/edit/`, d.back_url)}
                  />
                )}
                {d.can_submit && (
                  <Button label="Ajukan" variant="primary" onClick={() => setDialog("submit")} />
                )}
                {d.can_decide && (
                  <Button label="Beri keputusan" variant="primary" onClick={() => setDialog("decision")} />
                )}
                {d.can_ship && (
                  <Button label="Konfirmasi pengiriman" variant="primary" onClick={() => setDialog("ship")} />
                )}
                {d.can_receive && (
                  <Button label="Tandai diterima" variant="primary" onClick={() => setDialog("receive")} />
                )}
                {d.can_followup && (
                  <Button label="Jadwalkan tindak lanjut" onClick={() => setDialog("schedule")} />
                )}
                {d.can_followup && (
                  <Button label="Catat hasil" onClick={() => setDialog("outcome")} />
                )}
                {d.can_cancel && (
                  <Button label="Batalkan" variant="destructive" onClick={() => setDialog("cancel")} />
                )}
              </HStack>
            }
          />
        }
        content={
          <LayoutContent padding={6} data-oneflow-scroll>
            <VStack gap={6}>
              {d.error && (
                <Banner status="error" title="Tindakan belum berhasil" description={d.error.message} />
              )}
              <HStack gap={6} wrap="wrap">
                <Fact label="Status pengajuan">
                  <Status value={sample.status} label={sample.status_label} />
                </Fact>
                <Fact label="Pemenuhan">
                  <Status value={sample.fulfillment_status} label={sample.fulfillment_label} />
                </Fact>
                <Fact label="Hasil tindak lanjut">{sample.outcome_label}</Fact>
                <Fact label="Dibuat">{dateLabel(sample.created_at)}</Fact>
              </HStack>
              <VStack gap={3}>
                <Heading level={2}>Rekomendasi sistem</Heading>
                {!d.policy.configured && (
                  <Banner
                    status="warning"
                    title="Kebijakan belum dikonfigurasi"
                    description="Manajer tetap dapat meninjau manual atau membuka pengaturan kebijakan sampel."
                  />
                )}
                <Status value={d.recommendation.result} label={d.recommendation.label} />
                {(d.recommendation.reasons || []).map((reason: string) => (
                  <Text key={reason}>{reason}</Text>
                ))}
                <Text type="supporting">
                  Dasar pengulangan memakai riwayat produk yang sama. Seluruh riwayat pelanggan tetap ditampilkan di bawah.
                </Text>
                {page.role === "MANAGER" && (
                  <Button href="/samples/policy/" label="Atur kebijakan" size="sm" variant="secondary" />
                )}
              </VStack>
              <Divider />
              <VStack gap={4}>
                <Heading level={2}>Produk sampel</Heading>
                <DataTable
                  rows={sample.lines}
                  columns={[
                    { key: "sku", header: "Produk", renderCell: (row) => <VStack gap={1}><Text weight="semibold">{row.product.name}</Text><Text type="supporting">{row.product.sku}</Text></VStack> },
                    { key: "quantity", header: "Jumlah", align: "end", renderCell: (row) => <Text hasTabularNumbers>{quantity(row.quantity)} {row.product.unit}</Text> },
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
                        { key: "expiry_date", header: "Kedaluwarsa", renderCell: (row) => <Text>{dateLabel(row.expiry_date)}</Text> },
                        { key: "quantity", header: "Ambil", align: "end", renderCell: (row) => <Text>{quantity(row.quantity)} {row.unit}</Text> },
                        { key: "status", header: "Status", renderCell: (row) => <Status value={row.status} label={row.status_label} /> },
                      ]}
                    />
                  </VStack>
                )}
              </VStack>
              <VStack gap={4}>
                <Heading level={2}>Dasar pengajuan</Heading>
                <Fact label="Tujuan pemberian">{sample.purpose || "Belum tercatat"}</Fact>
                <Fact label="Kebutuhan pelanggan">{sample.customer_need || "Belum tercatat"}</Fact>
                <Fact label="Potensi pesanan">{sample.potential_orders || "Belum tercatat"}</Fact>
                <Fact label="Profil usaha">{sample.business_profile || "Belum tercatat"}</Fact>
                <Fact label="Catatan pendukung">{sample.notes || "Belum tercatat"}</Fact>
              </VStack>
              <Divider />
              <VStack gap={4}>
                <Heading level={2}>Riwayat pelanggan</Heading>
                {!d.history.has_history ? (
                  <Empty title="Belum ada riwayat" description="Calon pelanggan baru tidak otomatis dianggap memiliki track record buruk." />
                ) : (
                  <>
                    <HStack gap={6} wrap="wrap">
                      <Fact label="Pembelian terkirim">{quantity(d.history.purchase_count)}</Fact>
                      <Fact label="Nilai pembelian">{money(d.history.purchase_total)}</Fact>
                      <Fact label="Transaksi terakhir">{d.history.last_purchase_at ? dateLabel(d.history.last_purchase_at) : "Belum tercatat"}</Fact>
                    </HStack>
                    <Heading level={3}>Pengajuan sebelumnya</Heading>
                    <DataTable
                      rows={d.history.previous_samples}
                      empty={<Empty title="Belum ada pengajuan sampel sebelumnya" />}
                      columns={[
                        { key: "number", header: "Pengajuan", renderCell: (row) => <Link href={`/samples/${row.id}/`}>{row.number}</Link> },
                        { key: "created_at", header: "Tanggal", renderCell: (row) => <Text>{dateLabel(row.created_at)}</Text> },
                        { key: "status", header: "Keputusan", renderCell: (row) => <Status value={row.status} label={row.status_label} /> },
                        { key: "fulfillment_status", header: "Pemenuhan", renderCell: (row) => <Text>{row.fulfillment_label}</Text> },
                        { key: "outcome", header: "Hasil", renderCell: (row) => <Text>{row.outcome_label}</Text> },
                      ]}
                    />
                    <Heading level={3}>Sampel yang diterima</Heading>
                    <DataTable
                      rows={d.history.received_samples}
                      empty={<Empty title="Belum ada sampel diterima" />}
                      columns={[
                        { key: "number", header: "Pengajuan" },
                        { key: "received_at", header: "Diterima", renderCell: (row) => <Text>{dateLabel(row.received_at)}</Text> },
                        { key: "products", header: "Produk & jumlah", renderCell: (row) => <VStack gap={1}>{row.lines.map((line: Row) => <Text key={line.id}>{line.product.name} · {quantity(line.quantity)} {line.product.unit}</Text>)}</VStack> },
                        { key: "outcome", header: "Hasil", renderCell: (row) => <Text>{row.outcome_label}</Text> },
                      ]}
                    />
                    <Heading level={3}>Tindak lanjut & tanggapan</Heading>
                    <DataTable
                      rows={d.history.followups}
                      empty={<Empty title="Belum ada tindak lanjut tercatat" />}
                      columns={[
                        { key: "request_number", header: "Pengajuan" },
                        { key: "followup_date", header: "Tanggal", renderCell: (row) => <Text>{dateLabel(row.followup_date)}</Text> },
                        { key: "response", header: "Tanggapan", renderCell: (row) => <Text>{row.response || "Belum tercatat"}</Text> },
                        { key: "outcome", header: "Evaluasi", renderCell: (row) => <Text>{row.outcome_label}</Text> },
                        { key: "note", header: "Catatan", renderCell: (row) => <Text>{row.note || "Belum tercatat"}</Text> },
                      ]}
                    />
                    <Heading level={3}>Pembelian yang ditautkan</Heading>
                    <DataTable
                      rows={d.history.linked_orders}
                      empty={<Empty title="Belum ada pembelian yang ditautkan" />}
                      columns={[
                        { key: "number", header: "Pesanan", renderCell: (row) => <Link href={`/orders/${row.id}/`}>{row.number}</Link> },
                        { key: "total", header: "Nilai", align: "end", renderCell: (row) => <Text>{money(row.total)}</Text> },
                      ]}
                    />
                  </>
                )}
              </VStack>
              {(sample.decided_at || sample.shipped_at || sample.received_at || sample.cancelled_at) && (
                <VStack gap={3}>
                  <Heading level={2}>Jejak proses</Heading>
                  {sample.decided_at && <Text>Keputusan · {dateLabel(sample.decided_at, true)} · {sample.decided_by?.name}{sample.decision_note ? ` · ${sample.decision_note}` : ""}</Text>}
                  {sample.shipped_at && <Text>Dikirim · {dateLabel(sample.shipped_at, true)} · {sample.shipped_by?.name}</Text>}
                  {sample.received_at && <Text>Diterima · {dateLabel(sample.received_at, true)} · {sample.received_by?.name}</Text>}
                  {sample.cancelled_at && <Text>Dibatalkan · {dateLabel(sample.cancelled_at, true)} · {sample.cancel_reason}</Text>}
                  {sample.order && <Link href={`/orders/${sample.order.id}/`}>Pembelian terkait {sample.order.number}</Link>}
                </VStack>
              )}
            </VStack>
          </LayoutContent>
        }
      />
      <FormDialog
        isOpen={!!dialog}
        onOpenChange={close}
        title={
          dialog === "decision" ? "Keputusan peninjau" :
          dialog === "cancel" ? "Batalkan pengajuan" :
          dialog === "schedule" ? "Jadwalkan tindak lanjut" :
          dialog === "outcome" ? "Catat hasil evaluasi" :
          dialog === "ship" ? "Konfirmasi pengiriman" :
          dialog === "receive" ? "Konfirmasi penerimaan" : "Ajukan draf"
        }
      >
        <VStack padding={6} gap={4}>
          {dialog === "decision" ? (
            <SimpleForm spec={d.decision_form} action={actionUrl("decide")} label="Simpan keputusan" />
          ) : dialog === "cancel" ? (
            <SimpleForm spec={d.cancel_form} action={actionUrl("cancel")} label="Batalkan pengajuan" variant="destructive" />
          ) : dialog === "schedule" ? (
            <SimpleForm spec={d.schedule_form} action={actionUrl("schedule")} label="Simpan jadwal" />
          ) : dialog === "outcome" ? (
            <SimpleForm spec={d.outcome_form} action={actionUrl("outcome")} label="Simpan hasil" />
          ) : (
            <ServerForm action={actionUrl(dialog)}>
              <VStack gap={4}>
                <Text>
                  {dialog === "ship" ? "Stok fisik akan dikurangi sesuai alokasi batch." :
                   dialog === "receive" ? "Status diterima memulai masa evaluasi." :
                   "Manajer akan meninjau riwayat dan rekomendasi sebelum memutuskan."}
                </Text>
                <HStack hAlign="end">
                  <Button type="submit" variant="primary" label="Ya, lanjutkan" isLoading={busy} />
                </HStack>
              </VStack>
            </ServerForm>
          )}
        </VStack>
      </FormDialog>
    </>
  );
}
