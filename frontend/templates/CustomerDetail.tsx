import { Collapsible } from "@astryxdesign/core/Collapsible";
import { useEffect, useState } from "react";
import { ProductIdentity, ProductThumbnail } from "../ProductIdentity";
import { MotionPanel } from "../motion";
import { MotionStack } from "../motion";
import { withReturn, backLabel } from "../navigation";
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Astryx detail-page frame: record header, chronological List, and context rail.
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Grid } from "@astryxdesign/core/Grid";
import { Card } from "@astryxdesign/core/Card";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { List, ListItem } from "@astryxdesign/core/List";
import {
  VStack,
  HStack,
  Text,
  Heading,
  Button,
  Link,
  PageHeader,
  Fact,
  Status,
  Empty,
  dateLabel,
  money,
  quantity,
  Banner,
  DataTable,
  SimpleForm,
  FormDialog,
  useResponsive,
} from "../ui";
import { useApp, useQueryState } from "../router";
import { OrderTable } from "./Records";
import type { Row } from "../types";

export default function CustomerDetail() {
  const { page, busy } = useApp();
  const { isNarrow, contentPadding } = useResponsive();
  const [narrowInfoOpen, setNarrowInfoOpen] = useState(false);
  const d = page.data,
    customer = d.customer;
  const [requestedTab, setTab] = useQueryState("tab", "history");
  const tab = ["orders", "samples", "consignment"].includes(requestedTab)
    ? requestedTab
    : "history";
  const [consignOpen, setConsignOpen] = useState(d.dialog === "consignment");
  const [consignRetry, setConsignRetry] = useState(d.dialog === "consignment");
  const [selectedProductId, setSelectedProductId] = useState("");
  useEffect(() => {
    if (!["samples", "orders", "consignment"].includes(requestedTab)) return;
    const frame = requestAnimationFrame(() => {
      document
        .getElementById("customer-history")
        ?.scrollIntoView({ block: "start" });
      document
        .querySelector<HTMLElement>(
          '#customer-history [role="tab"][aria-selected="true"]',
        )
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [customer.id, requestedTab]);
  const [requestedFilter, setFilter] = useQueryState("history", "all");
  const filter = ["all", "interactions", "orders"].includes(requestedFilter)
    ? requestedFilter
    : "all";
  const [expanded, setExpanded] = useQueryState("activities", "limited");
  const [nextSize, setNextSize] = useQueryState("next", "limited");
  const [historySize, setHistorySize] = useQueryState(
    "history_size",
    "limited",
  );
  const [focused, setFocused] = useQueryState("event", "");
  const [panelState, setPanelState] = useQueryState("info", "shown");
  const panel = panelState !== "hidden";
  const setPanel = (visible: boolean) =>
    setPanelState(visible ? "shown" : "hidden");
  const opened: Row[] = d.open_activities;
  const nextActions: Row[] = d.next_actions || [];
  const history: Row[] = d.history;
  const visibleHistory = history.filter(
    (e) => filter === "all" || e.category === filter,
  );
  const last = d.latest_interaction,
    latestOrder = d.latest_order;
  const activityUrl = withReturn(
    `/customers/${customer.id}/activities/new/`,
    page.url,
  );
  const orderUrl = withReturn(`/orders/new/?customer=${customer.id}`, page.url);
  const focusRecord = (id: string) =>
    requestAnimationFrame(() => {
      const record = document.getElementById(id);
      record?.scrollIntoView({ block: "center" });
      record?.focus({ preventScroll: true });
    });
  const showHistory = (activityId?: string) => {
    setTab("history");
    setFilter("interactions");
    setHistorySize("all");
    setFocused(activityId || "");
    focusRecord(
      activityId ? `history-activity-${activityId}` : "customer-history",
    );
  };
  const showActivity = (id: string) => {
    setExpanded("all");
    focusRecord(`open-activity-${id}`);
  };
  const activityTiming = (a: Row) =>
    `${a.completed_at ? "Hasil disimpan" : "Dicatat"} ${dateLabel(a.completed_at || a.created_at, true)} WIB`;
  const customerInfoFacts = (
    <VStack gap={4}>
      <Fact label="Penanggung jawab">{customer.owner.name}</Fact>
      <Fact label="Kategori mitra & potongan harga">
        {customer.outlet_type_label || "Apotek"} · Diskon{" "}
        {customer.discount_percent ?? 16}%
      </Fact>
      <Fact label="Tahap terakhir dicatat">
        {d.latest_stage || "Belum ada aktivitas"}
      </Fact>
      <Fact label="Telepon">{customer.phone || "Belum diisi"}</Fact>
      <Fact label="Alamat">{customer.address || "Belum diisi"}</Fact>
    </VStack>
  );
  return (
    <>
      <Layout
        height="fill"
        defaultHasDividers
        header={
          <PageHeader
            title={customer.name}
            description={`${customer.code} · ${customer.is_active ? "Aktif" : "Nonaktif"}`}
            back={{ href: d.back_url, label: backLabel(d.back_url) }}
            actions={
              <HStack gap={2} wrap="wrap">
                <Button
                  label="Catat aktivitas"
                  variant="primary"
                  href={activityUrl}
                />
                {d.consignment_form_default && (
                  <Button
                    label="Catat titip jual"
                    variant="secondary"
                    onClick={() => {
                      setConsignRetry(false);
                      setSelectedProductId("");
                      setConsignOpen(true);
                    }}
                  />
                )}
                {customer.is_active && (
                  <>
                    <Button label="Buat pesanan" href={orderUrl} />
                    <Button
                      label="Ajukan sampel"
                      href={withReturn(
                        `/samples/new/?customer=${customer.id}`,
                        page.url,
                      )}
                    />
                  </>
                )}
              </HStack>
            }
          />
        }
        end={
          !isNarrow && panel ? (
            <MotionPanel width="18rem" padding={4}>
              <VStack gap={5}>
                <HStack hAlign="between" vAlign="center">
                  <Heading level={2}>Informasi</Heading>
                  <Button
                    size="sm"
                    variant="secondary"
                    label="Sembunyikan"
                    onClick={() => setPanel(false)}
                  />
                </HStack>
                {customerInfoFacts}
              </VStack>
            </MotionPanel>
          ) : undefined
        }
        content={
          <LayoutContent padding={contentPadding} data-oneflow-scroll>
          <VStack gap={6}>
            {!customer.is_active && (
              <Banner
                status="info"
                title="Pelanggan nonaktif"
                description="Riwayat dan pencatatan aktivitas tetap tersedia. Pesanan baru hanya dapat dibuat untuk pelanggan aktif."
              />
            )}
            <VStack gap={3} aria-label="Tindakan berikutnya">
              <HStack hAlign="between" vAlign="center" gap={3}>
                <VStack gap={1}>
                  <Heading level={2}>Tindakan berikutnya</Heading>
                  <Text type="supporting">
                    Jadwal terdekat dan tindak lanjut pelanggan.
                  </Text>
                </VStack>
                {nextActions.length > 3 && (
                  <Button
                    size="sm"
                    label={
                      nextSize === "all"
                        ? "Ringkas tindakan"
                        : `Lihat semua (${nextActions.length})`
                    }
                    onClick={() =>
                      setNextSize(nextSize === "all" ? "limited" : "all")
                    }
                  />
                )}
              </HStack>
              <List hasDividers density="balanced">
                {(nextSize === "all"
                  ? nextActions
                  : nextActions.slice(0, 3)
                ).map((action) => (
                  <ListItem
                    key={action.key}
                    label={action.title}
                    description={
                      <VStack gap={2}>
                        <Text type="supporting">{action.reason}</Text>
                        {action.urgency && (
                          <HStack>
                            <Status
                              value={action.urgency}
                              label={
                                action.urgency === "STOCK_LOW"
                                  ? "Stok perlu dikonfirmasi"
                                  : undefined
                              }
                            />
                          </HStack>
                        )}
                      </VStack>
                    }
                    endContent={
                      <Button
                        label={action.label}
                        href={withReturn(action.href, page.url)}
                      />
                    }
                  />
                ))}
              </List>
            </VStack>
            <VStack gap={4} data-tour="customer-overview">
              <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
                <Heading level={2}>Ringkasan pelanggan</Heading>
                {(isNarrow || !panel) && (
                  <Button
                    label="Tampilkan informasi"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      if (isNarrow) setNarrowInfoOpen(true);
                      else setPanel(true);
                    }}
                  />
                )}
              </HStack>
              <Grid
                columns={{ minWidth: 260, repeat: "fit", max: 2 }}
                gap={4}
              >
                <Card padding={4}>
                  <VStack gap={2}>
                    <Text type="supporting">Hasil aktivitas terakhir</Text>
                    {last ? (
                      <>
                        <Text weight="semibold">
                          {last.kind_label} · {last.stage}
                        </Text>
                        <Text maxLines={2}>{last.result}</Text>
                        <Text type="supporting">{activityTiming(last)}</Text>
                        <HStack>
                          <Button
                            label="Baca hasil aktivitas"
                            variant="secondary"
                            size="sm"
                            onClick={() => showHistory(last.id)}
                          />
                        </HStack>
                      </>
                    ) : (
                      <>
                        <Text>Belum ada aktivitas yang diselesaikan</Text>
                        <HStack>
                          <Button
                            size="sm"
                            variant="secondary"
                            label="Catat hasil komunikasi"
                            href={withReturn(
                              `/customers/${customer.id}/activities/new/?intent=done`,
                              page.url,
                            )}
                          />
                        </HStack>
                      </>
                    )}
                  </VStack>
                </Card>
                <Card padding={4}>
                  <VStack gap={2}>
                    <Text type="supporting">Pesanan terbaru dibuat</Text>
                    {latestOrder ? (
                      <>
                        <HStack gap={2} wrap="wrap">
                          <Link
                            href={withReturn(
                              `/orders/${latestOrder.id}/`,
                              page.url,
                            )}
                            weight="semibold"
                          >
                            {latestOrder.number}
                          </Link>
                          <Status value={latestOrder.status} />
                        </HStack>
                        <Text>
                          {money(latestOrder.total)} ·{" "}
                          {dateLabel(latestOrder.created_at)}
                        </Text>
                        <Text type="supporting">
                          {d.pending_order_count} pesanan menunggu pengiriman
                        </Text>
                        <HStack>
                          <Button
                            label={`Lihat pesanan (${d.orders.length})`}
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setTab("orders");
                              requestAnimationFrame(() =>
                                document
                                  .getElementById("customer-history")
                                  ?.scrollIntoView({ block: "start" }),
                              );
                            }}
                          />
                        </HStack>
                      </>
                    ) : (
                      <>
                        <Text>Belum ada pesanan dalam cakupan akun ini</Text>
                        {customer.is_active && (
                          <HStack>
                            <Button
                              size="sm"
                              variant="secondary"
                              href={orderUrl}
                              label="Buat pesanan"
                            />
                          </HStack>
                        )}
                      </>
                    )}
                  </VStack>
                </Card>
              </Grid>
            </VStack>
            <VStack gap={3} id="customer-reorder">
              <VStack gap={1}>
                <Heading level={2}>Perkiraan pembelian ulang</Heading>
                <Text type="supporting">
                  Pengingat muncul saat perkiraan pembelian tiba, dari minimal 3
                  tanggal berbeda. Tetap tindak lanjuti meskipun stok kurang.
                </Text>
              </VStack>
              {(d.reorder_patterns || []).length ||
              (d.thin_history || []).length ? (
                <List hasDividers density="balanced">
                  {(d.reorder_patterns || []).map((p: Row) => (
                    <ListItem
                      key={p.product_sku}
                      startContent={
                        <ProductThumbnail
                          name={p.product_name}
                          sku={p.product_sku}
                        />
                      }
                      label={`${p.product_name} · Perkiraan ${dateLabel(p.next_due)}`}
                      endContent={
                        <Button
                          size="sm"
                          label="Jadwalkan tindak lanjut"
                          href={withReturn(
                            `/customers/${customer.id}/activities/new/?intent=followup&source_product=${p.product_id}`,
                            page.url,
                          )}
                        />
                      }
                      description={
                        <VStack gap={2}>
                          <Text type="supporting">
                            Acuan {quantity(p.typical_quantity)} {p.unit} · stok
                            bebas {quantity(p.available_quantity)}
                            {!p.consistent ? " · pola belum konsisten" : ""}
                          </Text>
                          <Collapsible trigger="Dasar perkiraan">
                            <VStack gap={2}>
                              <Text type="supporting">
                                Terakhir {dateLabel(p.last_purchase_date)} ·{" "}
                                {p.purchase_date_count} tanggal · interval{" "}
                                {(p.intervals_days || []).join(", ")} hari
                                (median {p.interval_days}).
                                {!p.consistent &&
                                  " Pola belum konsisten — tinjau manual."}
                              </Text>
                              {(p.inbound || []).length > 0 && (
                                <Text type="supporting">
                                  Pengadaan berjalan (bukan stok siap kirim):{" "}
                                  {(p.inbound || [])
                                    .map(
                                      (po: Row) =>
                                        `${po.number} · ${po.remaining} unit · ${po.expected_date ? "estimasi " + dateLabel(po.expected_date) : "estimasi belum ada"}`,
                                    )
                                    .join("; ")}
                                  .
                                </Text>
                              )}
                            </VStack>
                          </Collapsible>
                        </VStack>
                      }
                    />
                  ))}
                  {(d.thin_history || []).map((row: Row) => (
                    <ListItem
                      key={row.product_sku}
                      label={row.product_name}
                      description={
                        <Text type="supporting">
                          Riwayat belum cukup ({row.dates.length} dari minimal 3
                          tanggal berbeda).
                        </Text>
                      }
                    />
                  ))}
                </List>
              ) : (
                <Text type="supporting">
                  {d.orders.some((order: Row) => order.status === "SHIPPED")
                    ? "Belum ada pengingat yang perlu ditindaklanjuti."
                    : "Belum ada pembelian terkirim untuk membentuk perkiraan."}
                </Text>
              )}
            </VStack>
            {opened.length > 0 && (
              <VStack gap={3} id="customer-agenda">
                <Collapsible
                  trigger={`Agenda lengkap (${opened.length})`}
                  isOpen={expanded === "all"}
                  onOpenChange={(open) => setExpanded(open ? "all" : "limited")}
                >
                  <List hasDividers density="balanced">
                    {opened.map((a) => (
                      <ListItem
                        key={a.id}
                        label={a.kind_label}
                        description={
                          <VStack
                            gap={2}
                            id={`open-activity-${a.id}`}
                            tabIndex={-1}
                          >
                            <HStack gap={2} wrap="wrap">
                              <Text type="supporting">
                                {a.due ? dateLabel(a.due) : "Belum dijadwalkan"}{" "}
                                · {a.sales.name}
                              </Text>
                              {a.due && a.due <= page.today && (
                                <Status
                                  value={
                                    a.due < page.today ? "OVERDUE" : "DUE_TODAY"
                                  }
                                  label={
                                    a.due < page.today
                                      ? "Terlambat"
                                      : "Hari ini"
                                  }
                                />
                              )}
                            </HStack>
                            {a.note && <Text maxLines={2}>{a.note}</Text>}
                            {a.followup_of_id && (
                              <HStack>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  label="Lihat interaksi asal →"
                                  onClick={() => showHistory(a.followup_of_id)}
                                />
                              </HStack>
                            )}
                          </VStack>
                        }
                        endContent={
                          <Button
                            label="Catat hasil"
                            href={withReturn(
                              `/activities/${a.id}/complete/`,
                              page.url,
                            )}
                          />
                        }
                      />
                    ))}
                  </List>
                </Collapsible>
              </VStack>
            )}
            <VStack
              gap={4}
              paddingBlockEnd={6}
              id="customer-history"
              tabIndex={-1}
            >
              <TabList
                aria-label="Riwayat pelanggan"
                role="tablist"
                value={tab}
                onChange={setTab}
                hasDivider
              >
                <Tab
                  value="history"
                  label="Riwayat pelanggan"
                  panelId="customer-history-panel"
                />
                <Tab
                  data-tour="customer-orders"
                  value="orders"
                  label={`Pesanan (${d.orders.length})`}
                  panelId="customer-orders-panel"
                />
                <Tab
                  value="samples"
                  label={`Sampel (${(d.samples || []).length})`}
                  panelId="customer-samples-panel"
                />
                <Tab
                  value="consignment"
                  label={`Titip jual (${(d.consignment?.items || []).length})`}
                  panelId="customer-consignment-panel"
                />
              </TabList>
              {tab === "consignment" ? (
                <MotionStack
                  motionKey={tab}
                  id="customer-consignment-panel"
                  role="tabpanel"
                  aria-label="Stok titip jual di apotek"
                  gap={4}
                >
                  {(d.carry_directives || []).some(
                    (item: Row) => item.directive,
                  ) && (
                    <Banner
                      status="warning"
                      title="Arahan bawaan manajer untuk kunjungan apotek"
                      description={(d.carry_directives || [])
                        .filter((item: Row) => item.directive)
                        .map(
                          (item: Row) =>
                            `${item.name} (${item.directive.label}): ${item.directive.reason}${item.directive.substitute_name ? ` → Ganti bawa ${item.directive.substitute_name}` : ""}`,
                        )
                        .join(" · ")}
                    />
                  )}
                  <HStack
                    hAlign="between"
                    vAlign="center"
                    wrap="wrap"
                    gap={3}
                  >
                    <Text type="supporting">
                      Stok titip jual di {customer.name} (
                      {customer.outlet_type_label || "Apotek"} · Diskon mitra{" "}
                      {customer.discount_percent ?? 16}% ·{" "}
                      {quantity(d.consignment?.total_on_display || 0)} unit
                      aktif, {quantity(d.consignment?.total_sold || 0)} unit
                      terjual
                      {Number(d.consignment?.deferred_billing_rupiah || 0) > 0
                        ? ` · Tagihan tunda: ${money(d.consignment.deferred_billing_rupiah)}`
                        : ""}
                      ).
                    </Text>
                    {d.consignment_form_default && (
                      <Button
                        size="sm"
                        variant="primary"
                        label="Catat kunjungan titip jual"
                        onClick={() => {
                          setConsignRetry(false);
                          setSelectedProductId("");
                          setConsignOpen(true);
                        }}
                      />
                    )}
                  </HStack>
                  <DataTable
                    rows={d.consignment?.items || []}
                    empty={
                      <Empty
                        title="Belum ada stok titip jual di apotek ini"
                        description="Catat penempatan barang titip jual pertama saat kunjungan sales."
                        action={
                          d.consignment_form_default ? (
                            <Button
                              label="Catat titip jual pertama"
                              onClick={() => {
                                setConsignRetry(false);
                                setSelectedProductId("");
                                setConsignOpen(true);
                              }}
                            />
                          ) : undefined
                        }
                      />
                    }
                    columns={[
                      {
                        key: "name",
                        header: "Produk",
                        renderCell: (item: Row) => (
                          <ProductIdentity
                            sku={item.sku}
                            name={item.name}
                            size="row"
                          >
                            <VStack gap={1}>
                              <Text weight="semibold">{item.name}</Text>
                              <Text type="supporting">{item.sku}</Text>
                            </VStack>
                          </ProductIdentity>
                        ),
                      },
                      {
                        key: "quantity_on_display",
                        header: "Stok di Apotek",
                        align: "end",
                        renderCell: (item: Row) => (
                          <Text weight="semibold" hasTabularNumbers>
                            {quantity(item.quantity_on_display)} {item.unit}
                          </Text>
                        ),
                      },
                      {
                        key: "total_sold",
                        header: "Total Laku",
                        align: "end",
                        renderCell: (item: Row) => (
                          <VStack gap={1} hAlign="end">
                            <Text hasTabularNumbers>
                              {quantity(item.total_sold)} {item.unit}
                            </Text>
                            <Text type="supporting">
                              Perputaran {item.sell_through_pct}%
                            </Text>
                          </VStack>
                        ),
                      },
                      {
                        key: "status",
                        header: "Kondisi, ED & Arahan",
                        renderCell: (item: Row) => (
                          <VStack gap={1}>
                            <HStack gap={2} wrap="wrap">
                              {item.is_near_expiry && (
                                <Status
                                  value="NEAR_EXPIRY"
                                  label="Wajib tarik ≤ 6 bln ED"
                                />
                              )}
                              {item.is_weak ? (
                                <Status
                                  value="SLOW"
                                  label="Kurang laku di sini"
                                />
                              ) : (
                                <Status value="SAFE" label="Bergerak baik" />
                              )}
                              {item.directive_code && (
                                <Status
                                  value={item.directive_code}
                                  label={item.directive_label}
                                />
                              )}
                            </HStack>
                            {item.nearest_expiry_date && (
                              <Text type="supporting">
                                ED terdekat:{" "}
                                {dateLabel(item.nearest_expiry_date)}
                              </Text>
                            )}
                          </VStack>
                        ),
                      },
                      {
                        key: "last_checked_date",
                        header: "Cek Terakhir",
                        renderCell: (item: Row) => (
                          <Text>
                            {item.last_checked_date
                              ? dateLabel(item.last_checked_date)
                              : "—"}
                          </Text>
                        ),
                      },
                      ...(d.consignment_form_default
                        ? [
                            {
                              key: "action",
                              header: "Tindakan",
                              renderCell: (item: Row) => (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  label="Cek / isi ulang"
                                  onClick={() => {
                                    setConsignRetry(false);
                                    setSelectedProductId(
                                      String(item.product_id),
                                    );
                                    setConsignOpen(true);
                                  }}
                                />
                              ),
                            },
                          ]
                        : []),
                    ]}
                  />
                  {(d.consignment?.recent_entries || []).length > 0 && (
                    <VStack gap={3}>
                      <Heading level={3}>
                        Riwayat pengecekan & mutasi titip jual
                      </Heading>
                      <List hasDividers density="balanced">
                        {(d.consignment?.recent_entries || []).map(
                          (entry: Row) => (
                            <ListItem
                              key={entry.id}
                              label={`${entry.product_name} (${entry.product_sku}) · ${dateLabel(entry.visit_date)}`}
                              description={
                                  <VStack gap={2}>
                                    <HStack gap={2} wrap="wrap" vAlign="center">
                                      {entry.billing_status && (
                                        <Status
                                          value={entry.billing_status}
                                          label={entry.billing_status_label}
                                        />
                                      )}
                                      {Number(entry.net_billed_rupiah) > 0 && (
                                        <Text weight="semibold" hasTabularNumbers>
                                          Tagihan bersih:{" "}
                                          {money(entry.net_billed_rupiah)}{" "}
                                          (diskon {entry.discount_percent}%)
                                        </Text>
                                      )}
                                      {entry.return_reason &&
                                        entry.return_reason !== "NONE" && (
                                          <Status
                                            value={entry.return_reason}
                                            label={entry.return_reason_label}
                                          />
                                        )}
                                    </HStack>
                                    <Text>
                                      Stok awal {quantity(entry.previous_stock)}{" "}
                                      {entry.unit} → laku{" "}
                                      <Text weight="semibold" hasTabularNumbers>
                                        {quantity(entry.sold_quantity)}{" "}
                                        {entry.unit}
                                      </Text>
                                      , sisa fisik{" "}
                                      {quantity(entry.remaining_stock)}{" "}
                                      {entry.unit}
                                      {Number(entry.added_quantity) > 0
                                        ? `, +titip baru ${quantity(entry.added_quantity)} ${entry.unit}`
                                        : ""}
                                      {Number(entry.returned_quantity) > 0
                                        ? `, ditarik ${quantity(entry.returned_quantity)} ${entry.unit}`
                                        : ""}{" "}
                                      → stok akhir{" "}
                                      <Text weight="semibold" hasTabularNumbers>
                                        {quantity(entry.closing_stock)}{" "}
                                        {entry.unit}
                                      </Text>
                                      .
                                    </Text>
                                    <Text type="supporting">
                                      Sales: {entry.sales_name}
                                      {entry.physical_stamp_verified
                                        ? " · Cap & TTD apotek lengkap"
                                        : ""}
                                      {entry.note ? ` · ${entry.note}` : ""}
                                    </Text>
                                  </VStack>
                              }
                            />
                          ),
                        )}
                      </List>
                    </VStack>
                  )}
                </MotionStack>
              ) : tab === "samples" ? (
                <MotionStack
                  motionKey={tab}
                  id="customer-samples-panel"
                  role="tabpanel"
                  aria-label="Sampel pelanggan"
                  gap={3}
                >
                  <Text type="supporting">
                    Ikuti pengiriman, evaluasi, dan pembelian yang ditautkan
                    untuk pelanggan ini.
                  </Text>
                  {(d.samples || []).length ? (
                    <List hasDividers density="balanced">
                      {d.samples.map((sample: Row) => (
                        <ListItem
                          key={sample.id}
                          label={sample.number}
                          description={
                            <VStack gap={2}>
                              <Text>{sample.products}</Text>
                              <HStack gap={2} wrap="wrap">
                                <Status value={sample.status} />
                                <Status
                                  value={sample.fulfillment}
                                  label={sample.fulfillment_label}
                                />
                              </HStack>
                              {sample.fulfillment === "RECEIVED" && (
                                <Text>
                                  {sample.outcome}
                                  {sample.next_date
                                    ? ` · Tindak lanjut ${dateLabel(sample.next_date)}`
                                    : ""}
                                </Text>
                              )}
                              {sample.last_response && (
                                <Text type="supporting" maxLines={2}>
                                  {sample.last_response}
                                </Text>
                              )}
                              {sample.order_id && (
                                <HStack>
                                  <Button
                                    size="sm"
                                    label={`Pesanan OF-${String(sample.order_id).padStart(4, "0")}`}
                                    href={withReturn(
                                      `/orders/${sample.order_id}/`,
                                      page.url,
                                    )}
                                  />
                                </HStack>
                              )}
                            </VStack>
                          }
                          endContent={
                            <Button
                              label={
                                sample.fulfillment === "RECEIVED"
                                  ? "Buka evaluasi"
                                  : "Lihat sampel"
                              }
                              href={withReturn(
                                `/samples/${sample.id}/`,
                                page.url,
                              )}
                            />
                          }
                        />
                      ))}
                    </List>
                  ) : (
                    <Empty
                      title="Belum ada sampel"
                      description="Ajukan sampel jika ada kebutuhan pelanggan yang perlu diuji. Riwayat dan hasilnya akan tampil di sini."
                      action={
                        customer.is_active ? (
                          <Button
                            label="Ajukan sampel"
                            href={withReturn(
                              `/samples/new/?customer=${customer.id}`,
                              page.url,
                            )}
                          />
                        ) : undefined
                      }
                    />
                  )}
                </MotionStack>
              ) : tab === "orders" ? (
                <MotionStack
                  motionKey={`${tab}:${filter}`}
                  id="customer-orders-panel"
                  data-tour="customer-orders-overview"
                  role="tabpanel"
                  aria-label="Pesanan"
                  gap={3}
                >
                  <Text type="supporting">
                    Pesanan pelanggan ini sesuai akses akun Anda. Buka pesanan
                    untuk melanjutkan prosesnya.
                  </Text>
                  <OrderTable
                    rows={d.orders}
                    showCustomer={false}
                    empty={
                      <Empty
                        title="Belum ada pesanan dalam cakupan akun ini"
                        description="Pesanan baru akan tersimpan pada pelanggan ini."
                        action={
                          customer.is_active ? (
                            <>
                              <Button label="Buat pesanan" href={orderUrl} />
                              <Button
                                label="Ajukan sampel"
                                href={withReturn(
                                  `/samples/new/?customer=${customer.id}`,
                                  page.url,
                                )}
                              />
                            </>
                          ) : undefined
                        }
                      />
                    }
                  />
                </MotionStack>
              ) : (
                <MotionStack
                  motionKey={`${tab}:${filter}`}
                  gap={4}
                  id="customer-history-panel"
                  role="tabpanel"
                  aria-label="Riwayat pelanggan"
                >
                  <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
                    <SegmentedControl
                      label="Jenis riwayat"
                      size="sm"
                      value={filter}
                      onChange={(value) => {
                        setFilter(value);
                        setHistorySize("limited");
                        setFocused("");
                      }}
                    >
                      <SegmentedControlItem value="all" label="Semua" />
                      <SegmentedControlItem
                        value="interactions"
                        label="Interaksi"
                      />
                      <SegmentedControlItem
                        value="orders"
                        label="Perubahan pesanan"
                      />
                    </SegmentedControl>
                    <Text type="supporting">Terbaru lebih dahulu · WIB</Text>
                  </HStack>
                  {visibleHistory.length ? (
                    <>
                      <List hasDividers density="balanced">
                        {(historySize === "all"
                          ? visibleHistory
                          : visibleHistory.slice(0, 8)
                        ).map((e) => (
                          <ListItem
                            key={e.id}
                            label={e.title}
                            isSelected={e.activity?.id === focused}
                            description={
                              <VStack
                                gap={3}
                                id={`history-${e.id}`}
                                tabIndex={-1}
                              >
                                <Text type="supporting">
                                  {e.time_label} {dateLabel(e.at, true)} WIB
                                  {e.activity
                                    ? ` · Sales: ${e.activity.sales.name}`
                                    : e.actor
                                      ? ` · ${e.actor}`
                                      : ""}
                                </Text>
                                {e.activity ? (
                                  <>
                                    {!e.activity.completed_at && (
                                      <Text type="supporting">
                                        Waktu penyelesaian belum tersedia untuk
                                        catatan lama.
                                      </Text>
                                    )}
                                    <Text>{e.activity.result}</Text>
                                    <HStack>
                                      <Button
                                        label="Detail aktivitas"
                                        variant="secondary"
                                        size="sm"
                                        href={withReturn(
                                          `/activities/${e.activity.id}/complete/`,
                                          page.url,
                                        )}
                                      />
                                    </HStack>
                                    <Text type="supporting">
                                      Tahap dicatat: {e.activity.stage}
                                      {e.activity.scheduled_date ||
                                      e.activity.followup_date
                                        ? ` · Jadwal aktivitas: ${dateLabel(e.activity.scheduled_date || e.activity.followup_date)}`
                                        : ""}
                                    </Text>
                                    {e.activity.note &&
                                      e.activity.note !== e.activity.result && (
                                        <Fact label="Catatan aktivitas">
                                          {e.activity.note}
                                        </Fact>
                                      )}
                                    {e.followups.map((a: Row) => (
                                      <HStack key={a.id} gap={2} wrap="wrap">
                                        <Text>
                                          Tindak lanjut {dateLabel(a.due)} ·{" "}
                                          {a.status_label}
                                        </Text>
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          label={
                                            a.status === "PLANNED"
                                              ? "Lihat aktivitas →"
                                              : "Baca hasil →"
                                          }
                                          onClick={() =>
                                            a.status === "PLANNED"
                                              ? showActivity(a.id)
                                              : showHistory(a.id)
                                          }
                                        />
                                      </HStack>
                                    ))}
                                    {e.related_order && (
                                      <Link
                                        href={withReturn(
                                          `/orders/${e.related_order.id}/`,
                                          page.url,
                                        )}
                                      >
                                        Pesanan terkait:{" "}
                                        {e.related_order.number} →
                                      </Link>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <HStack gap={3} wrap="wrap">
                                      <Link
                                        href={withReturn(
                                          `/orders/${e.order.id}/`,
                                          page.url,
                                        )}
                                        weight="semibold"
                                      >
                                        {e.order.number} →
                                      </Link>
                                    </HStack>
                                    {e.phase === "cancelled" && (
                                      <Text>{e.order.cancel_reason}</Text>
                                    )}
                                  </>
                                )}
                              </VStack>
                            }
                          />
                        ))}
                      </List>
                      {visibleHistory.length > 8 && (
                        <HStack hAlign="end">
                          <Button
                            variant="secondary"
                            label={
                              historySize === "all"
                                ? "Ringkas riwayat"
                                : `Lihat semua riwayat (${visibleHistory.length})`
                            }
                            onClick={() =>
                              setHistorySize(
                                historySize === "all" ? "limited" : "all",
                              )
                            }
                          />
                        </HStack>
                      )}
                    </>
                  ) : (
                    <Empty
                      title={
                        filter === "all"
                          ? "Belum ada riwayat pelanggan"
                          : "Belum ada riwayat pada jenis ini"
                      }
                      description="Hasil interaksi dan perubahan status pesanan akan tampil di sini."
                      action={
                        filter !== "all" ? (
                          <Button
                            label="Lihat semua riwayat"
                            onClick={() => setFilter("all")}
                          />
                        ) : (
                          <Button label="Catat aktivitas" href={activityUrl} />
                        )
                      }
                    />
                  )}
                </MotionStack>
              )}
            </VStack>
          </VStack>
        </LayoutContent>
      }
    />
      {isNarrow && (
        <FormDialog
          isOpen={narrowInfoOpen}
          onOpenChange={setNarrowInfoOpen}
          title={`Informasi · ${customer.name}`}
        >
          <VStack padding={4} gap={4}>
            {customerInfoFacts}
          </VStack>
        </FormDialog>
      )}
      {d.consignment_form_default && (
        <FormDialog
          isOpen={consignOpen}
          onOpenChange={(open) => {
            if (!open && !busy) {
              setConsignOpen(false);
              setConsignRetry(false);
            }
          }}
          title={`Catat kunjungan titip jual · ${customer.name}`}
          footer={
            <HStack hAlign="end">
              <Button
                form="customer-consignment-form"
                type="submit"
                variant="primary"
                isLoading={busy}
                label="Simpan kunjungan titip jual"
              />
            </HStack>
          }
        >
          <VStack padding={6} gap={4}>
            <Text color="secondary">
              Catat hasil pemeriksaan fisik barang titip jual di apotek. Sistem
              otomatis memperbarui saldo stok apotek, memotong/mengembalikan
              stok gudang, dan mencatat presensi kunjungan harian Anda.
            </Text>
            <SimpleForm
              spec={
                consignRetry
                  ? d.consignment_form
                  : {
                      ...d.consignment_form_default,
                      fields: d.consignment_form_default.fields.map((f: Row) => {
                        const existing = (d.consignment?.items || []).find(
                          (i: Row) =>
                            String(i.product_id) === String(selectedProductId),
                        );
                        if (f.key === "product_id" && selectedProductId)
                          return { ...f, value: selectedProductId };
                        if (f.key === "remaining_stock" && existing)
                          return {
                            ...f,
                            value: String(existing.quantity_on_display),
                          };
                        return f;
                      }),
                    }
              }
              onValuesChange={(
                name,
                value,
                values,
              ): Record<string, string | boolean> => {
                if (name === "product_id") {
                  const found = (d.consignment?.items || []).find(
                    (i: Row) => String(i.product_id) === String(value),
                  );
                  return {
                    sold_quantity: "0",
                    remaining_stock: found
                      ? String(found.quantity_on_display)
                      : "0",
                  };
                }
                if (name === "sold_quantity") {
                  const found = (d.consignment?.items || []).find(
                    (i: Row) =>
                      String(i.product_id) === String(values.product_id),
                  );
                  if (!found) return {};
                  const prev = Number(found.quantity_on_display || 0);
                  const sold = Math.max(0, Number(value || 0));
                  return {
                    remaining_stock: String(Math.max(0, prev - sold)),
                  };
                }
                return {};
              }}
              preview={(values) => {
                const found = (d.consignment?.items || []).find(
                  (i: Row) =>
                    String(i.product_id) === String(values.product_id),
                );
                const directive = (d.carry_directives || []).find(
                  (item: Row) =>
                    String(item.product_id) === String(values.product_id) &&
                    item.directive,
                );
                const prev = Number(found?.quantity_on_display || 0);
                const sold = Number(values.sold_quantity || 0);
                const rem = Number(values.remaining_stock || 0);
                const added = Number(values.added_quantity || 0);
                const ret = Number(values.returned_quantity || 0);
                const closing = Math.max(0, rem - ret + added);
                const unitPrice = Number(found?.price_rupiah || 0);
                const discountPct = Number(customer.discount_percent ?? 16);
                const grossRp = sold * unitPrice;
                const netRp =
                  sold > 2
                    ? Math.floor((grossRp * (100 - discountPct)) / 100)
                    : 0;
                return (
                  <VStack gap={3}>
                    {directive && (
                      <Banner
                        status={
                          directive.directive.code === "STOP"
                            ? "error"
                            : "warning"
                        }
                        title={`Arahan Manajer (${directive.directive.label})`}
                        description={`${directive.directive.reason}${directive.directive.substitute_name ? ` · Produk pengganti: ${directive.directive.substitute_name}` : ""}`}
                      />
                    )}
                    <Fact label="Ringkasan perubahan stok apotek">
                      Stok awal di apotek: {quantity(prev)} → Stok akhir setelah
                      kunjungan: {quantity(closing)} unit.
                    </Fact>
                    <Fact label="Aturan tagihan titip jual (> 2 item) & diskon mitra">
                      {sold <= 2
                        ? `Terjual ${quantity(sold)} item (≤ 2 item): Belum ditagih pada kunjungan ini (menunggu akumulasi kunjungan berikutnya).`
                        : `Terjual ${quantity(sold)} item (> 2 item): Wajib ditagih · Diskon ${customer.outlet_type_label || "Apotek"} ${discountPct}%${unitPrice > 0 ? ` → Tagihan bersih ${money(netRp)}` : ""}.`}
                    </Fact>
                  </VStack>
                );
              }}
              id="customer-consignment-form"
              hideSubmit
              action={`/customers/${customer.id}/consignment/`}
              label="Simpan kunjungan titip jual"
            />
          </VStack>
        </FormDialog>
      )}
    </>
  );
}
