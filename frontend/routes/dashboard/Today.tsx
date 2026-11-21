import { Collapsible } from "@astryxdesign/core/Collapsible";
import { MotionStack } from "../../motion";
import { RecordIdentity } from "../../RecordIdentity";
import { ProductIdentity } from "../../ProductIdentity";
import { withReturn } from "../../navigation";
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Adapted from original Astryx 0.7 dashboard + dashboard-scorecard templates.
// Native scorecards, trend, goal progress and work table; all records supplied by Django.
import { lazy, Suspense, useEffect, useState } from "react";
import { ChartSkeleton } from "../../Loading";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
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
import { proportional } from "@astryxdesign/core/Table";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import {
  VStack,
  HStack,
  Text,
  Token,
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
  useResponsive,
} from "../../ui";
import { StockCondition } from "../stock/StockParts";
import { OrderTable } from "../orders/OrderTable";
import {
  ConsignmentAndAttendanceHub,
  DashboardAlarmPanel,
} from "./TodayConsignment";
import { useApp, useQueryState } from "../../router";
import { useDelayedBusy } from "../../RequestFeedback";
import {
  dashboardQueue,
  salesGreeting,
  activityMatches,
  recommendationEffect,
  recommendationSubmitLabel,
} from "../../dashboard";
import type { Row, FormSpec } from "../../types";
const ShipmentTrend = lazy(() => import("./ShipmentTrend"));

