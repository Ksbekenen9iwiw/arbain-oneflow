import { MotionStack } from "../motion";
import { RecordIdentity } from "../RecordIdentity";
import { ProductIdentity } from "../ProductIdentity";
import { withReturn } from "../navigation";
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Adapted from original Astryx 0.7 dashboard + dashboard-scorecard templates.
// Native scorecards, trend, goal progress and work table; all records supplied by Django.
import { lazy, Suspense, useState, type ReactNode } from "react";
import { ChartSkeleton } from "../Loading";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import {
  ArrowPathIcon,
  AdjustmentsHorizontalIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Card } from "@astryxdesign/core/Card";
import { Grid, GridSpan } from "@astryxdesign/core/Grid";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Selector } from "@astryxdesign/core/Selector";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import {
  VStack,
  HStack,
  Text,
  Heading,
  Button,
  Link,
  PageHeader,
  DataTable,
  Status,
  Fact,
  Banner,
  money,
  quantity,
  dateLabel,
  SimpleForm,
  FormDialog,
  Empty,
} from "../ui";
import { StockCondition } from "./StockParts";
import { OrderTable } from "./Records";
import { useApp, useQueryState } from "../router";
import {
  dashboardQueue,
  activityMatches,
  recommendationEffect,
  recommendationSubmitLabel,
} from "../dashboard";
import type { Row, FormSpec } from "../types";
const ShipmentTrend = lazy(() => import("./ShipmentTrend"));

function Metric({
  label,
  value,
  detail,
  action,
}: {
  label: string;
  value: string;
  detail: string;
  action: ReactNode;
}) {
  return (
    <Card padding={3}>
      <VStack gap={1}>
        <Text type="supporting">{label}</Text>
        <Text size="2xl" weight="semibold" hasTabularNumbers>
          {value}
        </Text>
        <Text type="supporting">{detail}</Text>
        <HStack hAlign="start">{action}</HStack>
      </VStack>
    </Card>
  );
}

