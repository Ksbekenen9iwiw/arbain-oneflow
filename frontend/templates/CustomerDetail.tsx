import { MotionPanel } from "../motion";
import { MotionStack } from "../motion";
import { withReturn, backLabel } from "../navigation";
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Astryx detail-page frame: record header, chronological List, and context rail.
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Grid } from "@astryxdesign/core/Grid";
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
} from "../ui";
import { useApp, useQueryState } from "../router";
import { OrderTable } from "./Records";
import type { Row } from "../types";

export default function CustomerDetail() {
  const { page } = useApp();
  const d = page.data,
    customer = d.customer;
  const [requestedTab, setTab] = useQueryState("tab", "history");
  const tab = requestedTab === "orders" ? "orders" : "history";
  const [requestedFilter, setFilter] = useQueryState("history", "all");
  const filter = ["all", "interactions", "orders"].includes(requestedFilter)
    ? requestedFilter
    : "all";
  const [expanded, setExpanded] = useQueryState("activities", "limited");
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
  return (
    <Layout
      height="fill"
      defaultHasDividers
      header={
        <PageHeader
          title={customer.name}
          description={`${customer.code} · ${customer.is_active ? "Aktif" : "Nonaktif"}`}
          back={{ href: d.back_url, label: backLabel(d.back_url) }}
          actions={
            <HStack gap={2}>
              <Button
                label="Catat aktivitas"
                variant="primary"
                href={activityUrl}
              />
              {customer.is_active && (
                <Button label="Buat pesanan" href={orderUrl} />
              )}
            </HStack>
          }
        />
      }
      end={
        panel ? (
          <MotionPanel width="17rem" padding={4}>
            <VStack gap={6}>
              <HStack hAlign="between" vAlign="center">
                <Heading level={2}>Informasi</Heading>
                <Button
                  variant="ghost"
                  label="Sembunyikan"
                  onClick={() => setPanel(false)}
                />
              </HStack>
              <Fact label="Penanggung jawab">{customer.owner.name}</Fact>
              <Fact label="Tahap terakhir dicatat">
                {d.latest_stage || "Belum ada aktivitas"}
              </Fact>
              <Fact label="Telepon">{customer.phone || "Belum diisi"}</Fact>
              <Fact label="Alamat">{customer.address || "Belum diisi"}</Fact>
            </VStack>
          </MotionPanel>
        ) : undefined
      }
      content={
        <LayoutContent padding={6} data-oneflow-scroll>
          <VStack gap={6}>
            {!customer.is_active && (
              <Banner
                status="info"
                title="Pelanggan nonaktif"
                description="Riwayat dan pencatatan aktivitas tetap tersedia. Pesanan baru hanya dapat dibuat untuk pelanggan aktif."
              />
            )}
            <VStack gap={4} data-tour="customer-overview">
              <HStack hAlign="between" vAlign="center">
                <Heading level={2}>Ringkasan pelanggan</Heading>
                {!panel && (
                  <Button
                    label="Tampilkan informasi"
                    variant="ghost"
                    onClick={() => setPanel(true)}
                  />
                )}
              </HStack>
              <Grid columns={2} gap={6}>
                <VStack gap={2}>
                  <Text type="supporting">Interaksi terakhir tercatat</Text>
                  {last ? (
                    <>
                      <Text weight="semibold">
                        {last.kind_label} · {last.stage}
                      </Text>
                      <Text maxLines={2}>{last.result}</Text>
                      <Text type="supporting">{activityTiming(last)}</Text>
                      <HStack>
                        <Button
                          label="Baca hasil interaksi →"
                          variant="ghost"
                          size="sm"
                          onClick={() => showHistory(last.id)}
                        />
                      </HStack>
                    </>
                  ) : (
                    <>
                      <Text>Belum ada hasil interaksi</Text>
                      <Link
                        href={withReturn(
                          `/customers/${customer.id}/activities/new/?intent=done`,
                          page.url,
                        )}
                      >
                        Catat interaksi pertama →
                      </Link>
                    </>
                  )}
                </VStack>
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
                          label={`Lihat pesanan (${d.orders.length}) →`}
                          variant="ghost"
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
                        <Link href={orderUrl}>Buat pesanan pertama →</Link>
                      )}
                    </>
                  )}
                </VStack>
              </Grid>
            </VStack>
            <VStack gap={3} id="customer-reorder">
              <VStack gap={1}>
                <Heading level={2}>Perkiraan pembelian ulang</Heading>
                <Text type="supporting">
                  Maksimal 6 tanggal terakhir · per pasangan pelanggan–produk.
                </Text>
              </VStack>
              {(d.reorder_patterns || []).length ||
              (d.thin_history || []).length ? (
                <List hasDividers density="balanced">
                  {(d.reorder_patterns || []).map((p: Row) => (
                    <ListItem
                      key={p.product_sku}
                      label={`${p.product_name} · Perkiraan ${dateLabel(p.next_due)}`}
                      description={
                        <VStack gap={2}>
                          <Text type="supporting">
                            Terakhir {dateLabel(p.last_purchase_date)} ·{" "}
                            {p.purchase_date_count} tanggal · interval{" "}
                            {(p.intervals_days || []).join(", ")} hari (median{" "}
                            {p.interval_days}). Acuan {quantity(p.typical_quantity)}{" "}
                            {p.unit} · tersedia {quantity(p.available_quantity)}.
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
                <Empty
                  title="Belum ada riwayat pembelian"
                  description="Pembelian terkirim akan membentuk pola perkiraan di sini."
                />
              )}
            </VStack>
            <VStack
              gap={3}

              id="customer-agenda"
            >
              <HStack hAlign="between" vAlign="center" gap={2}>
                <VStack gap={1}>
                  <Heading level={2}>
                    Aktivitas berikutnya ({opened.length})
                  </Heading>
                  <Text type="supporting">
                    {Number(d.overdue_count) > 0
                      ? `${d.overdue_count} terlambat · `
                      : ""}
                    Jadwal terawal lebih dahulu.
                  </Text>
                </VStack>
                {opened.length > 3 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    label={
                      expanded === "all"
                        ? "Ringkas aktivitas"
                        : `Lihat semua (${opened.length})`
                    }
                    onClick={() =>
                      setExpanded(expanded === "all" ? "limited" : "all")
                    }
                  />
                )}
              </HStack>
              {opened.length ? (
                <List hasDividers density="balanced">
                  {(expanded === "all" ? opened : opened.slice(0, 3)).map(
                    (a) => (
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
                                  variant="ghost"
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
                    ),
                  )}
                </List>
              ) : (
                <Empty
                  title="Belum ada aktivitas berikutnya"
                  description="Jadwalkan kunjungan atau tindak lanjut berdasarkan hasil interaksi terakhir."
                  action={
                    <Button label="Jadwalkan aktivitas" href={activityUrl} />
                  }
                />
              )}
            </VStack>
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
              </TabList>
              {tab === "orders" ? (
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
                            <Button label="Buat pesanan" href={orderUrl} />
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
                                          variant="ghost"
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
                            variant="ghost"
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
  );
}