export default function Today() {
  const { page, busy, navigate, revision } = useApp();
  const delayedBusy = useDelayedBusy(busy);
  const { isMobile, isNarrow, contentPadding } = useResponsive();
  const [narrowAlarmOpen, setNarrowAlarmOpen] = useState(false);
  const d = page.data,
    m = d.metrics,
    warehouse = page.role === "WAREHOUSE",
    sales = page.role === "SALES",
    manager = page.role === "MANAGER";
  const hasApprovals = manager && (d.sample_tasks || []).length > 0;
  const [requestedQueue, setQueue] = useQueryState(
    "view",
    warehouse ? "shipping" : manager ? "overview" : "activities",
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
    [target, setTarget] = useState(!!d.target_dialog),
    [directiveOpen, setDirectiveOpen] = useState(!!d.directive_dialog),
    [directiveProduct, setDirectiveProduct] = useState<Row | null>(null),
    [rawMaterialOpen, setRawMaterialOpen] = useState(!!d.raw_material_dialog),
    [rawMaterialItem, setRawMaterialItem] = useState<Row | null>(null);
  const [retryDialog, setRetryDialog] = useState(
    !!(
      d.action_dialog ||
      d.target_dialog ||
      d.directive_dialog ||
      d.raw_material_dialog
    ),
  );
  useEffect(() => {
    setSelected(d.action_dialog || null);
    setTarget(!!d.target_dialog);
    setDirectiveOpen(!!d.directive_dialog);
    setRawMaterialOpen(!!d.raw_material_dialog);
    setRetryDialog(
      !!(
        d.action_dialog ||
        d.target_dialog ||
        d.directive_dialog ||
        d.raw_material_dialog
      ),
    );
  }, [revision]);
  const [alarmPanelState, setAlarmPanelState] = useQueryState(
    "alarm",
    "hidden",
  );
  const showAlarmPanel = alarmPanelState === "shown";
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
      setDirectiveOpen(false);
      setDirectiveProduct(null);
      setRawMaterialOpen(false);
      setRawMaterialItem(null);
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
    return withReturn("/orders/?" + q, page.url);
  };
  const agenda: Row[] = d.agenda || [];
  const matches = (a: Row, mode: string) =>
    activityMatches(a.due, mode, page.today);
  const showQueueTabs = !sales;
  const filtered = agenda.filter((a) => matches(a, schedule));
  const lateActivities = agenda.filter((a) => matches(a, "late")).length;
  const todayActivities = agenda.filter((a) => matches(a, "today")).length;
  const activityIds = new Set(agenda.map((a) => String(a.id)));
  const additionalRecommendations = (d.actions || []).filter(
    (item: Row) => !activityIds.has(String(item.reasons.activity_id)),
  );
  const hasMoreRecommendations =
    !d.show_all && Number(d.action_count) > (d.actions || []).length;
  const visibleRecommendations = sales ? additionalRecommendations : d.actions;
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
  const unverifiedStock = Number(m.unverified_stock_count || 0);
  const verifiedStock = Number(m.verified_active_stock_count || 0);
  const lowStock = Number(m.low_stock_count || 0);
  const stockConflicts = Number(m.stock_conflict_count || 0);
  const pendingOutlets = Number(d.company_setup?.outlets || 0);
  const hasCriticalAlert = (d.raw_material_alerts || []).some(
    (item: Row) => item.severity === "CRITICAL",
  );
  const alertCount = (d.raw_material_alerts || []).filter(
    (item: Row) => item.severity === "CRITICAL" || item.severity === "WARNING",
  ).length;
  const activeDirectives = (d.product_traction || []).filter(
    (item: Row) => item.directive,
  );
  const directiveCount = activeDirectives.length;
  const stockSummary = unverifiedStock
    ? "Saldo stok masih perlu diverifikasi."
    : verifiedStock
      ? "Tidak ada stok menipis pada produk aktif yang dipantau."
      : "Belum ada saldo produk aktif yang bisa dinilai.";
  const openAlarm = () => {
    if (isNarrow) setNarrowAlarmOpen(true);
    else setAlarmPanelState("shown");
  };
  const analytics = manager && (
    <Grid columns={isNarrow ? 1 : 3} gap={4}>
      <GridSpan columns={isNarrow ? 1 : 2}>
        <Card padding={4}>
          <Suspense fallback={<ChartSkeleton />}>
            <ShipmentTrend
              days={m.shipment_days}
              today={page.today}
              defaultPeriod="month"
            />
          </Suspense>
        </Card>
      </GridSpan>
      <Card padding={4}>
        <VStack gap={5}>
          <VStack gap={3}>
            <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
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
            <Text type="supporting">{monthLabel}</Text>
            {goal.achievement_percent != null ? (
              <>
                <HStack hAlign="between" wrap="wrap" gap={2}>
                  <Text size="2xl" weight="bold" hasTabularNumbers data-figure>
                    {pct(goal.achievement_percent)}
                  </Text>
                  <Text type="supporting">
                    dari {money(goal.target_rupiah)}
                  </Text>
                </HStack>
                <ProgressBar
                  label="Capaian target bulan ini"
                  isLabelHidden
                  value={Math.min(100, goal.achievement_percent)}
                  variant={
                    goal.achievement_percent >= 100 ? "success" : "accent"
                  }
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
                label="Pesanan terkirim bulan ini"
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
        </VStack>
      </Card>
    </Grid>
  );
  // Astryx Table bleeds through the inherited bottom padding. Reserve that
  // padding within each table section so the next section retains its gap.
  const salesOverview = sales && (
    <VStack gap={2} aria-label="Ringkasan sales">
      <Grid columns={isNarrow ? 1 : 3} gap={3}>
        <Card padding={4}>
          <VStack gap={4}>
            <Heading level={2}>Ringkasan</Heading>
            <HStack gap={2} wrap="wrap">
              {[
                { mode: "late", label: "terlambat", count: lateActivities },
                { mode: "today", label: "hari ini", count: todayActivities },
              ].map(({ mode, label, count }) => (
                <Button
                  key={mode}
                  label={`${quantity(count)} ${label}`}
                  variant={schedule === mode ? "primary" : "secondary"}
                  aria-pressed={schedule === mode}
                  aria-controls="queue-activities"
                  onClick={() =>
                    focusQueue(
                      "activities",
                      schedule === mode ? "priority" : mode,
                    )
                  }
                />
              ))}
            </HStack>
            <VStack gap={2}>
              <HStack hAlign="between" wrap="wrap" gap={2}>
                <Text weight="semibold">Target bulan ini</Text>
                <Text size="xl" weight="bold" hasTabularNumbers data-figure>
                  {goal.achievement_percent != null
                    ? pct(goal.achievement_percent)
                    : "Belum ditetapkan"}
                </Text>
              </HStack>
              {goal.achievement_percent != null && (
                <ProgressBar
                  label="Capaian target bulan ini"
                  isLabelHidden
                  value={Math.min(100, goal.achievement_percent)}
                  variant={
                    goal.achievement_percent >= 100 ? "success" : "accent"
                  }
                />
              )}
              <Text type="supporting">
                {goal.achievement_percent != null
                  ? `dari ${money(goal.target_rupiah)}`
                  : "Hubungi manajer untuk menetapkan target."}
              </Text>
            </VStack>
          </VStack>
        </Card>
        <GridSpan columns={isNarrow ? 1 : 2}>
          <Card padding={3}>
            <Suspense fallback={<ChartSkeleton />}>
              <ShipmentTrend
                days={m.shipment_days}
                today={page.today}
                defaultPeriod="30"
                compact
              />
            </Suspense>
          </Card>
        </GridSpan>
      </Grid>
    </VStack>
  );

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
            renderCell: (r) => (
              <Text hasTabularNumbers>{money(r.shipped_value_rupiah)}</Text>
            ),
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
      {(warehouse || manager) && (
        <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
          <Heading level={2}>
            {warehouse ? "Persiapan pengiriman" : "Daftar kerja tim"}
          </Heading>
          {manager && (
            <Button
              label="Tutup daftar"
              size="sm"
              variant="secondary"
              onClick={() => setQueue("overview")}
            />
          )}
        </HStack>
      )}
      {sales && queue !== "activities" && (
        <HStack hAlign="start">
          <Button
            size="sm"
            variant="secondary"
            label="Kembali ke agenda"
            onClick={() => focusQueue("activities", schedule)}
          />
        </HStack>
      )}
      {showQueueTabs && (
        <TabList
          value={queue}
          onChange={setQueue}
          role="tablist"
          aria-label="Antrean kerja"
          hasDivider
        >
          {!warehouse && (
            <Tab value="activities" label="Agenda" panelId="queue-activities" />
          )}
          {!warehouse && manager && (
            <Tab
              value="recommendations"
              label={`Rekomendasi (${d.action_count})`}
              panelId="queue-recommendations"
            />
          )}
          {(!sales || queue === "shipping") && (
            <Tab
              value="shipping"
              label={`Pengiriman (${m.pending_shipment_count})`}
              panelId="queue-shipping"
            />
          )}
          {!sales && (
            <Tab
              value="samples"
              label={
                manager
                  ? "Persetujuan sampel"
                  : sales
                    ? "Evaluasi sampel"
                    : "Pengiriman sampel"
              }
              panelId="queue-samples"
            />
          )}
        </TabList>
      )}
      {!warehouse && queue === "activities" && (
        <MotionStack
          motionKey={queue}
          gap={3}
          id="queue-activities"
          role={showQueueTabs ? "tabpanel" : "region"}
          aria-label="Agenda"
        >
          <HStack hAlign="between" gap={3} vAlign="end" wrap="wrap">
            {sales && <Heading level={2}>Agenda</Heading>}
            <Selector
              label={sales ? "Filter agenda" : "Jadwal"}
              value={schedule}
              width={isMobile ? "100%" : "14rem"}
              options={[
                { value: "priority", label: "Perlu dikerjakan" },
                { value: "all", label: "Semua jadwal" },
                { value: "late", label: "Terlambat" },
                { value: "today", label: "Hari ini" },
                { value: "future", label: "Mendatang / tanpa jadwal" },
              ]}
              onChange={(value) => {
                setSchedule(value);
                setAllActivities(false);
              }}
            />
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
                kind={schedule === "priority" ? "complete" : "search"}
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
                    href={
                      agenda.length
                        ? undefined
                        : withReturn("/customers/", page.url)
                    }
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
                width: sales ? proportional(1.45, { minWidth: 120 }) : undefined,
                renderCell: (a) => (
                  <Link
                    href={withReturn(`/customers/${a.customer.id}/`, page.url)}
                    weight="semibold"
                  >
                    {a.customer.name}
                  </Link>
                ),
              },
              {
                key: "kind_label",
                header: "Aktivitas",
                width: sales ? proportional(1.65, { minWidth: 140 }) : undefined,
                renderCell: (activity) => (
                  <VStack gap={1}>
                    <Text>{activity.kind_label}</Text>
                    {sales && activity.note?.trim() && (
                      <Text
                        type="supporting"
                        style={{
                          whiteSpace: "pre-line",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {activity.note.trim()}
                      </Text>
                    )}
                  </VStack>
                ),
              },
              {
                key: "due",
                header: "Jadwal",
                width: sales ? proportional(0.9, { minWidth: 106 }) : undefined,
                renderCell: (a) => (
                  <HStack gap={2} wrap="wrap">
                    <Text>
                      {a.due
                        ? dateLabel(a.due)
                        : sales
                          ? "—"
                          : "Belum dijadwalkan"}
                    </Text>
                    {!sales && matches(a, "late") && (
                      <Status value="OVERDUE" />
                    )}
                  </HStack>
                ),
              },
              ...(sales
                ? [
                    {
                      key: "schedule_status",
                      header: "Status",
                      width: proportional(0.9, { minWidth: 110 }),
                      renderCell: (activity: Row) => {
                        const status = matches(activity, "late")
                          ? { label: "Terlambat", color: "red" as const }
                          : matches(activity, "today")
                            ? { label: "Hari ini", color: "blue" as const }
                            : {
                                label: activity.due
                                  ? "Mendatang"
                                  : "Tanpa jadwal",
                                color: "gray" as const,
                              };
                        return (
                          <Token
                            {...status}
                            size="sm"
                            style={{ borderRadius: "var(--radius-full)" }}
                          />
                        );
                      },
                    },
                  ]
                : []),
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
                align: "end",
                width: sales ? proportional(0.9, { minWidth: 110 }) : undefined,
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
          role={sales ? "region" : "tabpanel"}
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
            rows={visibleRecommendations.map((a: Row) => ({ ...a, id: a.key }))}
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
                            : "Buat draf"
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
          role={sales ? "region" : "tabpanel"}
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
            actionLabel={warehouse ? "Siapkan pengiriman" : "Lihat pesanan"}
            empty={
              <Empty
                kind="complete"
                title="Tidak ada pesanan menunggu pengiriman"
                description="Pesanan yang dikonfirmasi akan tampil di sini."
              />
            }
          />
        </MotionStack>
      )}
      {queue === "samples" && (
        <MotionStack
          motionKey={queue}
          gap={3}
          id="queue-samples"
          role={sales ? "region" : "tabpanel"}
          aria-label="Tugas sampel"
        >
          <HStack hAlign="between" gap={3} vAlign="center">
            <Text type="supporting">
              {manager
                ? "Pengajuan seluruh tim yang menunggu keputusan Anda."
                : warehouse
                  ? "Sampel disetujui yang menunggu pengiriman."
                  : "Sampel diterima pelanggan dan belum dievaluasi."}
              {(d.sample_tasks || []).length === 5
                ? " Ditampilkan 5 pengajuan."
                : ""}
            </Text>
            <Button
              size="sm"
              variant="secondary"
              label={sales ? "Semua sampel saya" : "Lihat semua"}
              href={withReturn(
                manager
                  ? "/samples/?status=SUBMITTED"
                  : warehouse
                    ? "/samples/?status=APPROVED&fulfillment=WAITING"
                    : "/samples/",
                page.url,
              )}
            />
          </HStack>
          <DataTable
            rows={d.sample_tasks || []}
            empty={
              <Empty
                kind="complete"
                title={
                  manager
                    ? "Tidak ada pengajuan menunggu persetujuan"
                    : warehouse
                      ? "Tidak ada sampel menunggu pengiriman"
                      : "Tidak ada evaluasi baru"
                }
                description={
                  sales
                    ? "Evaluasi yang sudah dicatat dan jadwal tindak lanjut dapat dilihat di Semua sampel saya."
                    : "Pengajuan akan muncul di sini ketika siap Anda tangani."
                }
              />
            }
            columns={[
              {
                key: "number",
                header: "Sampel",
                renderCell: (item) => (
                  <Text weight="semibold">{item.number}</Text>
                ),
              },
              { key: "customer_name", header: "Pelanggan" },
              ...(sales ? [] : [{ key: "sales_name", header: "Sales" }]),
              {
                key: "created_at",
                header: "Diajukan",
                renderCell: (item) => <Text>{dateLabel(item.created_at)}</Text>,
              },
              {
                key: "action",
                header: "Tindakan",
                renderCell: (item) => (
                  <Button
                    size="sm"
                    variant="secondary"
                    label={
                      manager
                        ? "Tinjau pengajuan"
                        : warehouse
                          ? "Siapkan sampel"
                          : "Buka evaluasi"
                    }
                    href={withReturn(
                      `/samples/${item.id}/?tab=${sales ? "evaluation" : "products"}`,
                      page.url,
                    )}
                  />
                ),
              },
            ]}
          />
        </MotionStack>
      )}
    </VStack>
  );
  const teamRows = (d.sales_options || [])
    .filter(
      (person: Row) =>
        !d.selected_sales || String(person.value) === String(d.selected_sales),
    )
    .map((person: Row) => {
      const assigned = agenda.filter(
        (activity) => String(activity.sales.id) === String(person.value),
      );
      return {
        id: String(person.value),
        name: person.label,
        today: assigned.filter((activity) => matches(activity, "today")).length,
        late: assigned.filter((activity) => matches(activity, "late")).length,
        total: assigned.length,
      };
    });
  const teamRecap = manager && (
    <VStack gap={3} id="team-recap">
      <HStack gap={3} wrap="wrap" vAlign="center" hAlign="between">
        <Heading level={2}>Rekap tim</Heading>
        <HStack gap={2} wrap="wrap" vAlign="center">
          <Selector
            label="Cakupan sales"
            isLabelHidden
            width="12rem"
            value={d.selected_sales}
            options={[{ value: "", label: "Seluruh tim" }, ...d.sales_options]}
            isDisabled={delayedBusy}
            onChange={(sales) => void navigate(dashboardUrl({ sales }))}
          />
          {requestedQueue === "overview" && (
            <Button
              label="Lihat daftar kerja"
              size="sm"
              variant="secondary"
              onClick={() => focusQueue("activities", "all")}
            />
          )}
        </HStack>
      </HStack>
      <DataTable
        rows={teamRows}
        empty={<Empty title="Belum ada Sales aktif" />}
        columns={[
          { key: "name", header: "Sales" },
          { key: "today", header: "Terjadwal hari ini", align: "end" },
          {
            key: "late",
            header: "Terlambat",
            align: "end",
            renderCell: (person) =>
              person.late ? (
                <HStack hAlign="end">
                  <Status value="OVERDUE" label={String(person.late)} />
                </HStack>
              ) : (
                <Text hasTabularNumbers>0</Text>
              ),
          },
          { key: "total", header: "Agenda terbuka", align: "end" },
          {
            key: "action",
            header: "Tindakan",
            renderCell: (person) => (
              <Button
                size="sm"
                variant="secondary"
                label="Lihat agenda"
                href={dashboardUrl({
                  sales: person.id,
                  view: "activities",
                  schedule: "all",
                  activities: "limited",
                })}
              />
            ),
          },
        ]}
      />
    </VStack>
  );
  const priorityItems = [
    !sales &&
      stockConflicts > 0 && {
        label: `${quantity(stockConflicts)} konflik stok`,
        action: "Tinjau konflik",
        href: "/stock/?filter=conflict",
      },
    !sales &&
      lowStock > 0 && {
        label: `${quantity(lowStock)} produk menipis`,
        action: "Periksa produk",
        href: "/stock/?filter=low&status=active",
      },
    !sales &&
      unverifiedStock > 0 && {
        label: `${quantity(unverifiedStock)} saldo perlu verifikasi`,
        action: "Tinjau saldo",
        href: "/stock/?filter=unverified",
      },
    pendingOutlets > 0 && {
      label: `${quantity(pendingOutlets)} outlet perlu verifikasi`,
      action: "Tinjau outlet",
      href: "/customers/?status=pending",
    },
    hasApprovals && {
      label: `${quantity(d.sample_tasks.length)} pengajuan perlu keputusan`,
      action: "Tinjau sampel",
      run: () => focusQueue("samples"),
    },
    !sales &&
      alertCount > 0 && {
        label: `${quantity(alertCount)} alarm bahan baku`,
        action: "Buka alarm",
        run: openAlarm,
      },
    manager &&
      directiveCount > 0 && {
        label: `${quantity(directiveCount)} arahan sales`,
        action: "Baca arahan",
        run: openAlarm,
      },
  ].filter((item) => item !== false);
  const salesFollowUp = sales &&
    queue === "activities" &&
    (additionalRecommendations.length > 0 ||
      hasMoreRecommendations ||
      (d.sample_tasks || []).length > 0 ||
      directiveCount > 0) && (
      <VStack gap={2}>
        <Heading level={2}>Perlu tindak lanjut</Heading>
        <List hasDividers density="compact">
          {directiveCount > 0 && (
            <ListItem
              label="Arahan manajer"
              description={`${activeDirectives[0].name} · ${activeDirectives[0].directive.label}${
                activeDirectives[0].directive.substitute_name
                  ? ` · Ganti dengan ${activeDirectives[0].directive.substitute_name}`
                  : ""
              }${directiveCount > 1 ? ` · +${directiveCount - 1} arahan` : ""}`}
              endContent={
                <Button
                  label="Baca arahan"
                  variant="secondary"
                  size="sm"
                  onClick={openAlarm}
                />
              }
            />
          )}
          {(d.sample_tasks || []).slice(0, 2).map((sample: Row) => (
            <ListItem
              key={sample.id}
              label={sample.customer_name}
              description={`Evaluasi sampel · ${sample.number}`}
              endContent={
                <Button
                  label="Buka evaluasi"
                  size="sm"
                  variant="secondary"
                  href={withReturn(
                    `/samples/${sample.id}/?tab=evaluation`,
                    page.url,
                  )}
                />
              }
            />
          ))}
          {additionalRecommendations.slice(0, 2).map((item: Row) => (
            <ListItem
              key={item.key}
              label={item.reasons.customer_name}
              description={
                item.kind === "REORDER"
                  ? `Pembelian ulang · ${item.reasons.product_name}`
                  : "Tindak lanjut pelanggan"
              }
              endContent={
                <Button
                  label="Tinjau rekomendasi"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setRetryDialog(false);
                    setOutcome("");
                    setSelected(item);
                  }}
                />
              }
            />
          ))}
        </List>
        {((d.sample_tasks || []).length > 2 ||
          additionalRecommendations.length > 2 ||
          hasMoreRecommendations) && (
          <HStack gap={3} wrap="wrap">
            {(d.sample_tasks || []).length > 2 && (
              <Link href={dashboardUrl({ view: "samples" })}>
                Semua evaluasi
              </Link>
            )}
            {(additionalRecommendations.length > 2 ||
              hasMoreRecommendations) && (
              <Link href={dashboardUrl({ view: "recommendations", all: "1" })}>
                Semua rekomendasi
              </Link>
            )}
          </HStack>
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
            title={
              sales
                ? salesGreeting(page.user?.name)
                : manager
                  ? "Dashboard manajer"
                  : "Dashboard"
            }
            description={dateLabel(page.today)}
            paddingBlockEnd={sales ? 3 : undefined}
            actions={
              sales ? undefined : (
                <HStack gap={2} wrap="wrap" vAlign="center">
                  <IconButton
                    size="md"
                    variant="secondary"
                    label="Perbarui dashboard"
                    tooltip={`Perbarui · terakhir ${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(d.updated_at))} WIB`}
                    icon={<Icon icon={ArrowPathIcon} />}
                    isLoading={busy}
                    onClick={() => void navigate(page.url, true)}
                  />
                  {(isNarrow || !showAlarmPanel) && (
                    <Button
                      label="Alarm & arahan"
                      variant="secondary"
                      onClick={openAlarm}
                    />
                  )}
                  {manager && hasApprovals && (
                    <Button
                      width={isMobile ? "100%" : undefined}
                      label={`Tinjau keputusan (${quantity(d.sample_tasks.length)})`}
                      variant="primary"
                      onClick={() => focusQueue("samples")}
                    />
                  )}
                  <Button
                    width={isMobile ? "100%" : undefined}
                    label={
                      warehouse ? "Buka pesanan siap kirim" : "Buat pesanan"
                    }
                    variant={warehouse ? "primary" : "secondary"}
                    href={
                      warehouse
                        ? ordersUrl("CONFIRMED")
                        : withReturn("/orders/new/", page.url)
                    }
                  />
                </HStack>
              )
            }
          />
        }
        end={
          !isNarrow && showAlarmPanel ? (
            <DashboardAlarmPanel
              role={page.role}
              rawMaterialAlerts={d.raw_material_alerts || []}
              productTraction={d.product_traction || []}
              onHide={() => setAlarmPanelState("hidden")}
              onEditRawMaterial={(material) => {
                setRetryDialog(false);
                setRawMaterialItem(material);
                setRawMaterialOpen(true);
              }}
              onEditDirective={(product) => {
                setRetryDialog(false);
                setDirectiveProduct(product || null);
                setDirectiveOpen(true);
              }}
            />
          ) : undefined
        }
        content={
          <LayoutContent
            padding={contentPadding}
            style={sales ? { paddingBlockStart: "var(--spacing-3)" } : undefined}
            data-oneflow-scroll
          >
            <VStack gap={sales ? 4 : 6}>
              {priorityItems.length > 0 && (
                <VStack gap={2}>
                  <Heading level={2}>Perlu ditangani</Heading>
                  {warehouse ? (
                    <HStack gap={2} wrap="wrap">
                      {priorityItems.map((item) => (
                        <Button
                          key={item.label}
                          label={item.label}
                          size="sm"
                          variant="secondary"
                          href={
                            item.href
                              ? withReturn(item.href, page.url)
                              : undefined
                          }
                          onClick={item.run}
                          icon={
                            item.action === "Tinjau konflik" ||
                            (item.action === "Buka alarm" &&
                              hasCriticalAlert) ? (
                              <Icon icon="error" color="error" />
                            ) : (
                              <Icon icon="warning" color="warning" />
                            )
                          }
                        />
                      ))}
                    </HStack>
                  ) : (
                    <List hasDividers density="compact">
                      {priorityItems.map((item) => (
                        <ListItem
                          key={item.label}
                          label={item.label}
                          endContent={
                            <Button
                              label={item.action}
                              size="sm"
                              variant="secondary"
                              href={
                                item.href
                                  ? withReturn(item.href, page.url)
                                  : undefined
                              }
                              onClick={item.run}
                              icon={
                                item.action === "Buka alarm" &&
                                hasCriticalAlert ? (
                                  <Icon icon="error" color="error" />
                                ) : undefined
                              }
                            />
                          }
                        />
                      ))}
                    </List>
                  )}
                </VStack>
              )}
              {salesOverview}
              {teamRecap}
              {(!manager || requestedQueue !== "overview") && workQueue}
              {salesFollowUp}
              {manager &&
                ((m.shipment_days || []).some(
                  (day: Row) => Number(day.order_count) > 0,
                ) ? (
                  analytics
                ) : (
                  <Collapsible trigger="Capaian tim" defaultIsOpen={false}>
                    {analytics}
                  </Collapsible>
                ))}
              {manager && targets}
              {!sales && (
                <Collapsible
                  trigger="Pantauan outlet & bahan baku"
                  defaultIsOpen={false}
                >
                  <ConsignmentAndAttendanceHub
                    role={page.role}
                    pageUrl={page.url}
                    attendanceRecaps={d.attendance_recaps || []}
                    consignmentOutlets={d.consignment_outlets || []}
                    productTraction={d.product_traction || []}
                    rawMaterialAlerts={d.raw_material_alerts || []}
                    onEditDirective={(product) => {
                      setRetryDialog(false);
                      setDirectiveProduct(product || null);
                      setDirectiveOpen(true);
                    }}
                    onEditRawMaterial={(material) => {
                      setRetryDialog(false);
                      setRawMaterialItem(material);
                      setRawMaterialOpen(true);
                    }}
                  />
                </Collapsible>
              )}
              {!sales && (d.supply_alerts || []).length > 0 && (
                <VStack gap={3}>
                  <HStack hAlign="between" vAlign="center">
                    <Heading level={2}>Peringatan pasokan</Heading>
                    <Button
                      href={withReturn("/stock/?tab=planning", page.url)}
                      size="sm"
                      variant="secondary"
                      label="Semua pengadaan"
                    />
                  </HStack>
                  <Text type="supporting">
                    Produk diurutkan dari risiko paling mendesak. Buka produk
                    untuk meninjau alasan dan jumlah pengadaan.
                  </Text>
                  <DataTable
                    rows={d.supply_alerts}
                    columns={[
                      {
                        key: "product",
                        header: "Produk",
                        renderCell: (alert) => (
                          <VStack gap={1}>
                            <Link
                              href={withReturn(
                                `/products/${alert.product.id}/?section=supply`,
                                page.url,
                              )}
                              weight="semibold"
                            >
                              {alert.product.name}
                            </Link>
                            <Text type="supporting">{alert.product.sku}</Text>
                          </VStack>
                        ),
                      },
                      {
                        key: "risk",
                        header: "Risiko",
                        renderCell: (alert) => <Status value={alert.risk} />,
                      },
                      {
                        key: "eligible",
                        header: "Stok layak",
                        align: "end",
                        renderCell: (alert) => (
                          <Text hasTabularNumbers>
                            {alert.eligible === null ||
                            alert.eligible === undefined
                              ? "—"
                              : `${quantity(alert.eligible)} ${alert.product.unit}`}
                          </Text>
                        ),
                      },
                      {
                        key: "recommend_quantity",
                        header: "Saran tambahan",
                        align: "end",
                        renderCell: (alert) => (
                          <Text hasTabularNumbers>
                            {alert.recommend_quantity === null ||
                            alert.recommend_quantity === undefined
                              ? "—"
                              : `${quantity(alert.recommend_quantity)} ${alert.product.unit}`}
                          </Text>
                        ),
                      },
                      {
                        key: "reasons",
                        header: "Dasar",
                        renderCell: (alert) => (
                          <VStack gap={1}>
                            {alert.reasons.map((reason: string) => (
                              <Text key={reason} type="supporting">
                                {reason}
                              </Text>
                            ))}
                          </VStack>
                        ),
                      },
                    ]}
                  />
                </VStack>
              )}
              {warehouse && (
                <Collapsible
                  trigger="Ringkasan kondisi stok"
                  defaultIsOpen={false}
                >
                  <VStack gap={3}>
                    <HStack hAlign="between">
                      <Button
                        href={withReturn("/stock/", page.url)}
                        size="sm"
                        variant="secondary"
                        label="Lihat semua produk"
                      />
                    </HStack>
                    <DataTable
                      rows={d.stock_attention || []}
                      empty={
                        <Empty
                          kind={
                            unverifiedStock || !verifiedStock
                              ? "empty"
                              : "complete"
                          }
                          title={
                            unverifiedStock
                              ? "Saldo belum lengkap"
                              : verifiedStock
                                ? "Tidak ada konflik atau stok menipis"
                                : "Stok belum bisa dinilai"
                          }
                          description={stockSummary}
                          action={
                            unverifiedStock ? (
                              <Button
                                label="Periksa saldo"
                                size="sm"
                                href={withReturn(
                                  "/stock/?filter=unverified",
                                  page.url,
                                )}
                              />
                            ) : undefined
                          }
                        />
                      }
                      columns={[
                        {
                          key: "name",
                          header: "Produk",
                          renderCell: (p) => (
                            <ProductIdentity
                              sku={p.sku}
                              name={p.name}
                              size="row"
                            >
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
                        {
                          key: "reserved",
                          header: "Dipesan",
                          align: "end",
                        },
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
                </Collapsible>
              )}
            </VStack>
          </LayoutContent>
        }
      />
      {isNarrow && (
        <FormDialog
          isOpen={narrowAlarmOpen}
          onOpenChange={setNarrowAlarmOpen}
          title="Alarm bahan baku & arahan sales"
        >
          <VStack padding={4} gap={4}>
            <DashboardAlarmPanel
              inDialog
              role={page.role}
              rawMaterialAlerts={d.raw_material_alerts || []}
              productTraction={d.product_traction || []}
              onHide={() => setNarrowAlarmOpen(false)}
              onEditRawMaterial={(material) => {
                setNarrowAlarmOpen(false);
                setRetryDialog(false);
                setRawMaterialItem(material);
                setRawMaterialOpen(true);
              }}
              onEditDirective={(product) => {
                setNarrowAlarmOpen(false);
                setRetryDialog(false);
                setDirectiveProduct(product || null);
                setDirectiveOpen(true);
              }}
            />
          </VStack>
        </FormDialog>
      )}
      <FormDialog
        isOpen={!!selected || target || directiveOpen || rawMaterialOpen}
        onOpenChange={close}
        title={
          target
            ? "Atur target bulanan"
            : directiveOpen
              ? "Atur arahan bawaan sales"
              : rawMaterialOpen
                ? "Perbarui stok & alarm bahan baku"
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
                target
                  ? "Simpan target"
                  : directiveOpen
                    ? "Simpan arahan bawaan"
                    : rawMaterialOpen
                      ? "Simpan bahan baku"
                      : recommendationSubmitLabel(outcome)
              }
            />
          </HStack>
        }
      >
        <VStack padding={6} gap={6}>
          {directiveOpen && d.directive_form_default ? (
            <SimpleForm
              spec={
                retryDialog
                  ? d.directive_form
                  : {
                      ...d.directive_form_default,
                      fields: d.directive_form_default.fields.map((f: Row) =>
                        f.key === "product_id" && directiveProduct
                          ? { ...f, value: String(directiveProduct.product_id) }
                          : f.key === "directive" && directiveProduct?.directive
                            ? {
                                ...f,
                                value: String(directiveProduct.directive.code),
                              }
                            : f.key === "substitute_product_id" &&
                                directiveProduct?.directive
                              ? {
                                  ...f,
                                  value: String(
                                    directiveProduct.directive.substitute_id ||
                                      "",
                                  ),
                                }
                              : f.key === "reason" &&
                                  directiveProduct?.directive
                                ? {
                                    ...f,
                                    value: String(
                                      directiveProduct.directive.reason || "",
                                    ),
                                  }
                                : f,
                      ),
                    }
              }
              id="dashboard-dialog-form"
              hideSubmit
              action={withReturn("/directives/save/", page.url)}
              label="Simpan arahan bawaan"
            />
          ) : rawMaterialOpen && d.raw_material_form_default ? (
            <SimpleForm
              spec={
                retryDialog
                  ? d.raw_material_form
                  : {
                      ...d.raw_material_form_default,
                      fields: d.raw_material_form_default.fields.map(
                        (f: Row) =>
                          f.key === "material_id" && rawMaterialItem
                            ? { ...f, value: String(rawMaterialItem.id) }
                            : f.key === "on_hand" && rawMaterialItem
                              ? { ...f, value: String(rawMaterialItem.on_hand) }
                              : f.key === "min_threshold" && rawMaterialItem
                                ? {
                                    ...f,
                                    value: String(
                                      rawMaterialItem.min_threshold,
                                    ),
                                  }
                                : f.key === "fast_moving_threshold" &&
                                    rawMaterialItem
                                  ? {
                                      ...f,
                                      value: String(
                                        rawMaterialItem.fast_moving_threshold,
                                      ),
                                    }
                                  : f.key === "note" && rawMaterialItem
                                    ? {
                                        ...f,
                                        value: String(
                                          rawMaterialItem.note || "",
                                        ),
                                      }
                                    : f,
                      ),
                    }
              }
              onValuesChange={(
                name,
                value,
              ): Record<string, string | boolean> => {
                if (name !== "material_id") return {};
                const found = (d.raw_material_alerts || []).find(
                  (m: Row) => String(m.id) === String(value),
                );
                if (!found) return {};
                return {
                  on_hand: String(found.on_hand),
                  min_threshold: String(found.min_threshold),
                  fast_moving_threshold: String(found.fast_moving_threshold),
                  note: String(found.note || ""),
                };
              }}
              id="dashboard-dialog-form"
              hideSubmit
              action={withReturn("/raw-materials/save/", page.url)}
              label="Simpan bahan baku"
            />
          ) : target ? (
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
                        Perkiraan {dateLabel(selected.due_date)} ·{" "}
                        {selected.reasons.purchase_date_count} tanggal pembelian
                        · interval{" "}
                        {(selected.reasons.intervals_days || []).join(", ")}{" "}
                        hari (median {selected.reasons.interval_days}).
                      </Text>
                      {(selected.reasons.inbound || []).length > 0 && (
                        <Text color="secondary">
                          Pengadaan berjalan (bukan stok siap kirim):{" "}
                          {(selected.reasons.inbound || [])
                            .map(
                              (po: Row) =>
                                `${po.number} · ${po.remaining} unit · ${po.expected_date ? "estimasi " + dateLabel(po.expected_date) : "estimasi belum ada"}`,
                            )
                            .join("; ")}
                          .
                        </Text>
                      )}
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
