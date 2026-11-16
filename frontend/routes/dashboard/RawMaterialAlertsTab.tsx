import { MotionStack } from "../../motion";
import type { Row } from "../../types";
import { Button, DataTable, quantity, Status, Text, VStack } from "../../ui";

export function RawMaterialAlertsTab({
  canEdit,
  rawMaterialAlerts,
  onEditRawMaterial,
}: {
  canEdit: boolean;
  rawMaterialAlerts: Row[];
  onEditRawMaterial: (material: Row) => void;
}) {
  return (
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
        target stok aman otomatis menggunakan batas laku keras (misal 1.000 kg /
        1 ton).
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
          ...(canEdit
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
  );
}
