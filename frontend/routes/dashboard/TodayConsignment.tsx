import { useState } from "react";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import type { Row } from "../../types";
import { money, quantity, Text, VStack } from "../../ui";
import { AttendanceRecapTab } from "./AttendanceRecapTab";
import { DashboardAlarmPanel } from "./DashboardAlarmPanel";
import { OutletsConsignmentTab } from "./OutletsConsignmentTab";
import { ProductTractionTab } from "./ProductTractionTab";
import { RawMaterialAlertsTab } from "./RawMaterialAlertsTab";

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
      <TabList
        value={sectionTab}
        onChange={setSectionTab}
        aria-label="Pantauan titip jual dan presensi"
        hasDivider
      >
        {!isWarehouse && (
          <Tab value="attendance" label="Kunjungan" panelId="hub-attendance" />
        )}
        <Tab value="outlets" label="Stok outlet" panelId="hub-outlets" />
        <Tab value="traction" label="Evaluasi produk" panelId="hub-traction" />
        <Tab
          value="raw_materials"
          label="Bahan baku"
          panelId="hub-raw-materials"
        />
      </TabList>

      {sectionTab === "attendance" && (
        <Text type="supporting">
          {todayVisitTotal
            ? `${quantity(todayVisitTotal)} kunjungan hari ini`
            : "Belum ada kunjungan hari ini"}{" "}
          · {quantity(weekVisitTotal)} dalam 7 hari
        </Text>
      )}
      {sectionTab === "outlets" && consignmentOutlets.length > 0 && (
        <Text type="supporting">
          {quantity(totalDisplayUnits)} unit tersisa ·{" "}
          {quantity(totalSoldUnits)} terjual
          {totalDeferredRupiah > 0
            ? ` · Tagihan tunda ${money(totalDeferredRupiah)}`
            : ""}
        </Text>
      )}
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
