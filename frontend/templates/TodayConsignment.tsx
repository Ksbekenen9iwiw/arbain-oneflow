import { useState } from "react";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { Grid } from "@astryxdesign/core/Grid";
import { List, ListItem } from "@astryxdesign/core/List";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { MotionPanel, MotionStack } from "../motion";
import { withReturn } from "../navigation";
import { ProductIdentity } from "../ProductIdentity";
import { RecordIdentity } from "../RecordIdentity";
import type { Row } from "../types";
import {
  Banner,
  Button,
  DataTable,
  dateLabel,
  Empty,
  Fact,
  Heading,
  HStack,
  Link,
  money,
  quantity,
  Status,
  Text,
  VStack,
} from "../ui";

export function DashboardAlarmPanel({
  role,
  rawMaterialAlerts,
  productTraction,
  onHide,
  onEditRawMaterial,
  onEditDirective,
  inDialog = false,
}: {
  role: string | null;
  rawMaterialAlerts: Row[];
  productTraction: Row[];
  onHide: () => void;
  onEditRawMaterial: (material: Row) => void;
  onEditDirective: (product?: Row) => void;
  inDialog?: boolean;
}) {
  const canEditRaw = role === "MANAGER" || role === "WAREHOUSE";
  const isManager = role === "MANAGER";
  const directivesAndWeak = productTraction.filter(
    (item) =>
      item.directive ||
      item.movement === "DEAD" ||
      item.movement === "SLOW" ||
      item.movement === "FAST",
  );

  const content = (
    <VStack gap={5}>
      {!inDialog && (
        <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
          <Heading level={2}>Alarm & arahan</Heading>
          <Button
            size="sm"
            variant="secondary"
            label="Sembunyikan"
            onClick={onHide}
          />
        </HStack>
      )}

      <VStack gap={3}>
        <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
          <Heading level={3}>Early warning bahan baku</Heading>
          {canEditRaw && rawMaterialAlerts.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              label="Perbarui stok"
              onClick={() => onEditRawMaterial(rawMaterialAlerts[0])}
            />
          )}
        </HStack>
        <Text type="supporting">
          Peringatan dini berdasarkan kuantitas & laju produk laku keras agar
          bahan pokok tidak habis mendadak.
        </Text>
        {rawMaterialAlerts.length === 0 ? (
          <Text type="supporting">Belum ada data bahan baku.</Text>
        ) : (
          <List hasDividers density="compact">
            {rawMaterialAlerts.map((item) => (
              <ListItem
                key={item.id}
                label={`${item.name} (${item.code})`}
                description={
                  <VStack gap={2}>
                    <Status
                      value={item.severity}
                      label={item.severity_label}
                    />
                    <Text type="supporting">
                      Tersedia{" "}
                      <Text weight="semibold" hasTabularNumbers>
                        {quantity(item.on_hand)} {item.unit}
                      </Text>{" "}
                      dari kebutuhan{" "}
                      <Text weight="semibold" hasTabularNumbers>
                        {quantity(item.required_stock)} {item.unit}
                      </Text>
                    </Text>
                    <ProgressBar
                      label={`Ketersediaan ${item.name}`}
                      isLabelHidden
                      value={Math.min(100, Number(item.ratio_pct || 0))}
                      variant={
                        item.severity === "CRITICAL"
                          ? "error"
                          : item.severity === "WARNING"
                            ? "warning"
                            : "success"
                      }
                    />
                    <Text type="supporting">{item.explanation}</Text>
                    {canEditRaw && (
                      <HStack>
                        <Button
                          size="sm"
                          variant="secondary"
                          label="Sesuaikan"
                          onClick={() => onEditRawMaterial(item)}
                        />
                      </HStack>
                    )}
                  </VStack>
                }
              />
            ))}
          </List>
        )}
      </VStack>

      <Divider />

      <VStack gap={3}>
        <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
          <Heading level={3}>Arahan bawaan sales</Heading>
          {isManager && (
            <Button
              size="sm"
              variant="secondary"
              label="Atur arahan"
              onClick={() => onEditDirective()}
            />
          )}
        </HStack>
        <Text type="supporting">
          Instruksi manajer mengenai barang kurang laku yang tidak perlu
          dibawa dan produk pengganti yang harus dibawa ke apotek.
        </Text>
        {directivesAndWeak.length === 0 ? (
          <Text type="supporting">
            Belum ada arahan khusus atau barang kurang laku.
          </Text>
        ) : (
          <List hasDividers density="compact">
            {directivesAndWeak.map((item) => (
              <ListItem
                key={item.id}
                label={`${item.name} (${item.sku})`}
                description={
                  <VStack gap={2}>
                    <HStack gap={2} wrap="wrap">
                      {item.directive ? (
                        <Status
                          value={item.directive.code}
                          label={item.directive.label}
                        />
                      ) : (
                        <Status
                          value={item.movement}
                          label={item.movement_label}
                        />
                      )}
                    </HStack>
                    {item.directive ? (
                      <>
                        <Text type="supporting">{item.directive.reason}</Text>
                        {item.directive.substitute_name && (
                          <Fact label="Ganti bawa produk">
                            {item.directive.substitute_name} (
                            {item.directive.substitute_sku})
                          </Fact>
                        )}
                      </>
                    ) : (
                      <Text type="supporting">
                        Stok di apotek: {quantity(item.on_display)}{" "}
                        {item.unit} · laku 30 hari:{" "}
                        {quantity(item.consign_sold_30d)} {item.unit} (
                        {item.sell_through_pct}%).
                      </Text>
                    )}
                    {isManager && (
                      <HStack>
                        <Button
                          size="sm"
                          variant="secondary"
                          label="Ubah arahan"
                          onClick={() => onEditDirective(item)}
                        />
                      </HStack>
                    )}
                  </VStack>
                }
              />
            ))}
          </List>
        )}
      </VStack>
    </VStack>
  );

  if (inDialog) return content;
  return (
    <MotionPanel width="21rem" padding={4}>
      {content}
    </MotionPanel>
  );
}

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
            <Text type="supporting">Terjual & Tagihan Tunda</Text>
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
            <Text type="supporting">Pantauan ED & Bahan Baku</Text>
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
              onChange={setAttendanceMode}
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

                <Grid
                  columns={{ minWidth: 260, repeat: "fit", max: 3 }}
                  gap={4}
                >
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
      )}

      {sectionTab === "outlets" && (
        <MotionStack
          motionKey="outlets"
          gap={4}
          id="hub-outlets"
          role="tabpanel"
          aria-label="Stok di Apotek"
        >
          <Text type="supporting">
            Daftar apotek yang menyimpan stok titip jual (konsinyasi), jumlah
            barang yang masih dipajang di apotek, jumlah terjual, serta deteksi
            produk yang lambat laku di masing-masing apotek.
          </Text>
          <DataTable
            rows={consignmentOutlets.map((o: Row) => ({
              ...o,
              id: o.customer_id,
            }))}
            empty={
              <Empty
                title="Belum ada stok titipan di apotek"
                description="Buka profil pelanggan/apotek untuk mencatat penempatan barang titip jual pertama."
              />
            }
            columns={[
              {
                key: "name",
                header: "Apotek / Outlet",
                renderCell: (o: Row) => (
                  <VStack gap={1}>
                    {isWarehouse ? (
                      <Text weight="semibold">{o.name}</Text>
                    ) : (
                      <Link
                        href={withReturn(
                          `/customers/${o.customer_id}/?tab=consignment`,
                          pageUrl,
                        )}
                        weight="semibold"
                      >
                        {o.name}
                      </Link>
                    )}
                    <Text type="supporting">
                      {o.code} · {o.outlet_type_label || "Apotek"} (Diskon{" "}
                      {o.discount_percent ?? 16}%) · Sales: {o.sales_name}
                    </Text>
                    {Number(o.deferred_billing_rupiah) > 0 && (
                      <Status
                        value="DEFERRED"
                        label={`Tagihan tunda: ${money(o.deferred_billing_rupiah)}`}
                      />
                    )}
                  </VStack>
                ),
              },
              {
                key: "total_on_display",
                header: "Stok di Apotek",
                align: "end",
                renderCell: (o: Row) => (
                  <Text weight="semibold" hasTabularNumbers>
                    {quantity(o.total_on_display)} unit
                  </Text>
                ),
              },
              {
                key: "total_sold",
                header: "Terjual",
                align: "end",
                renderCell: (o: Row) => (
                  <Text hasTabularNumbers>{quantity(o.total_sold)} unit</Text>
                ),
              },
              {
                key: "items",
                header: "Rincian Produk di Apotek",
                renderCell: (o: Row) => (
                  <VStack gap={1}>
                    {(o.items || []).map((item: Row) => (
                      <HStack key={item.id} gap={2} wrap="wrap" vAlign="center">
                        <Text>
                          {item.name}:{" "}
                          <Text weight="semibold" hasTabularNumbers>
                            {quantity(item.quantity_on_display)} {item.unit}
                          </Text>{" "}
                          (laku {quantity(item.total_sold)})
                        </Text>
                        {item.is_near_expiry && (
                          <Status
                            value="NEAR_EXPIRY"
                            label={`Wajib tarik ≤ 6 bln ED (${dateLabel(item.nearest_expiry_date)})`}
                          />
                        )}
                        {item.is_weak && (
                          <Status value="SLOW" label="Kurang laku di sini" />
                        )}
                      </HStack>
                    ))}
                  </VStack>
                ),
              },
              {
                key: "last_checked_date",
                header: "Cek Terakhir",
                renderCell: (o: Row) => (
                  <Text>
                    {o.last_checked_date
                      ? dateLabel(o.last_checked_date)
                      : "Belum dicek"}
                  </Text>
                ),
              },
              ...(!isWarehouse
                ? [
                    {
                      key: "action",
                      header: "Tindakan",
                      renderCell: (o: Row) => (
                        <Button
                          size="sm"
                          variant="secondary"
                          label="Cek / isi titipan"
                          href={withReturn(
                            `/customers/${o.customer_id}/?tab=consignment`,
                            pageUrl,
                          )}
                        />
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </MotionStack>
      )}

      {sectionTab === "traction" && (
        <MotionStack
          motionKey="traction"
          gap={4}
          id="hub-traction"
          role="tabpanel"
          aria-label="Barang Laku vs Kurang Laku"
        >
          <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
            <Text type="supporting">
              Evaluasi perputaran barang titip jual di seluruh apotek (30 hari
              terakhir) beserta arahan manajer mengenai produk yang dihentikan
              atau diprioritaskan untuk dibawa sales.
            </Text>
            {isManager && (
              <Button
                size="sm"
                variant="primary"
                label="Atur arahan bawaan sales"
                onClick={() => onEditDirective()}
              />
            )}
          </HStack>
          <DataTable
            rows={productTraction}
            columns={[
              {
                key: "name",
                header: "Produk",
                renderCell: (p: Row) => (
                  <ProductIdentity sku={p.sku} name={p.name} size="row">
                    <VStack gap={1}>
                      <Link
                        href={withReturn(`/products/${p.product_id}/`, pageUrl)}
                        weight="semibold"
                      >
                        {p.name}
                      </Link>
                      <Text type="supporting">{p.sku}</Text>
                    </VStack>
                  </ProductIdentity>
                ),
              },
              {
                key: "movement",
                header: "Deteksi Perputaran",
                renderCell: (p: Row) => (
                  <VStack gap={1}>
                    <Status value={p.movement} label={p.movement_label} />
                    <Text type="supporting">
                      Terjual {p.sell_through_pct}% dari stok apotek
                    </Text>
                  </VStack>
                ),
              },
              {
                key: "on_display",
                header: "Stok di Apotek",
                align: "end",
                renderCell: (p: Row) => (
                  <VStack gap={1} hAlign="end">
                    <Text weight="semibold" hasTabularNumbers>
                      {quantity(p.on_display)} {p.unit}
                    </Text>
                    <Text type="supporting">{p.active_outlets} apotek</Text>
                  </VStack>
                ),
              },
              {
                key: "consign_sold_30d",
                header: "Laku 30 Hari",
                align: "end",
                renderCell: (p: Row) => (
                  <VStack gap={1} hAlign="end">
                    <Text hasTabularNumbers>
                      {quantity(p.consign_sold_30d)} {p.unit} (titip jual)
                    </Text>
                    <Text type="supporting">
                      Total permintaan: {quantity(p.total_demand_30d)} {p.unit}
                    </Text>
                  </VStack>
                ),
              },
              {
                key: "directive",
                header: "Arahan Manajer untuk Sales",
                renderCell: (p: Row) =>
                  p.directive ? (
                    <VStack gap={1}>
                      <Status
                        value={p.directive.code}
                        label={p.directive.label}
                      />
                      <Text type="supporting">{p.directive.reason}</Text>
                      {p.directive.substitute_name && (
                        <Text weight="semibold">
                          Pengganti: {p.directive.substitute_name} (
                          {p.directive.substitute_sku})
                        </Text>
                      )}
                    </VStack>
                  ) : (
                    <Text type="supporting">
                      Belum ada arahan khusus (bawa sesuai kebutuhan apotek)
                    </Text>
                  ),
              },
              ...(isManager
                ? [
                    {
                      key: "action",
                      header: "Tindakan",
                      renderCell: (p: Row) => (
                        <Button
                          size="sm"
                          variant="secondary"
                          label={p.directive ? "Ubah arahan" : "Beri arahan"}
                          onClick={() => onEditDirective(p)}
                        />
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </MotionStack>
      )}

      {sectionTab === "raw_materials" && (
        <MotionStack
          motionKey="raw_materials"
          gap={4}
          id="hub-raw-materials"
          role="tabpanel"
          aria-label="Alarm Bahan Baku"
        >
          <Text type="supporting">
            Early warning system bahan pokok/baku berdasarkan kuantitas dan
            kecepatan produk laku keras. Jika produk terkait sedang laku keras,
            target stok aman otomatis menggunakan batas laku keras (misal 1.000
            kg / 1 ton).
          </Text>
          <DataTable
            rows={rawMaterialAlerts}
            columns={[
              {
                key: "name",
                header: "Bahan Pokok / Baku",
                renderCell: (m: Row) => (
                  <VStack gap={1}>
                    <Text weight="semibold">{m.name}</Text>
                    <Text type="supporting">{m.code}</Text>
                  </VStack>
                ),
              },
              {
                key: "severity",
                header: "Status Alarm",
                renderCell: (m: Row) => (
                  <Status value={m.severity} label={m.severity_label} />
                ),
              },
              {
                key: "on_hand",
                header: "Stok Tersedia",
                align: "end",
                renderCell: (m: Row) => (
                  <Text weight="semibold" hasTabularNumbers>
                    {quantity(m.on_hand)} {m.unit}
                  </Text>
                ),
              },
              {
                key: "required_stock",
                header: "Target Wajib Sedia",
                align: "end",
                renderCell: (m: Row) => (
                  <VStack gap={1} hAlign="end">
                    <Text hasTabularNumbers>
                      {quantity(m.required_stock)} {m.unit}
                    </Text>
                    <Text type="supporting">
                      {m.is_fast_demand
                        ? "Mode produk laku keras"
                        : "Standar minimum"}
                    </Text>
                  </VStack>
                ),
              },
              {
                key: "explanation",
                header: "Keterangan & Produk Terkait",
                renderCell: (m: Row) => (
                  <VStack gap={1}>
                    <Text>{m.explanation}</Text>
                    {m.note && <Text type="supporting">{m.note}</Text>}
                  </VStack>
                ),
              },
              ...(isManager || isWarehouse
                ? [
                    {
                      key: "action",
                      header: "Tindakan",
                      renderCell: (m: Row) => (
                        <Button
                          size="sm"
                          variant="secondary"
                          label="Perbarui stok"
                          onClick={() => onEditRawMaterial(m)}
                        />
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </MotionStack>
      )}
    </VStack>
  );
}
