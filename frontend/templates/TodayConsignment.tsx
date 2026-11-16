import { useState } from "react";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import type { Row } from "../types";
import { Banner, Heading, HStack, money, quantity, Status, Text, VStack } from "../ui";
import { AttendanceRecapTab } from "./today/AttendanceRecapTab";
import { DashboardAlarmPanel } from "./today/DashboardAlarmPanel";
import { OutletsConsignmentTab } from "./today/OutletsConsignmentTab";
import { ProductTractionTab } from "./today/ProductTractionTab";
import { RawMaterialAlertsTab } from "./today/RawMaterialAlertsTab";

export { DashboardAlarmPanel };

export function ConsignmentAndAttendanceHub({
  role,
  pageUrl,
  attendanceRecaps,
  consignmentOutlets,
  productTraction,
  rawMaterialAlerts,
  onEditDirective,
  onEditRawMaterial,
}: {
  role: string | null;
  pageUrl: string;
  attendanceRecaps: Row[];
  consignmentOutlets: Row[];
  productTraction: Row[];
  rawMaterialAlerts: Row[];
  onEditDirective: (product?: Row) => void;
  onEditRawMaterial: (material: Row) => void;
}) {
  const isWarehouse = role === "WAREHOUSE";
  const isManager = role === "MANAGER";
  const [sectionTab, setSectionTab] = useState(
    isWarehouse ? "outlets" : "attendance",
  );
  const [attendanceMode, setAttendanceMode] = useState("week");

  const criticalMaterials = rawMaterialAlerts.filter(
    (m) => m.severity === "CRITICAL",
  );
  const stopDirectives = productTraction.filter(
    (p) => p.directive && p.directive.code === "STOP",
  );
  const totalDisplayUnits = consignmentOutlets.reduce(
    (sum, o) => sum + Number(o.total_on_display || 0),
    0,
  );
  const totalSoldUnits = consignmentOutlets.reduce(
    (sum, o) => sum + Number(o.total_sold || 0),
    0,
  );
  const totalDeferredRupiah = consignmentOutlets.reduce(
    (sum, o) => sum + Number(o.deferred_billing_rupiah || 0),
    0,
  );
  const nearExpiryCount = consignmentOutlets.reduce(
    (sum, o) =>
      sum +
      (o.items || []).filter((item: Row) => Boolean(item.is_near_expiry))
        .length,
    0,
  );
  const weakOrStopCount = productTraction.filter(
    (p) =>
      p.movement === "DEAD" ||
      p.movement === "SLOW" ||
      (p.directive && p.directive.code === "STOP"),
  ).length;
  const todayVisitTotal = attendanceRecaps.reduce(
    (sum, r) => sum + Number(r.today_count || 0),
    0,
  );
  const weekVisitTotal = attendanceRecaps.reduce(
    (sum, r) => sum + Number(r.week_total_visits || 0),
    0,
  );

  return (
    <VStack gap={4} paddingBlockEnd={6} id="consignment-hub">
      {criticalMaterials.length > 0 && (
        <Banner
          status="error"
          title={`Early Warning Bahan Baku Kritis: ${criticalMaterials.map((m) => `${m.name} tersisa ${quantity(m.on_hand)} ${m.unit} dari target ${quantity(m.required_stock)} ${m.unit}`).join("; ")}`}
          description={criticalMaterials[0].explanation}
        />
      )}
      {!isWarehouse && stopDirectives.length > 0 && (
        <Banner
          status="warning"
          title={`Arahan Bawaan Manajer: Jangan bawa ${stopDirectives.map((p) => p.name).join(", ")}`}
          description={stopDirectives
            .map(
              (p) =>
                `${p.name}: ${p.directive.reason}${p.directive.substitute_name ? ` (Ganti bawa: ${p.directive.substitute_name})` : ""}`,
            )
            .join(" · ")}
        />
      )}

      <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
        <VStack gap={1}>
          <Heading level={2}>
            {isWarehouse
              ? "Pantauan Titip Jual Apotek & Bahan Baku"
              : "Titip Jual Apotek, Presensi Kunjungan & Evaluasi Produk"}
          </Heading>
          <Text type="supporting">
            {isWarehouse
              ? "Pantau sebaran stok titipan di apotek, perputaran barang, dan ketersediaan bahan pokok."
              : isManager
                ? "Rekap kunjungan harian/pekanan sales untuk rapat Senin, stok titip jual di apotek, dan deteksi barang kurang laku."
                : "Presensi kunjungan harian/pekanan Anda, stok titip jual di apotek cakupan Anda, dan arahan barang bawaan."}
          </Text>
        </VStack>
      </HStack>

      <Grid columns={{ minWidth: 210, repeat: "fit", max: 4 }} gap={3}>
        {!isWarehouse && (
          <Card padding={3}>
            <VStack gap={1}>
              <Text type="supporting">Presensi Kunjungan Hari Ini</Text>
              <Text size="xl" weight="semibold" hasTabularNumbers>
                {quantity(todayVisitTotal)} apotek
              </Text>
              <Text type="supporting">
                Total 7 hari: {quantity(weekVisitTotal)} kunjungan outlet
              </Text>
            </VStack>
          </Card>
        )}
        <Card padding={3}>
          <VStack gap={1}>
            <Text type="supporting">Stok Titip Jual di Apotek</Text>
            <Text size="xl" weight="semibold" hasTabularNumbers>
              {quantity(totalDisplayUnits)} unit
            </Text>
            <Text type="supporting">
              Tersebar di {quantity(consignmentOutlets.length)} apotek mitra
            </Text>
          </VStack>
        </Card>
        <Card padding={3}>
          <VStack gap={1}>
            <Text type="supporting">Terjual &amp; Tagihan Tunda</Text>
            <Text size="xl" weight="semibold" hasTabularNumbers>
              {quantity(totalSoldUnits)} unit laku
            </Text>
            <Text type="supporting">
              {totalDeferredRupiah > 0
                ? `Tagihan tunda: ${money(totalDeferredRupiah)}`
                : "Seluruh tagihan > 2 item lunas"}
            </Text>
          </VStack>
        </Card>
        <Card padding={3}>
          <VStack gap={1}>
            <Text type="supporting">Pantauan ED &amp; Bahan Baku</Text>
            <HStack gap={2} wrap="wrap" vAlign="center">
              <Status
                value={
                  criticalMaterials.length > 0 || nearExpiryCount > 0
                    ? "CRITICAL"
                    : weakOrStopCount > 0
                      ? "WARNING"
                      : "SAFE"
                }
                label={
                  criticalMaterials.length > 0
                    ? `${criticalMaterials.length} bahan kritis`
                    : nearExpiryCount > 0
                      ? `${nearExpiryCount} wajib tarik ED`
                      : "Terkendali"
                }
              />
            </HStack>
            <Text type="supporting">
              {nearExpiryCount} lot ED ≤ 6 bln · {weakOrStopCount} produk kurang
              laku
            </Text>
          </VStack>
        </Card>
      </Grid>

      <TabList
        value={sectionTab}
        onChange={setSectionTab}
        aria-label="Pantauan titip jual dan presensi"
        hasDivider
      >
        {!isWarehouse && (
          <Tab
            value="attendance"
            label={`Presensi & Kunjungan Sales (${attendanceRecaps.length})`}
            panelId="hub-attendance"
          />
        )}
        <Tab
          value="outlets"
          label={`Stok di Apotek (${consignmentOutlets.length})`}
          panelId="hub-outlets"
        />
        <Tab
          value="traction"
          label={`Barang Laku vs Kurang Laku (${productTraction.length})`}
          panelId="hub-traction"
        />
        <Tab
          value="raw_materials"
          label={`Alarm Bahan Baku (${rawMaterialAlerts.length})`}
          panelId="hub-raw-materials"
        />
      </TabList>

      {!isWarehouse && sectionTab === "attendance" && (
        <AttendanceRecapTab
          isManager={isManager}
          pageUrl={pageUrl}
          attendanceMode={attendanceMode}
          onAttendanceModeChange={setAttendanceMode}
          attendanceRecaps={attendanceRecaps}
        />
      )}

      {sectionTab === "outlets" && (
        <OutletsConsignmentTab
          isWarehouse={isWarehouse}
          pageUrl={pageUrl}
          consignmentOutlets={consignmentOutlets}
        />
      )}

      {sectionTab === "traction" && (
        <ProductTractionTab
          isManager={isManager}
          pageUrl={pageUrl}
          productTraction={productTraction}
          onEditDirective={onEditDirective}
        />
      )}

      {sectionTab === "raw_materials" && (
        <RawMaterialAlertsTab
          canEdit={isManager || isWarehouse}
          rawMaterialAlerts={rawMaterialAlerts}
          onEditRawMaterial={onEditRawMaterial}
        />
      )}
    </VStack>
  );
}