export default function Today() {
  const { page, busy, navigate } = useApp();
  const d = page.data,
    m = d.metrics,
    warehouse = page.role === "WAREHOUSE",
    sales = page.role === "SALES",
    manager = page.role === "MANAGER";
  const [requestedQueue, setQueue] = useQueryState(
    "view",
    warehouse ? "shipping" : "activities",
  );
  const queue = dashboardQueue(page.role, requestedQueue);
  const [requestedSchedule, setSchedule] = useQueryState(
    "schedule",
    "priority",
  );
  const schedule = ["priority", "all", "late", "today", "future"].includes(
    requestedSchedule,
  )
    ? requestedSchedule
    : "priority";
  const [expanded, setExpanded] = useQueryState("activities", "limited");
  const allActivities = expanded === "all";
  const setAllActivities = (value: boolean | ((v: boolean) => boolean)) =>
    setExpanded(
      (typeof value === "function" ? value(allActivities) : value)
        ? "all"
        : "limited",
    );
  const [selected, setSelected] = useState<Row | null>(d.action_dialog || null),
    [target, setTarget] = useState(!!d.target_dialog);
  const [retryDialog, setRetryDialog] = useState(
    !!(d.action_dialog || d.target_dialog),
  );
  const [targetView, setTargetView] = useQueryState("targets", "hidden");
  const showTargets = targetView === "shown";
  const setShowTargets = (value: boolean | ((v: boolean) => boolean)) =>
    setTargetView(
      (typeof value === "function" ? value(showTargets) : value)
        ? "shown"
        : "hidden",
    );
  const close = (open: boolean) => {
    if (!open && !busy) {
      setSelected(null);
      setTarget(false);
      setRetryDialog(false);
    }
  };
  const goal = m.target_summary;
  const pct = (n: number) =>
    n.toLocaleString("id-ID", { maximumFractionDigits: 1 }) + "%";
  const monthLabel = new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(new Date(page.today + "T12:00:00+07:00"));
  const dashboardUrl = (values: Record<string, string>) => {
    const q = new URLSearchParams(page.url.split("?")[1]);
    for (const [k, v] of Object.entries(values)) q.set(k, v);
    if (!values.all) q.delete("all");
    return "/?" + q;
  };
  const ordersUrl = (status: string, month = false) => {
    const q = new URLSearchParams({ status });
    if (d.selected_sales) q.set("sales", d.selected_sales);
    if (month) {
      q.set("shipped_from", page.today.slice(0, 8) + "01");
      q.set("shipped_to", page.today);
    }
    return "/orders/?" + q;
  };
  const agenda: Row[] = d.agenda || [];
  const matches = (a: Row, mode: string) =>
    activityMatches(a.due, mode, page.today);
  const filtered = agenda.filter((a) => matches(a, schedule));
  const focusQueue = (mode: string, scheduleMode = "priority") => {
    setQueue(mode);
    setSchedule(scheduleMode);
    setAllActivities(false);
    requestAnimationFrame(() =>
      document.getElementById("work-queue")?.scrollIntoView({ block: "start" }),
    );
  };
  const [outcome, setOutcome] = useState(
    String(
      d.action_form?.fields.find((f: Row) => f.key === "outcome")?.value || "",
    ),
  );
  const actionForm = retryDialog ? d.action_form : d.action_form_default;
  const spec: FormSpec | undefined = selected
    ? {
        ...actionForm,
        fields: actionForm.fields.map((f: Row) =>
          f.key === "key"
            ? { ...f, value: selected.key }
            : f.key === "order_id"
              ? {
                  ...f,
                  type: "select",
                  label: "Pesanan terkait",
                  help: "Opsional. Pilih pesanan pelanggan ini sebagai hasil tindakan.",
                  choices: [
                    { value: "", label: "Tanpa pesanan" },
                    ...d.action_orders
                      .filter(
                        (o: Row) =>
                          o.customer.id === selected.customer_id &&
                          o.sales.id === o.customer.owner.id,
                      )
                      .map((o: Row) => ({
                        value: o.id,
                        label: `${o.number} · ${o.customer.name} · ${o.status_label}`,
                      })),
                  ],
                }
              : f,
        ),
      }
    : undefined;
  const metrics = warehouse && (
    <Grid columns={3} gap={3}>
      {warehouse && (
        <Metric
          label="Menunggu pengiriman"
          value={m.pending_shipment_count}
          detail="Pesanan sudah dikonfirmasi"
          action={
            <Button
              size="sm"
              variant="secondary"
              label="Lihat antrean"
              onClick={() => focusQueue("shipping")}
            />
          }
        />
      )}
      {warehouse && (
        <Metric
          label="Stok menipis"
          value={m.low_stock_count}
          detail="Stok tersedia di bawah minimum"
          action={
            <Button
              size="sm"
              href="/stock/?filter=low&status=active"
              variant="secondary"
              label="Periksa stok"
            />
          }
        />
      )}
      {warehouse && (
        <Metric
          label="Konflik stok"
          value={m.stock_conflict_count}
          detail="Stok fisik di bawah reservasi"
          action={
            <Button
              size="sm"
              href="/stock/?filter=conflict"
              variant="secondary"
              label="Tinjau reservasi"
            />
          }
        />
      )}
    </Grid>
  );
  const analytics = !warehouse && (
    <Grid columns={3} gap={6}>
      <GridSpan columns={2}>
        <Suspense fallback={<ChartSkeleton />}>
          <ShipmentTrend
            days={m.shipment_days}
            today={page.today}
            defaultPeriod={sales ? "30" : "month"}
          />
        </Suspense>
      </GridSpan>
      <VStack gap={5}>
        <VStack gap={3}>
          <HStack hAlign="between" vAlign="center">
            <Heading level={3} accessibilityLevel={2}>
              Target bulanan
            </Heading>
            {d.target_form && (
              <IconButton
                label="Atur target bulanan"
                tooltip="Atur target bulanan"
                icon={<Icon icon={AdjustmentsHorizontalIcon} />}
                size="sm"
                variant="secondary"
                onClick={() => setTarget(true)}
              />
            )}
          </HStack>
          <VStack gap={1}>
            <Text type="supporting">{monthLabel}</Text>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Text size="2xl" weight="semibold" hasTabularNumbers>
                {money(m.shipped_value_rupiah)}
              </Text>
              <Text type="supporting">terkirim</Text>
            </HStack>
          </VStack>
          {goal.achievement_percent != null ? (
            <>
              <HStack hAlign="between">
                <Text weight="semibold" hasTabularNumbers>
                  {pct(goal.achievement_percent)}
                </Text>
                <Text type="supporting">dari {money(goal.target_rupiah)}</Text>
              </HStack>
              <ProgressBar
                label="Capaian target bulan ini"
                isLabelHidden
                value={Math.min(100, goal.achievement_percent)}
                variant={goal.achievement_percent >= 100 ? "success" : "accent"}
              />
            </>
          ) : (
            <Text color="secondary">
              {goal.is_complete
                ? "Target Rp 0; persentase tidak dihitung."
                : page.role === "SALES"
                  ? "Target bulan ini belum ditetapkan. Hubungi manajer."
                  : "Target belum lengkap. Atur target setiap sales untuk melihat capaian tim."}
            </Text>
          )}
          <HStack gap={2} wrap="wrap">
            <Button
              size="sm"
              variant="secondary"
              href={ordersUrl("SHIPPED", true)}
              label={`${m.shipped_order_count} pesanan`}
              tooltip="Lihat pesanan terkirim bulan ini"
            />
            <Button
              size="sm"
              variant="secondary"
              label="Rincian target"
              aria-expanded={showTargets}
              aria-controls="target-details"
              onClick={() => {
                setShowTargets((v) => !v);
                requestAnimationFrame(() =>
                  document
                    .getElementById("target-details")
                    ?.scrollIntoView({ block: "nearest" }),
                );
              }}
            />
          </HStack>
        </VStack>
        <VStack gap={2}>
          <Text type="supporting">Stok seluruh gudang</Text>
          {Number(m.stock_conflict_count) > 0 && (
            <Button
              href="/stock/?filter=conflict"
              size="sm"
              variant="secondary"
              label={`${m.stock_conflict_count} produk · konflik stok`}
              icon={<Icon icon="error" color="error" />}
            />
          )}
          {Number(m.low_stock_count) > 0 ? (
            <Button
              href="/stock/?filter=low&status=active"
              size="sm"
              variant="secondary"
              label={`${m.low_stock_count} produk di bawah minimum`}
              icon={<Icon icon="warning" color="warning" />}
            />
          ) : (
            <Text type="supporting">Stok tersedia memenuhi batas minimum.</Text>
          )}
        </VStack>
      </VStack>
    </Grid>
  );
  // Astryx Table bleeds through the inherited bottom padding. Reserve that
  // padding within each table section so the next section retains its gap.
  const targets = !warehouse && showTargets && (
    <MotionStack
      preset="expand"
      gap={3}
      paddingBlockEnd={6}
      id="target-details"
    >
      <HStack hAlign="between">
        <Heading level={3} accessibilityLevel={2}>
          {manager ? "Capaian per sales" : "Rincian target"} · {monthLabel}
        </Heading>
        <IconButton
          label="Tutup rincian target"
          tooltip="Tutup rincian target"
          icon={<Icon icon={XMarkIcon} />}
          variant="secondary"
          size="sm"
          onClick={() => {
            setShowTargets(false);
            requestAnimationFrame(() =>
              document
                .querySelector<HTMLButtonElement>(
                  '[aria-controls="target-details"]',
                )
                ?.focus(),
            );
          }}
        />
      </HStack>
      <DataTable
        rows={m.sales_rows.map((r: Row) => ({
          ...r,
          id: r.sales_id,
        }))}
        columns={[
          {
            key: "sales_name",
            header: "Sales",
            renderCell: (r) => <RecordIdentity name={r.sales_name} />,
          },
          ...(manager
            ? [
                {
                  key: "overdue_activity_count",
                  header: "Terlambat",
                  align: "end" as const,
                  renderCell: (r: Row) => (
                    <Button
                      href={dashboardUrl({
                        sales: r.sales_id,
                        view: "activities",
                        schedule: "late",
                      })}
                      size="sm"
                      variant="secondary"
                      label={`${r.overdue_activity_count} aktivitas`}
                    />
                  ),
                },
                {
                  key: "pending_shipment_count",
                  header: "Menunggu kirim",
                  align: "end" as const,
                  renderCell: (r: Row) => (
                    <Button
                      href={dashboardUrl({
                        sales: r.sales_id,
                        view: "shipping",
                      })}
                      size="sm"
                      variant="secondary"
                      label={`${r.pending_shipment_count} pesanan`}
                    />
                  ),
                },
              ]
            : []),
          {
            key: "shipped_value_rupiah",
            header: "Nilai terkirim",
            align: "end",
            renderCell: (r) => <Text>{money(r.shipped_value_rupiah)}</Text>,
          },
          {
            key: "target_rupiah",
            header: "Target",
            align: "end",
            renderCell: (r) => (
              <Text>
                {r.target_set ? money(r.target_rupiah) : "Belum ditetapkan"}
              </Text>
            ),
          },
          {
            key: "achievement_percent",
            header: "Capaian",
            align: "end",
            renderCell: (r) => (
              <Text>
                {r.achievement_percent == null
                  ? "—"
                  : pct(r.achievement_percent)}
              </Text>
            ),
          },
        ]}
      />
    </MotionStack>
  );
  const workQueue = (
    <VStack gap={3} paddingBlockEnd={6} id="work-queue">
      {!warehouse && (
        <HStack hAlign="between" vAlign="center">
          <VStack gap={1}>
            <Heading level={2}>
              {sales
                ? "Pekerjaan saya"
                : d.selected_sales
                  ? "Pekerjaan sales"
                  : "Pekerjaan tim"}
            </Heading>
          </VStack>
          <Button
            href="/customers/"
            size="sm"
            variant="secondary"
            label={sales ? "Jadwalkan aktivitas" : "Lihat pelanggan"}
          />
        </HStack>
      )}
      {!warehouse && (
        <TabList
          value={queue}
          onChange={setQueue}
          role="tablist"
          aria-label="Antrean kerja"
          hasDivider
        >
          {!warehouse && (
            <Tab
              value="activities"
              label={`Aktivitas (${agenda.length})`}
              panelId="queue-activities"
            />
          )}
          {!warehouse && (
            <Tab
              value="recommendations"
              label={`Rekomendasi (${d.action_count})`}
              panelId="queue-recommendations"
            />
          )}
          <Tab
            value="shipping"
            label={`Pengiriman (${m.pending_shipment_count})`}
            panelId="queue-shipping"
          />
        </TabList>
      )}
      {!warehouse && queue === "activities" && (
        <MotionStack
          motionKey={queue}
          gap={3}
          id="queue-activities"
          role="tabpanel"
          aria-label="Aktivitas"
        >
          <HStack hAlign="between" gap={3} vAlign="center">
            <SegmentedControl
              label="Jadwal aktivitas"
              value={schedule}
              onChange={(v) => {
                setSchedule(v);
                setAllActivities(false);
              }}
              size="sm"
            >
              <SegmentedControlItem value="priority" label="Perlu dikerjakan" />
              <SegmentedControlItem value="all" label="Semua" />
              <SegmentedControlItem
                value="late"
                label={`Terlambat (${agenda.filter((a) => matches(a, "late")).length})`}
              />
              <SegmentedControlItem
                value="today"
                label={`Hari ini (${agenda.filter((a) => matches(a, "today")).length})`}
              />
              <SegmentedControlItem
                value="future"
                label="Mendatang / tanpa jadwal"
              />
            </SegmentedControl>
            {filtered.length > 5 && (
              <Button
                label={
                  allActivities ? "Ringkas" : `Lihat semua (${filtered.length})`
                }
                size="sm"
                variant="secondary"
                onClick={() => setAllActivities((v) => !v)}
              />
            )}
          </HStack>
          <DataTable
            rows={allActivities ? filtered : filtered.slice(0, 5)}
            empty={
              <Empty
                title="Tidak ada aktivitas pada jadwal ini"
                description={
                  schedule === "priority"
                    ? "Tidak ada aktivitas terlambat atau hari ini. Periksa jadwal mendatang atau catat aktivitas baru."
                    : "Pilih jadwal lain atau catat aktivitas dari halaman pelanggan."
                }
                action={
                  <Button
                    label={
                      agenda.length ? "Lihat semua jadwal" : "Lihat pelanggan"
                    }
                    href={agenda.length ? undefined : "/customers/"}
                    onClick={
                      agenda.length ? () => setSchedule("all") : undefined
                    }
                  />
                }
              />
            }
            columns={[
              {
                key: "customer",
                header: "Pelanggan",
                renderCell: (a) => (
                  <Link
                    href={withReturn(`/customers/${a.customer.id}/`, page.url)}
                    weight="semibold"
                  >
                    {a.customer.name}
                  </Link>
                ),
              },
              { key: "kind_label", header: "Aktivitas" },
              {
                key: "due",
                header: "Jadwal",
                renderCell: (a) => (
                  <HStack gap={2} wrap="wrap">
                    <Text>
                      {a.due ? dateLabel(a.due) : "Belum dijadwalkan"}
                    </Text>
                    {a.due && a.due < page.today && <Status value="OVERDUE" />}
                  </HStack>
                ),
              },
              ...(page.role === "MANAGER" && !d.selected_sales
                ? [
                    {
                      key: "sales",
                      header: "Sales",
                      renderCell: (a: Row) => (
                        <RecordIdentity
                          name={a.customer.owner?.name || a.sales.name}
                        />
                      ),
                    },
                  ]
                : []),
              {
                key: "action",
                header: "Tindakan",
                renderCell: (a) => (
                  <Button
                    href={withReturn(`/activities/${a.id}/complete/`, page.url)}
                    size="sm"
                    variant="secondary"
                    label="Catat hasil"
                  />
                ),
              },
            ]}
          />
        </MotionStack>
      )}
      {!warehouse && queue === "recommendations" && (
        <MotionStack
          motionKey={queue}
          gap={4}
          id="queue-recommendations"
          role="tabpanel"
          aria-label="Rekomendasi"
        >
          <HStack hAlign="between">
            <VStack gap={1}>
              <Heading level={2}>Prioritas pelanggan</Heading>
              <Text type="supporting">
                Saran dari jadwal tindak lanjut dan riwayat pembelian
              </Text>
            </VStack>
            {Number(d.action_count) > 5 && (
              <Button
                href={
                  d.show_all
                    ? dashboardUrl({ view: "recommendations" })
                    : dashboardUrl({
                        all: "1",
                        view: "recommendations",
                      })
                }
                size="sm"
                variant="secondary"
                label={d.show_all ? "Lima teratas" : "Lihat semua"}
              />
            )}
          </HStack>
          <DataTable
            rows={d.actions.map((a: Row) => ({ ...a, id: a.key }))}
            empty={
              <Empty
                title="Tidak ada rekomendasi saat ini"
                description="Aktivitas terjadwal tetap ada di tab Aktivitas. Rekomendasi muncul saat ada pemicu dari jadwal atau riwayat pembelian."
                action={
                  <Button
                    label="Lihat aktivitas"
                    onClick={() => focusQueue("activities")}
                  />
                }
              />
            }
            columns={[
              {
                key: "customer",
                header: "Pelanggan / tindakan",
                renderCell: (a) => (
                  <VStack gap={2}>
                    <Link
                      href={withReturn(
                        "/customers/" + a.customer_id + "/",
                        page.url,
                      )}
                      weight="semibold"
                    >
                      {a.reasons.customer_name}
                    </Link>
                    {a.kind === "FOLLOWUP" ? (
                      <Text type="supporting">Tindak lanjut</Text>
                    ) : (
                      <ProductIdentity
                        sku={a.reasons.product_sku}
                        name={a.reasons.product_name}
                        size="compact"
                      >
                        <Text type="supporting">{a.reasons.product_name}</Text>
                      </ProductIdentity>
                    )}
                    <Status value={a.state} />
                  </VStack>
                ),
              },
              {
                key: "due",
                header: "Jatuh tempo",
                renderCell: (a) => (
                  <VStack gap={1}>
                    <Text>{dateLabel(a.due_date)}</Text>
                    {a.due_date <= page.today && (
                      <Status
                        value={
                          a.due_date < page.today ? "OVERDUE" : "DUE_TODAY"
                        }
                        label={
                          a.due_date < page.today
                            ? "Terlambat " + a.reasons.overdue_days + " hari"
                            : "Hari ini"
                        }
                      />
                    )}
                  </VStack>
                ),
              },
              {
                key: "action",
                header: "Langkah berikutnya",
                renderCell: (a) => (
                  <VStack gap={2}>
                    {a.kind === "REORDER" && (
                      <Button
                        href={
                          a.state === "WAITING_STOCK"
                            ? withReturn(
                                "/stock/?q=" +
                                  encodeURIComponent(a.reasons.product_name),
                                page.url,
                              )
                            : "/orders/new/?" +
                              new URLSearchParams({
                                customer: a.customer_id,
                                product: a.product_id,
                                quantity: a.typical_quantity,
                                return_to: page.url,
                              })
                        }
                        size="sm"
                        variant="secondary"
                        label={
                          a.state === "WAITING_STOCK"
                            ? "Periksa stok"
                            : "Buat draft"
                        }
                      />
                    )}
                    <Button
                      label="Tinjau rekomendasi"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setRetryDialog(false);
                        setOutcome("");
                        setSelected(a);
                      }}
                    />
                  </VStack>
                ),
              },
            ]}
          />
        </MotionStack>
      )}
      {queue === "shipping" && (
        <MotionStack
          motionKey={queue}
          gap={4}
          id="queue-shipping"
          role={warehouse ? "region" : "tabpanel"}
          aria-label="Pengiriman"
        >
          <HStack hAlign="between">
            <Heading level={2}>Menunggu pengiriman</Heading>
            <Button
              href={ordersUrl("CONFIRMED")}
              size="sm"
              variant="secondary"
              label="Lihat semua"
            />
          </HStack>
          <OrderTable
            rows={d.pending_orders}
            empty={
              <Empty
                title="Tidak ada pesanan menunggu pengiriman"
                description="Pesanan yang dikonfirmasi akan tampil di sini."
              />
            }
          />
        </MotionStack>
      )}
    </VStack>
  );
  return (
    <>
      <Layout
        height="fill"
        defaultHasDividers
        header={
          <PageHeader
            title="Dashboard"
            description={dateLabel(page.today)}
            actions={
              <HStack gap={2}>
                <IconButton
                  size="md"
                  variant="secondary"
                  label="Perbarui dashboard"
                  tooltip={`Perbarui · terakhir ${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(d.updated_at))} WIB`}
                  icon={<Icon icon={ArrowPathIcon} />}
                  isLoading={busy}
                  onClick={() => void navigate(page.url, true)}
                />
                {warehouse && (
                  <Button
                    label="Produk & stok"
                    href={withReturn("/stock/", page.url)}
                  />
                )}
                {page.role === "MANAGER" && (
                  <Selector
                    label="Cakupan sales"
                    isLabelHidden
                    width="12rem"
                    value={d.selected_sales}
                    options={[
                      { value: "", label: "Seluruh tim" },
                      ...d.sales_options,
                    ]}
                    isDisabled={busy}
                    onChange={(sales) => void navigate(dashboardUrl({ sales }))}
                  />
                )}
                <Button
                  label={warehouse ? "Lihat pengiriman" : "Buat pesanan"}
                  variant="primary"
                  href={
                    warehouse
                      ? ordersUrl("CONFIRMED")
                      : withReturn("/orders/new/", page.url)
                  }
                />
              </HStack>
            }
          />
        }
        content={
          <LayoutContent padding={6} data-oneflow-scroll>
            <VStack gap={6}>
              {analytics}
              {metrics}
              {workQueue}
              {targets}
              {warehouse && (
                <VStack gap={3}>
                  <HStack hAlign="between">
                    <Heading level={2}>Stok perlu perhatian</Heading>
                    <Button
                      href={withReturn("/stock/", page.url)}
                      size="sm"
                      variant="secondary"
                      label="Lihat semua produk"
                    />
                  </HStack>
                  <Text type="supporting">
                    Konflik reservasi didahulukan, lalu produk aktif di bawah
                    minimum. Maksimal 5 produk.
                  </Text>
                  <DataTable
                    rows={d.stock_attention || []}
                    empty={
                      <Empty
                        title="Tidak ada konflik atau stok menipis"
                        description="Stok tersedia memenuhi batas minimum yang ditetapkan."
                      />
                    }
                    columns={[
                      {
                        key: "name",
                        header: "Produk",
                        renderCell: (p) => (
                          <ProductIdentity sku={p.sku} name={p.name} size="row">
                            <VStack gap={1}>
                              <Link
                                href={withReturn(
                                  `/products/${p.id}/`,
                                  page.url,
                                )}
                                weight="semibold"
                              >
                                {p.name}
                              </Link>
                              <Text type="supporting">
                                {p.sku}
                                {!p.is_active ? " · Nonaktif" : ""}
                              </Text>
                            </VStack>
                          </ProductIdentity>
                        ),
                      },
                      {
                        key: "stock_state",
                        header: "Kondisi",
                        renderCell: (p) => <StockCondition product={p} />,
                      },
                      { key: "on_hand", header: "Fisik", align: "end" },
                      { key: "reserved", header: "Direservasi", align: "end" },
                      {
                        key: "available",
                        header: "Tersedia",
                        align: "end",
                        renderCell: (p) => (
                          <Text>
                            {quantity(p.available)} {p.unit}
                          </Text>
                        ),
                      },
                      {
                        key: "action",
                        header: "Tindakan",
                        renderCell: (p) => (
                          <Button
                            href={withReturn(`/products/${p.id}/`, page.url)}
                            size="sm"
                            variant="secondary"
                            label="Periksa stok"
                          />
                        ),
                      },
                    ]}
                  />
                </VStack>
              )}
            </VStack>
          </LayoutContent>
        }
      />
      <FormDialog
        isOpen={!!selected || target}
        onOpenChange={close}
        title={
          target
            ? "Atur target bulanan"
            : selected?.reasons.customer_name || "Tinjau tindakan"
        }
        footer={
          <HStack hAlign="end">
            <Button
              form="dashboard-dialog-form"
              type="submit"
              variant="primary"
              isLoading={busy}
              label={
                target ? "Simpan target" : recommendationSubmitLabel(outcome)
              }
            />
          </HStack>
        }
      >
        <VStack padding={6} gap={6}>
          {target ? (
            <SimpleForm
              spec={retryDialog ? d.target_form : d.target_form_default}
              onValuesChange={(
                name,
                value,
                values,
              ): Record<string, string | boolean> => {
                if (name !== "sales" && name !== "month") return {};
                const saved = d.saved_targets.find(
                  (t: Row) =>
                    t.sales === values.sales &&
                    t.month === String(values.month).slice(0, 7),
                );
                return { target_rupiah: saved?.amount || "" };
              }}
              id="dashboard-dialog-form"
              hideSubmit
              action={withReturn("/targets/", page.url)}
              label="Simpan target"
              preview={(values) => {
                const current = m.sales_rows.find(
                  (r: Row) => r.sales_id === values.sales,
                );
                return current &&
                  String(values.month).slice(0, 7) ===
                    page.today.slice(0, 7) ? (
                  <Fact label="Target tersimpan bulan ini">
                    {money(current.target_rupiah)}
                  </Fact>
                ) : null;
              }}
            />
          ) : (
            selected &&
            spec && (
              <>
                <VStack gap={3}>
                  <Status value={selected.state} />
                  {selected.kind === "FOLLOWUP" ? (
                    <Text>
                      {selected.reasons.note ||
                        "Hubungi pelanggan sesuai jadwal."}
                    </Text>
                  ) : (
                    <>
                      <Fact label="Acuan pembelian">
                        {selected.reasons.product_name} ·{" "}
                        {quantity(selected.typical_quantity)}{" "}
                        {selected.reasons.unit}
                      </Fact>
                      <Fact label="Stok tersedia">
                        {quantity(selected.available_quantity)}{" "}
                        {selected.reasons.unit}
                      </Fact>
                      <Text color="secondary">
                        {selected.reasons.purchase_date_count} tanggal pembelian
                        · interval median {selected.reasons.interval_days} hari.
                      </Text>
                    </>
                  )}
                </VStack>
                {selected.kind === "FOLLOWUP" &&
                  selected.reasons.activity_id && (
                    <Button
                      href={withReturn(
                        `/activities/${selected.reasons.activity_id}/complete/`,
                        page.url,
                      )}
                      size="sm"
                      variant="secondary"
                      label="Catat hasil aktivitas & tindak lanjut berikutnya"
                    />
                  )}
                <SimpleForm
                  spec={spec}
                  id="dashboard-dialog-form"
                  hideSubmit
                  action={withReturn("/actions/decision/", page.url)}
                  label="Simpan keputusan"
                  onValuesChange={(
                    name,
                    value,
                  ): Record<string, string | boolean> => {
                    if (name !== "outcome") return {};
                    setOutcome(String(value));
                    return { next_date: "", order_id: "" };
                  }}
                  preview={(values) => (
                    <Banner
                      status="info"
                      title="Dampak setelah disimpan"
                      description={recommendationEffect(
                        selected.kind,
                        String(values.outcome || ""),
                        String(values.next_date || ""),
                      )}
                    />
                  )}
                />
              </>
            )
          )}
        </VStack>
      </FormDialog>
    </>
  );
}
