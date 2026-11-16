import type { ReactNode } from "react";
import { proportional } from "@astryxdesign/core/Table";
import {
  Text,
  Button,
  Link,
  DataTable,
  Status,
  Empty,
  money,
  dateLabel,
} from "../../ui";
import { withReturn } from "../../navigation";
import { useApp } from "../../router";
import type { Row } from "../../types";

export function OrderTable({
  rows,
  showCustomer = true,
  actionLabel,
  empty,
}: {
  rows: Row[];
  showCustomer?: boolean;
  actionLabel?: string;
  empty?: ReactNode;
}) {
  const { page } = useApp();
  return (
    <DataTable
      rows={rows}
      columns={[
        {
          key: "number",
          sortable: true,
          header: "Pesanan",
          renderCell: (r) => (
            <Link
              href={withReturn("/orders/" + r.id + "/", page.url)}
              weight="semibold"
            >
              {r.number}
            </Link>
          ),
        },
        ...(showCustomer
          ? [
              {
                key: "customer",
                header: "Pelanggan",
                width: proportional(2),
                renderCell: (r: Row) =>
                  page.role === "WAREHOUSE" ? (
                    <Text>{r.customer.name}</Text>
                  ) : (
                    <Link
                      href={withReturn(
                        `/customers/${r.customer.id}/?tab=orders`,
                        page.url,
                      )}
                    >
                      {r.customer.name}
                    </Link>
                  ),
              },
            ]
          : []),
        {
          key: "created_at",
          sortable: true,
          header: "Tanggal",
          renderCell: (r) => (
            <Text color="secondary">{dateLabel(r.created_at)}</Text>
          ),
        },
        {
          key: "status",
          header: "Status",
          renderCell: (r) => <Status value={r.status} />,
        },
        {
          key: "total",
          sortable: true,
          header: "Nilai pesanan",
          align: "end",
          renderCell: (r) => <Text hasTabularNumbers>{money(r.total)}</Text>,
        },
        ...(actionLabel
          ? [
              {
                key: "action",
                header: "Tindakan",
                renderCell: (r: Row) => (
                  <Button
                    label={actionLabel}
                    size="sm"
                    variant="secondary"
                    href={withReturn(`/orders/${r.id}/`, page.url)}
                  />
                ),
              },
            ]
          : []),
      ]}
      empty={
        empty || (
          <Empty
            title="Belum ada pesanan"
            description="Pesanan yang sesuai akan tampil di sini."
          />
        )
      }
    />
  );
}
