import { MotionStack } from "../../motion";
import { withReturn } from "../../navigation";
import type { Row } from "../../types";
import {
  Button,
  DataTable,
  dateLabel,
  displayName,
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
            title="Tidak ada outlet yang cocok"
          />
        }
        columns={[
          {
            key: "name",
            header: "Outlet",
            renderCell: (o: Row) => (
              <VStack gap={1}>
                {isWarehouse ? (
                  <Text weight="semibold">{displayName(o.name)}</Text>
                ) : (
                  <Link
                    href={withReturn(
                      `/customers/${o.customer_id}/?tab=consignment`,
                      pageUrl,
                    )}
                    weight="semibold"
                  >
                    {displayName(o.name)}
                  </Link>
                )}
                <Text type="supporting">{o.sales_name}</Text>
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
              <AttentionCell outlet={o} />
            ),
          },
          {
            key: "last_checked_date",
            header: "Cek terakhir",
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

function AttentionCell({ outlet }: { outlet: Row }) {
  const flagged: Row[] = (outlet.items || []).filter(
    (item: Row) => item.is_near_expiry || item.is_weak,
  );
  if (!flagged.length)
    return (
      <Text type="supporting">
        {quantity(outlet.item_count ?? (outlet.items || []).length)} produk aman
      </Text>
    );
  const expiring = flagged.filter((item) => item.is_near_expiry);
  const weak = flagged.filter((item) => item.is_weak);
  const names = [...expiring, ...weak.filter((item) => !item.is_near_expiry)];
  return (
    <VStack gap={1}>
      <HStack gap={1} wrap="wrap">
        {expiring.length > 0 && (
          <Status
            value="NEAR_EXPIRY"
            label={`${quantity(expiring.length)} dekat kedaluwarsa`}
          />
        )}
        {weak.length > 0 && (
          <Status value="SLOW" label={`${quantity(weak.length)} kurang laku`} />
        )}
      </HStack>
      <Text type="supporting">
        {names
          .slice(0, 2)
          .map((item) => displayName(item.name))
          .join(", ")}
        {names.length > 2 && ` +${quantity(names.length - 2)}`}
      </Text>
    </VStack>
  );
}
