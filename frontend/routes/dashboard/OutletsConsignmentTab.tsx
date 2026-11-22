import { MotionStack } from "../../motion";
import { withReturn } from "../../navigation";
import type { Row } from "../../types";
import {
  Button,
  DataTable,
  dateLabel,
  Empty,
  HStack,
  Link,
  money,
  quantity,
  Status,
  Text,
  VStack,
} from "../../ui";

export function OutletsConsignmentTab({
  isWarehouse,
  pageUrl,
  consignmentOutlets,
}: {
  isWarehouse: boolean;
  pageUrl: string;
  consignmentOutlets: Row[];
}) {
  return (
    <MotionStack
      motionKey="outlets"
      gap={4}
      id="hub-outlets"
      role="tabpanel"
      aria-label="Stok di Apotek"
    >
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
            header: "Stok · terjual",
            align: "end",
            renderCell: (o: Row) => (
              <VStack gap={1} hAlign="end">
                <Text weight="semibold" hasTabularNumbers>
                  {quantity(o.total_on_display)} unit
                </Text>
                <Text type="supporting" hasTabularNumbers>
                  laku {quantity(o.total_sold)}
                </Text>
              </VStack>
            ),
          },
          {
            key: "items",
            header: "Perlu perhatian",
            renderCell: (o: Row) => (
              <VStack gap={1}>
                {!(o.items || []).some(
                  (item: Row) => item.is_near_expiry || item.is_weak,
                ) && (
                  <Text type="supporting">
                    {quantity(o.item_count ?? (o.items || []).length)} produk aman
                  </Text>
                )}
                {(o.items || [])
                  .filter((item: Row) => item.is_near_expiry || item.is_weak)
                  .map((item: Row) => (
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
  );
}
