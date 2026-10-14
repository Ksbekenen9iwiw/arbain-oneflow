import { useQueryState } from "../router";
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Recharts composition from Astryx dashboard and dashboard-scorecard templates.
import { useRef, useState } from "react";
import { useContentMotion } from "../motion";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card } from "@astryxdesign/core/Card";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Tooltip as HelpTooltip } from "@astryxdesign/core/Tooltip";
import { TableCellsIcon, XMarkIcon } from "@heroicons/react/24/outline";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import {
  VStack,
  HStack,
  Heading,
  Text,
  DataTable,
  money,
  dateLabel,
} from "../ui";
import type { Row } from "../types";

export default function ShipmentTrend({
  days,
  today,
  defaultPeriod = "month",
}: {
  days: Row[];
  today: string;
  defaultPeriod?: "30" | "month";
}) {
  const [period, setPeriod] = useQueryState("period", defaultPeriod),
    [table, setTable] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  useContentMotion(chartRef, `${period}:${table}`, "fade");
  const rows =
    period === "month"
      ? days.filter((d) => d.date.slice(0, 7) === today.slice(0, 7))
      : days.slice(-Number(period));
  const total = rows.reduce((sum, d) => sum + BigInt(d.value_rupiah), 0n);
  const count = rows.reduce((sum, d) => sum + Number(d.order_count), 0);
  // Numbers are only used for chart geometry; all monetary labels retain exact integers.
  const data = rows.map((d) => ({
    ...d,
    plot: Number(d.value_rupiah) / 1000000,
  }));
  return (
    <VStack gap={2} ref={chartRef}>
      <HStack hAlign="between" gap={2} vAlign="center">
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
      <HStack gap={2} vAlign="center">
        <Text size="2xl" weight="semibold" hasTabularNumbers>
          {money(String(total))}
        </Text>
        <Text type="supporting">
          {count} pesanan · {dateLabel(rows[0]?.date)} – {dateLabel(today)}
        </Text>
      </HStack>
      {total === 0n ? (
        <VStack minHeight={128} vAlign="center" hAlign="center" gap={2}>
          <Text weight="medium">Belum ada pengiriman pada periode ini</Text>
          <Text type="supporting">
            Pilih periode lain untuk melihat riwayat.
          </Text>
        </VStack>
      ) : (
        <ResponsiveContainer width="100%" height={128} minWidth={0}>
          <LineChart
            data={data}
            accessibilityLayer
            margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--color-border)" />
            <XAxis
              dataKey="date"
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
              width={42}
              axisLine={false}
              tickLine={false}
              tick={{
                fill: "var(--color-text-secondary)",
                fontSize: "var(--font-size-sm)",
              }}
              tickFormatter={(v) =>
                Number(v).toLocaleString("id-ID", { maximumFractionDigits: 2 })
              }
            />
            <Tooltip
              content={({ active, payload }) => {
                const d = payload?.[0]?.payload;
                return active && d ? (
                  <Card padding={3} elevation="low">
                    <VStack gap={1}>
                      <Text type="supporting">{dateLabel(d.date)}</Text>
                      <Text weight="semibold">{money(d.value_rupiah)}</Text>
                      <Text type="supporting">
                        {d.order_count} pesanan terkirim
                      </Text>
                    </VStack>
                  </Card>
                ) : null;
              }}
            />
            <Line
              dataKey="plot"
              name="Nilai terkirim"
              type="linear"
              stroke="var(--color-text-blue)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
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
      {table && (
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
