import { Card } from "@/kit";
import { Grid } from "@/kit";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/kit";
import { MotionStack } from "../../motion";
import { withReturn } from "../../navigation";
import { RecordIdentity } from "../../RecordIdentity";
import type { Row } from "../../types";
import {
  DataTable,
  dateLabel,
  HStack,
  Link,
  Status,
  Text,
  VStack,
} from "../../ui";

export function AttendanceRecapTab({
  isManager,
  pageUrl,
  attendanceMode,
  onAttendanceModeChange,
  attendanceRecaps,
}: {
  isManager: boolean;
  pageUrl: string;
  attendanceMode: string;
  onAttendanceModeChange: (value: string) => void;
  attendanceRecaps: Row[];
}) {
  return (
    <MotionStack
      motionKey="attendance"
      gap={5}
      id="hub-attendance"
      role="tabpanel"
      aria-label="Presensi & Kunjungan Sales"
    >
      <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
        <Text type="supporting">
          {isManager
            ? "Resume presensi kunjungan outlet per sales (Hari ini, Kemarin, dan 1 Pekan untuk evaluasi rapat Senin). Setiap sales hanya dapat mengisi kunjungannya sendiri."
            : "Resume presensi kunjungan apotek Anda. Anda hanya dapat mengisi kunjungan pada apotek dalam cakupan Anda."}
        </Text>
        <SegmentedControl
          label="Tampilan presensi"
          value={attendanceMode}
          onChange={onAttendanceModeChange}
          size="sm"
        >
          <SegmentedControlItem
            value="week"
            label="Rekap 1 Pekan (Rapat Senin)"
          />
          <SegmentedControlItem
            value="daily"
            label="Fokus Hari Ini & Kemarin"
          />
        </SegmentedControl>
      </HStack>

      {attendanceRecaps.map((recap: Row) => (
        <Card key={recap.sales_id} padding={4}>
          <VStack gap={4}>
            <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
              <HStack gap={2} vAlign="center">
                <RecordIdentity name={recap.sales_name} />
                <Status
                  value={Number(recap.today_count) > 0 ? "DONE" : "READY"}
                  label={`Hari ini: ${recap.today_count} apotek`}
                />
              </HStack>
              <Text type="supporting">
                Kemarin: {recap.yesterday_count} apotek · 7 hari terakhir:{" "}
                {recap.week_unique_outlets} apotek unik (
                {recap.week_total_visits} kunjungan)
              </Text>
            </HStack>

            <Grid columns={{ minWidth: 260, repeat: "fit", max: 3 }} gap={4}>
              <Card padding={3}>
                <VStack gap={1}>
                  <Text type="supporting">Kunjungan Hari Ini</Text>
                  <Text size="xl" weight="semibold" hasTabularNumbers>
                    {recap.today_count} apotek
                  </Text>
                  <Text type="supporting">{recap.today_names}</Text>
                </VStack>
              </Card>
              <Card padding={3}>
                <VStack gap={1}>
                  <Text type="supporting">Kunjungan Kemarin</Text>
                  <Text size="xl" weight="semibold" hasTabularNumbers>
                    {recap.yesterday_count} apotek
                  </Text>
                  <Text type="supporting">{recap.yesterday_names}</Text>
                </VStack>
              </Card>
              <Card padding={3}>
                <VStack gap={1}>
                  <Text type="supporting">Resume 1 Pekan (7 Hari)</Text>
                  <Text size="xl" weight="semibold" hasTabularNumbers>
                    {recap.week_total_visits} kunjungan
                  </Text>
                  <Text type="supporting">
                    {recap.week_unique_outlets} apotek berbeda dikunjungi
                  </Text>
                </VStack>
              </Card>
            </Grid>

            <DataTable
              title="Presensi & kunjungan"
              rows={(attendanceMode === "daily"
                ? (recap.days || []).slice(0, 2)
                : recap.days || []
              ).map((d: Row) => ({
                ...d,
                id: `${recap.sales_id}-${d.date}`,
              }))}
              columns={[
                {
                  key: "date",
                  header: "Hari & Tanggal",
                  renderCell: (day: Row) => (
                    <VStack gap={1}>
                      <HStack gap={2} wrap="wrap">
                        <Text weight="semibold">{day.day_name}</Text>
                        {day.is_today && (
                          <Status value="DUE_TODAY" label="Hari ini" />
                        )}
                        {day.is_yesterday && (
                          <Status value="DRAFT" label="Kemarin" />
                        )}
                      </HStack>
                      <Text type="supporting">{dateLabel(day.date)}</Text>
                    </VStack>
                  ),
                },
                {
                  key: "outlet_count",
                  header: "Jumlah Apotek",
                  align: "end",
                  renderCell: (day: Row) => (
                    <Text weight="semibold" hasTabularNumbers>
                      {day.outlet_count} apotek
                    </Text>
                  ),
                },
                {
                  key: "outlets",
                  header: "Nama Apotek & Hasil Kunjungan",
                  renderCell: (day: Row) =>
                    (day.outlets || []).length === 0 ? (
                      <Text type="supporting">
                        Belum ada kunjungan tercatat pada hari ini.
                      </Text>
                    ) : (
                      <VStack gap={2}>
                        {(day.outlets || []).map((o: Row) => (
                          <VStack key={o.customer_id} gap={1}>
                            <HStack gap={2} wrap="wrap" vAlign="center">
                              <Link
                                href={withReturn(
                                  `/customers/${o.customer_id}/?tab=consignment`,
                                  pageUrl,
                                )}
                                weight="semibold"
                              >
                                {o.name}
                              </Link>
                              <Text type="supporting">({o.code})</Text>
                            </HStack>
                            {o.summary && (
                              <Text type="supporting">{o.summary}</Text>
                            )}
                          </VStack>
                        ))}
                      </VStack>
                    ),
                },
              ]}
            />
          </VStack>
        </Card>
      ))}
    </MotionStack>
  );
}
