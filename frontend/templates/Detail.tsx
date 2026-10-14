import { MotionPanel } from "../motion";
import { ProductIdentity } from "../ProductIdentity";
import { withReturn, backLabel } from "../navigation";
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Adapted from Astryx 0.7.0 detail-page: status header, line items, totals,
// chronological history and a hideable customer panel.
import { useState } from "react";
import { Layout, LayoutHeader, LayoutContent } from "@astryxdesign/core/Layout";
import {
  MetadataList,
  MetadataListItem,
} from "@astryxdesign/core/MetadataList";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Divider } from "@astryxdesign/core/Divider";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import {
  ViewColumnsIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  TruckIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { List, ListItem } from "@astryxdesign/core/List";
import { proportional } from "@astryxdesign/core/Table";
import {
  VStack,
  HStack,
  StackItem,
  Text,
  Heading,
  Button,
  Link,
  DataTable,
  Status,
  Fact,
  money,
  quantity,
  dateLabel,
  SimpleForm,
  FormDialog,
  ServerForm,
  Banner,
} from "../ui";
import { useApp } from "../router";
import { orderContext, orderLabels } from "./Orders";
import type { Row } from "../types";
export default function Detail() {
  const { page, busy, navigate, clearDirty } = useApp();
  const d = page.data,
    order = d.order;
  const [dialog, setDialog] = useState(d.dialog || ""),
    [panel, setPanel] = useState(true);
  const close = (open: boolean) => {
    if (!open && !busy) {
      clearDirty();
      setDialog("");
    }
  };
  const actionUrl = (action: string) =>
    orderContext(`/orders/${order.id}/${action}/`, d.back_url);
  const events = [
    { id: "created", label: "Draft dibuat", at: order.created_at, actor: null },
    {
      id: "confirmed",
      label: "Dikonfirmasi · stok direservasi",
      at: order.confirmed_at,
      actor: order.confirmed_by,
    },
    {
      id: "shipped",
      label: "Ditandai terkirim · stok fisik dikurangi",
      at: order.shipped_at,
      actor: order.shipped_by,
    },
    {
      id: "cancelled",
      label: "Pesanan dibatalkan",
      at: order.cancelled_at,
      actor: order.cancelled_by,
    },
  ]
    .filter((event) => event.at)
    .sort((a, b) => a.at.localeCompare(b.at));
  return (
    <>
      <Layout
        height="fill"
        contentWidth={1000}
        defaultHasDividers
        header={
          <LayoutHeader padding={6}>
            <VStack gap={3}>
              <Link href={d.back_url} color="secondary">
                ← {backLabel(d.back_url)}
              </Link>
              <HStack gap={4} hAlign="between" vAlign="center" wrap="wrap">
                <StackItem size="fill">
                  <VStack gap={2}>
                    <HStack gap={3} vAlign="center" wrap="wrap">
                      <Heading level={1}>{order.number}</Heading>
                      <Status
                        value={order.status}
                        label={orderLabels[order.status]}
                      />
                    </HStack>
                    <Text color="secondary">
                      {order.customer.name} · Dibuat{" "}
                      {dateLabel(order.created_at)}
                    </Text>
                  </VStack>
                </StackItem>
                <HStack gap={2} wrap="wrap">
                  {d.can_cancel && (
                    <Button
                      variant="secondary"
                      label="Batalkan"
                      onClick={() => setDialog("cancel")}
                    />
                  )}
                  {d.can_confirm && (
                    <Button
                      label="Edit draft"
                      variant="secondary"
                      href={orderContext(
                        `/orders/${order.id}/edit/`,
                        d.back_url,
                      )}
                    />
                  )}
                  {d.can_confirm && (
                    <Button
                      variant="primary"
                      label="Konfirmasi pesanan"
                      isDisabled={busy || d.blockers.length > 0}
                      onClick={() => setDialog("confirm")}
                    />
                  )}
                  {d.can_ship && (
                    <Button
                      variant="primary"
                      label="Tandai terkirim"
                      isDisabled={busy || d.blockers.length > 0}
                      onClick={() => setDialog("ship")}
                    />
                  )}
                  <IconButton
                    label={
                      panel
                        ? "Sembunyikan detail pelanggan"
                        : "Tampilkan detail pelanggan"
                    }
                    variant="secondary"
                    icon={<Icon icon={ViewColumnsIcon} />}
                    aria-expanded={panel}
                    onClick={() => setPanel(!panel)}
                  />
                </HStack>
              </HStack>
            </VStack>
          </LayoutHeader>
        }
        end={
          panel ? (
            <MotionPanel
              width={320}
              padding={4}
              role="complementary"
              aria-label="Pelanggan dan pengiriman"
            >
              <VStack gap={6}>
                <VStack gap={4}>
                  <Heading level={2}>Pelanggan</Heading>
                  <MetadataList label={{ position: "top" }}>
                    <MetadataListItem label="Nama">
                      {page.role === "WAREHOUSE" ? (
                        order.customer.name
                      ) : (
                        <Link
                          href={withReturn(
                            `/customers/${order.customer.id}/`,
                            page.url,
                          )}
                          weight="medium"
                        >
                          {order.customer.name}
                        </Link>
                      )}
                    </MetadataListItem>
                    <MetadataListItem label="Kontak pemenuhan">
                      {order.customer.phone || "Nomor belum diisi"}
                    </MetadataListItem>
                    <MetadataListItem label="Alamat pengiriman">
                      {order.customer.address || "Alamat belum diisi"}
                    </MetadataListItem>
                  </MetadataList>
                </VStack>
                <Divider />
                <VStack gap={4}>
                  <Heading level={2}>Penanggung jawab</Heading>
                  <HStack gap={2} vAlign="center">
                    <Avatar name={order.sales.name} size="sm" />
                    <Text>{order.sales.name}</Text>
                  </HStack>
                  {page.role !== "WAREHOUSE" && (
                    <Button
                      label="Riwayat pelanggan"
                      variant="secondary"
                      href={withReturn(
                        `/customers/${order.customer.id}/`,
                        page.url,
                      )}
                    />
                  )}
                </VStack>
              </VStack>
            </MotionPanel>
          ) : undefined
        }
        content={
          <LayoutContent padding={6} data-oneflow-scroll>
            <VStack gap={6}>
              {d.error && (
                <Banner
                  status="error"
                  title="Tindakan belum berhasil"
                  description={d.error.message}
                  data-form-errors
                  tabIndex={-1}
                />
              )}
              {d.blockers.length > 0 && (
                <VStack gap={3}>
                  <Banner
                    status="warning"
                    title={
                      order.status === "DRAFT"
                        ? "Pesanan belum dapat dikonfirmasi"
                        : "Pengiriman belum dapat dicatat"
                    }
                    description={d.blockers.join(" ")}
                  />
                  <HStack gap={2} wrap="wrap">
                    {page.role !== "SALES" &&
                      d.lines
                        .filter(
                          (line: Row) =>
                            d.line_checks[line.id]?.shortage > 0 ||
                            BigInt(line.product.available) < 0n ||
                            (order.status === "CONFIRMED" &&
                              (BigInt(line.product.on_hand) <
                                BigInt(line.quantity) ||
                                BigInt(line.product.reserved) <
                                  BigInt(line.quantity))),
                        )
                        .map((line: Row) => (
                          <Button
                            key={line.id}
                            label={`Periksa ${line.product.sku}`}
                            href={withReturn(
                              `/products/${line.product.id}/`,
                              page.url,
                            )}
                          />
                        ))}
                    <Button
                      label="Periksa stok lagi"
                      isLoading={busy}
                      onClick={() => void navigate(d.detail_url, true)}
                    />
                  </HStack>
                </VStack>
              )}
              <VStack gap={4} data-tour="order-overview">
                <HStack hAlign="between" vAlign="center" gap={4}>
                  <VStack gap={1}>
                    <Heading level={2}>Produk pesanan</Heading>
                    <Text type="supporting">{d.lines.length} jenis produk</Text>
                  </VStack>
                  <VStack gap={1} hAlign="end">
                    <Text type="supporting">Total pesanan</Text>
                    <Heading level={2}>{money(order.total)}</Heading>
                  </VStack>
                </HStack>
                <Text type="supporting">
                  {order.status === "DRAFT"
                    ? "Draft belum mereservasi stok. Konfirmasi setelah produk dan jumlah sesuai."
                    : order.status === "CONFIRMED"
                      ? page.role === "SALES"
                        ? "Seluruh jumlah pesanan sudah direservasi. Menunggu gudang mencatat pengiriman."
                        : "Seluruh jumlah pesanan sudah direservasi. Tandai terkirim setelah barang diserahkan untuk pengiriman."
                      : order.status === "SHIPPED"
                        ? "Pengiriman sudah dicatat; stok fisik dan reservasi telah dikurangi."
                        : "Pesanan ini sudah dibatalkan."}
                </Text>
                <DataTable
                  rows={d.lines}
                  columns={[
                    {
                      key: "product",
                      header: "Produk",
                      width: proportional(2),
                      renderCell: (r) => (
                        <ProductIdentity
                          sku={r.product.sku}
                          name={r.product.name}
                          size="row"
                        >
                          <VStack gap={1}>
                            <Link
                              weight="medium"
                              href={withReturn(
                                `/products/${r.product.id}/`,
                                page.url,
                              )}
                            >
                              {r.product.name}
                            </Link>
                            <Text type="supporting">{r.product.sku}</Text>
                          </VStack>
                        </ProductIdentity>
                      ),
                    },
                    {
                      key: "quantity",
                      header: "Jumlah",
                      align: "end",
                      renderCell: (r) => (
                        <VStack gap={2} hAlign="end">
                          <Text hasTabularNumbers>
                            {quantity(r.quantity)} {r.product.unit}
                          </Text>
                          {order.status === "DRAFT" && (
                            <>
                              <Text type="supporting">
                                Tersedia{" "}
                                {quantity(d.line_checks[r.id].available)}
                              </Text>
                              {BigInt(d.line_checks[r.id].shortage) > 0n && (
                                <Status
                                  value="WAITING_STOCK"
                                  label={`Kurang ${quantity(d.line_checks[r.id].shortage)}`}
                                />
                              )}
                            </>
                          )}
                        </VStack>
                      ),
                    },
                    {
                      key: "price",
                      header: "Harga satuan",
                      align: "end",
                      renderCell: (r) => (
                        <Text hasTabularNumbers>{money(r.price)}</Text>
                      ),
                    },
                    {
                      key: "subtotal",
                      header: "Subtotal",
                      align: "end",
                      renderCell: (r) => (
                        <Text weight="medium" hasTabularNumbers>
                          {money(r.subtotal)}
                        </Text>
                      ),
                    },
                  ]}
                />

                <Text type="supporting">
                  Harga satuan tersimpan saat produk ditambahkan ke draft.
                </Text>
              </VStack>
              <Divider />
              <VStack gap={4} data-tour="order-history-overview">
                <Heading level={2}>Riwayat pesanan</Heading>
                <List
                  hasDividers
                  header={
                    <Text type="supporting">Waktu Indonesia Barat (WIB)</Text>
                  }
                >
                  {events.map((event) => (
                    <ListItem
                      key={event.id}
                      label={event.label}
                      startContent={
                        <Icon
                          icon={
                            event.id === "created"
                              ? DocumentTextIcon
                              : event.id === "confirmed"
                                ? CheckCircleIcon
                                : event.id === "shipped"
                                  ? TruckIcon
                                  : XCircleIcon
                          }
                          color="secondary"
                        />
                      }
                      description={
                        <VStack gap={2}>
                          <Text type="supporting">
                            {dateLabel(event.at, true)}
                            {event.actor ? ` · ${event.actor.name}` : ""}
                          </Text>
                          {event.id === "cancelled" && (
                            <Text>{order.cancel_reason}</Text>
                          )}
                        </VStack>
                      }
                    />
                  ))}
                </List>
              </VStack>
            </VStack>
          </LayoutContent>
        }
      />
      <FormDialog
        isOpen={!!dialog}
        onOpenChange={close}
        width="36rem"
        title={`${dialog === "cancel" ? "Batalkan" : dialog === "ship" ? "Tandai terkirim" : "Konfirmasi"} ${order.number}`}
      >
        <VStack padding={6} gap={4}>
          <Fact label="Pelanggan / total">
            {order.customer.name} · {money(order.total)}
          </Fact>
          <Text color="secondary">
            {dialog === "cancel"
              ? `${order.status === "CONFIRMED" ? "Reservasi stok akan dilepas. " : "Draft ini belum mereservasi stok. "}Alasan pembatalan akan tersimpan dalam riwayat.`
              : dialog === "ship"
                ? "Pastikan seluruh barang sudah diserahkan untuk pengiriman. Tindakan ini mencatat pengiriman dan mengurangi stok fisik serta reservasi."
                : "Seluruh jumlah pesanan akan direservasi. Stok fisik belum berkurang. Ketersediaan diperiksa kembali saat konfirmasi."}
          </Text>
          {dialog === "cancel" ? (
            <SimpleForm
              spec={d.cancel_form}
              action={actionUrl("cancel")}
              label="Batalkan pesanan"
              variant="destructive"
            />
          ) : (
            <ServerForm action={actionUrl(dialog)}>
              <HStack hAlign="end" gap={2}>
                <Button
                  label="Kembali"
                  type="button"
                  onClick={() => close(false)}
                  isDisabled={busy}
                />
                <Button
                  label={
                    dialog === "ship" ? "Ya, tandai terkirim" : "Ya, konfirmasi"
                  }
                  type="submit"
                  variant="primary"
                  isLoading={busy}
                />
              </HStack>
            </ServerForm>
          )}
        </VStack>
      </FormDialog>
    </>
  );
}
