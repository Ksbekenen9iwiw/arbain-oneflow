// Copyright (c) Meta Platforms, Inc. and affiliates.
// Adapted from Astryx work-item-detail: work context and result in the main
// column, assignment/customer metadata in a 340-wide detail rail.
import { useState } from "react";
import {
  Layout,
  LayoutHeader,
  LayoutContent,
  LayoutPanel,
  LayoutFooter,
} from "@astryxdesign/core/Layout";
import {
  MetadataList,
  MetadataListItem,
} from "@astryxdesign/core/MetadataList";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Divider } from "@astryxdesign/core/Divider";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { ViewColumnsIcon } from "@heroicons/react/24/outline";
import {
  VStack,
  HStack,
  StackItem,
  Text,
  Heading,
  Button,
  Link,
  Status,
  SimpleForm,
  dateLabel,
} from "../ui";
import { useApp } from "../router";
import { withReturn, backLabel } from "../navigation";
import type { Row } from "../types";

export default function ActivityDetail() {
  const { page, busy } = useApp();
  const d = page.data,
    activity = d.activity;
  const [panel, setPanel] = useState(true);
  const customerPath = `/customers/${d.customer.id}/`;
  const customerUrl =
    d.back_url.split("?")[0] === customerPath
      ? d.back_url
      : withReturn(`${customerPath}?tab=history`, d.back_url);
  const done = activity.status === "DONE";
  const due = [activity.scheduled_date, activity.followup_date]
    .filter(Boolean)
    .sort()[0];
  const urgency = done
    ? "DONE"
    : due && due < page.today
      ? "OVERDUE"
      : due === page.today
        ? "DUE_TODAY"
        : "PLANNED";
  const relatedUrl = (id: string) =>
    withReturn(`/activities/${id}/complete/`, d.back_url);
  return (
    <Layout
      height="fill"
      contentWidth={1260}
      defaultHasDividers
      header={
        <LayoutHeader padding={6}>
          <VStack gap={4}>
            <HStack gap={4} vAlign="center" justify="between">
              <Link href={d.back_url} color="secondary">
                ← {backLabel(d.back_url)}
              </Link>
              <IconButton
                label={
                  panel
                    ? "Sembunyikan detail aktivitas"
                    : "Tampilkan detail aktivitas"
                }
                icon={<Icon icon={ViewColumnsIcon} />}
                variant="secondary"
                aria-expanded={panel}
                onClick={() => setPanel(!panel)}
              />
            </HStack>
            <VStack gap={3}>
              <HStack gap={3} vAlign="center" wrap="wrap">
                <Heading level={1}>
                  {activity.kind_label} · {d.customer.name}
                </Heading>
                <Status value={urgency} />
              </HStack>
              <Text type="supporting">
                Aktivitas #{activity.id} ·{" "}
                {due ? `Dijadwalkan ${dateLabel(due)}` : "Belum dijadwalkan"}
              </Text>
            </VStack>
          </VStack>
        </LayoutHeader>
      }
      end={
        panel ? (
          <LayoutPanel
            width={340}
            padding={6}
            hasDivider
            role="complementary"
            aria-label="Detail aktivitas"
          >
            <VStack gap={6}>
              <VStack gap={4}>
                <Heading level={2}>Detail aktivitas</Heading>
                <MetadataList label={{ position: "top" }}>
                  <MetadataListItem label="Penanggung jawab">
                    <HStack gap={2} vAlign="center">
                      <Avatar name={activity.sales.name} size="sm" />
                      <Text>{activity.sales.name}</Text>
                    </HStack>
                  </MetadataListItem>
                  <MetadataListItem label="Tahap prospek tercatat">
                    {activity.stage}
                  </MetadataListItem>
                  <MetadataListItem label="Dibuat">
                    {dateLabel(activity.created_at, true)}
                  </MetadataListItem>
                  {activity.completed_at && (
                    <MetadataListItem label="Diselesaikan">
                      {dateLabel(activity.completed_at, true)}
                    </MetadataListItem>
                  )}
                </MetadataList>
              </VStack>
              <Divider />
              <VStack gap={4}>
                <Heading level={2}>Pelanggan</Heading>
                <MetadataList label={{ position: "top" }}>
                  <MetadataListItem label="Nama">
                    <Link href={customerUrl}>{d.customer.name}</Link>
                  </MetadataListItem>
                  <MetadataListItem label="Telepon">
                    {d.customer.phone || "Belum diisi"}
                  </MetadataListItem>
                  <MetadataListItem label="Alamat">
                    {d.customer.address || "Belum diisi"}
                  </MetadataListItem>
                </MetadataList>
                <Button
                  label="Lihat riwayat pelanggan"
                  variant="secondary"
                  href={customerUrl}
                />
              </VStack>
            </VStack>
          </LayoutPanel>
        ) : undefined
      }
      content={
        <LayoutContent padding={6} data-oneflow-scroll>
          <VStack gap={6}>
            <VStack gap={3}>
              <Heading level={2}>Catatan aktivitas</Heading>
              <Text style={{ whiteSpace: "pre-wrap" }}>
                {activity.note ||
                  "Tidak ada catatan tambahan untuk aktivitas ini."}
              </Text>
            </VStack>
            {d.previous_activity && (
              <>
                <Divider />
                <VStack gap={3}>
                  <Heading level={2}>Interaksi sebelumnya</Heading>
                  <Text type="supporting">
                    {d.previous_activity.kind_label} ·{" "}
                    {dateLabel(
                      d.previous_activity.completed_at ||
                        d.previous_activity.created_at,
                      true,
                    )}
                  </Text>
                  <Text style={{ whiteSpace: "pre-wrap" }}>
                    {d.previous_activity.result ||
                      d.previous_activity.note ||
                      "Tidak ada catatan hasil."}
                  </Text>
                  <HStack>
                    <Button
                      label="Lihat aktivitas asal"
                      variant="secondary"
                      href={relatedUrl(d.previous_activity.id)}
                    />
                  </HStack>
                </VStack>
              </>
            )}
            <Divider />
            <VStack gap={4}>
              <Heading level={2}>
                {done ? "Hasil interaksi" : "Catat hasil"}
              </Heading>
              {done ? (
                <Text style={{ whiteSpace: "pre-wrap" }}>
                  {activity.result || "Hasil interaksi belum dicatat."}
                </Text>
              ) : (
                <>
                  <Text color="secondary">
                    Simpan hasil untuk menyelesaikan aktivitas. Jadwalkan tindak
                    lanjut bila masih ada pekerjaan berikutnya.
                  </Text>
                  <SimpleForm
                    spec={d.form}
                    id="activity-result-form"
                    hideSubmit
                  />
                </>
              )}
            </VStack>
            {done && d.followups?.length > 0 && (
              <>
                <Divider />
                <VStack gap={4}>
                  <Heading level={2}>Aktivitas berikutnya</Heading>
                  {d.followups.map((next: Row) => (
                    <HStack
                      key={next.id}
                      gap={4}
                      justify="between"
                      vAlign="center"
                    >
                      <VStack gap={2}>
                        <Text weight="medium">{next.kind_label}</Text>
                        <Text type="supporting">
                          {dateLabel(next.scheduled_date || next.followup_date)}
                        </Text>
                      </VStack>
                      <Status value={next.status} />
                      <Button
                        label="Buka aktivitas"
                        variant="secondary"
                        href={relatedUrl(next.id)}
                      />
                    </HStack>
                  ))}
                </VStack>
              </>
            )}
          </VStack>
        </LayoutContent>
      }
      footer={
        !done ? (
          <LayoutFooter padding={4}>
            <HStack gap={3} justify="end">
              <Button
                label="Batal"
                href={d.back_url}
                variant="secondary"
                isDisabled={busy}
              />
              <Button
                label="Simpan & selesaikan"
                form="activity-result-form"
                type="submit"
                variant="primary"
                isLoading={busy}
              />
            </HStack>
          </LayoutFooter>
        ) : undefined
      }
    />
  );
}
