import { useQueryState } from "../../router";
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Recharts composition from Astryx dashboard and dashboard-scorecard templates.
import { useRef, useState } from "react";
import { useContentMotion } from "../../motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card } from "@/kit";
import { Icon } from "@/kit";
import { IconButton } from "@/kit";
import { List, ListItem } from "@/kit";
import { Tooltip as HelpTooltip } from "@/kit";
import { TableCellsIcon, XMarkIcon } from "@heroicons/react/24/outline";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/kit";
import {
  VStack,
  HStack,
  Heading,
  Text,
  DataTable,
  money,
  dateLabel,
} from "../../ui";
import type { Row } from "../../types";
import { useCountUp } from "../../motion";

const compactRupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  notation: "compact",
  maximumFractionDigits: 2,
});

export default function ShipmentTrend({
  days,
  today,
  defaultPeriod = "month",
  compact = false,
}: {
  days: Row[];
  today: string;
  defaultPeriod?: "30" | "month";
  compact?: boolean;
}) {
  const [period, setPeriod] = useQueryState("period", defaultPeriod),
    [table, setTable] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  useContentMotion(chartRef, `${period}:${table}`, "fade");
  const rows =
    period === "month"
      ? days.filter((d) => d.date.slice(0, 7) === today.slice(0, 7))
      : days.slice(-Number(period));
  const count = rows.reduce((sum, d) => sum + Number(d.order_count), 0);
  const recentDays = compact
    ? rows.filter((d) => Number(d.order_count) > 0).slice(-3).reverse()
    : [];
  let total = 0n;
  // Numbers are only used for chart geometry; all monetary labels retain exact integers.
  const data = rows.map((d) => {
    const dailyValue = BigInt(d.value_rupiah);
    total += dailyValue;
    return {
      ...d,
      cumulativeValue: total.toString(),
      plot: Number(compact ? total : dailyValue) / 1000000,
    };
  });
  const shownTotal = useCountUp(Number(total));
  return (
    <VStack gap={2} ref={chartRef}>
      <HStack hAlign="between" gap={2} vAlign="center" wrap="wrap">
        <Heading level={3} accessibilityLevel={2}>
          Nilai barang terkirim
        </Heading>
        <SegmentedControl
          label="Periode grafik pengiriman"
          size="sm"
          value={period}
          onChange={setPeriod}
        >
          <SegmentedControlItem value="7" label="7 hari" />
          <SegmentedControlItem value="30" label="30 hari" />
          <SegmentedControlItem value="month" label="Bulan ini" />
        </SegmentedControl>
      </HStack>
      <HStack gap={2} vAlign="end" wrap="wrap">
        <Text size="3xl" weight="bold" hasTabularNumbers data-figure>
          {money(String(Math.round(shownTotal)))}
        </Text>
        <Text type="supporting">
          {compact && count === 0
            ? "Belum ada pengiriman"
            : `${count} pesanan`}
          {!compact && ` · ${dateLabel(rows[0]?.date)} – ${dateLabel(today)}`}
        </Text>
      </HStack>
      {count === 0 ? (
        compact ? null : (
          <Text type="supporting">Belum ada pengiriman pada periode ini.</Text>
        )
      ) : (
        <ResponsiveContainer
          width="100%"
          height={compact ? 168 : 200}
          minWidth={0}
        >
          <AreaChart
            data={data}
            accessibilityLayer
            margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--color-separator-border)" strokeDasharray="3 4" />
            <XAxis
              dataKey="date"
              height={compact ? 22 : undefined}
              axisLine={false}
              tickLine={false}
              minTickGap={40}
              tick={{
                fill: "var(--color-text-secondary)",
                fontSize: "var(--font-size-sm)",
              }}
              tickFormatter={(v) =>
                new Intl.DateTimeFormat("id-ID", {
                  day: "numeric",
                  month: "short",
                }).format(new Date(v + "T12:00:00+07:00"))
              }
            />
            <YAxis
              width={compact ? 72 : 42}
              tickCount={compact ? 3 : undefined}
              axisLine={false}
              tickLine={false}
              tick={{
                fill: "var(--color-text-secondary)",
                fontSize: "var(--font-size-sm)",
              }}
              tickFormatter={(v) =>
                compact
                  ? compactRupiah.format(v * 1000000)
                  : Number(v).toLocaleString("id-ID", { maximumFractionDigits: 2 })
              }
            />
            <Tooltip
              content={({ active, payload }) => {
                const d = payload?.[0]?.payload;
                return active && d ? (
                  <Card padding={3} elevation="low">
                    <VStack gap={1}>
                      <Text type="supporting">{dateLabel(d.date)}</Text>
                      <Text weight="semibold">
                        {money(compact ? d.cumulativeValue : d.value_rupiah)}
                      </Text>
                      <Text type="supporting">
                        {compact
                          ? "Total sampai tanggal ini"
                          : `${d.order_count} pesanan terkirim`}
                      </Text>
                    </VStack>
                  </Card>
                ) : null;
              }}
            />
            <defs>
              <linearGradient id="oneflow-trend-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-accent-500)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--color-accent-500)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              dataKey="plot"
              name={compact ? "Nilai kumulatif" : "Nilai terkirim"}
              type="monotone"
              stroke="var(--color-accent-500)"
              strokeWidth={2.5}
              strokeLinecap="round"
              fill="url(#oneflow-trend-fill)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-background-primary-default)" }}
              animationDuration={600}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
      {recentDays.length > 0 && (
        <List
          density="compact"
          hasDividers
          edgeCompensation="inline"
          header={<Text weight="semibold">Pengiriman terakhir</Text>}
        >
          {recentDays.map((day) => (
            <ListItem
              key={day.date}
              label={dateLabel(day.date)}
              endContent={
                <Text hasTabularNumbers weight="semibold">
                  {money(day.value_rupiah)}
                </Text>
              }
            />
          ))}
        </List>
      )}
      {!compact && count > 0 && (
        <HStack hAlign="between" vAlign="center">
          <HStack gap={2} vAlign="center">
            <Text type="supporting">Nilai barang · Rp juta</Text>
            <HelpTooltip
              content="Berdasarkan tanggal pengiriman (WIB). Nilai barang, bukan pembayaran atau laba."
              touchTrigger="tap"
              focusTrigger="always"
            >
              <IconButton
                label="Tentang nilai barang terkirim"
                icon={<Icon icon="info" />}
                size="sm"
                variant="secondary"
              />
            </HelpTooltip>
          </HStack>
          <IconButton
            size="sm"
            variant="secondary"
            label={table ? "Tutup data" : "Lihat data harian"}
            tooltip={table ? "Tutup data harian" : "Lihat data harian"}
            icon={<Icon icon={table ? XMarkIcon : TableCellsIcon} />}
            aria-expanded={table}
            aria-controls="shipment-daily-data"
            onClick={() => setTable((v) => !v)}
          />
        </HStack>
      )}
      {!compact && count > 0 && table && (
        <VStack id="shipment-daily-data" paddingBlockEnd={6}>
          <DataTable
            rows={rows.map((d) => ({ ...d, id: d.date }))}
            columns={[
              {
                key: "date",
                header: "Tanggal",
                renderCell: (d) => <Text>{dateLabel(d.date)}</Text>,
              },
              { key: "order_count", header: "Pesanan", align: "end" },
              {
                key: "value_rupiah",
                header: "Nilai terkirim",
                align: "end",
                renderCell: (d) => <Text>{money(d.value_rupiah)}</Text>,
              },
            ]}
          />
        </VStack>
      )}
    </VStack>
  );
}
