import { MotionStack } from "../../motion";
import { withReturn } from "../../navigation";
import { ProductIdentity } from "../../ProductIdentity";
import type { Row } from "../../types";
import {
  Button,
  DataTable,
  HStack,
  Link,
  quantity,
  Status,
  Text,
  VStack,
} from "../../ui";

export function ProductTractionTab({
  isManager,
  pageUrl,
  productTraction,
  onEditDirective,
}: {
  isManager: boolean;
  pageUrl: string;
  productTraction: Row[];
  onEditDirective: (product?: Row) => void;
}) {
  return (
    <MotionStack
      motionKey="traction"
      gap={4}
      id="hub-traction"
      role="tabpanel"
      aria-label="Barang Laku vs Kurang Laku"
    >
      <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
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
  );
}
