import type { ReactNode } from "react";
import { Banner, Button, Layout, LayoutContent } from "@/kit";
import { DataTable } from "../../components/DataKit";
import { useApp } from "../../router";
import type { Row } from "../../types";
import { HStack, Heading, Text, VStack, dateLabel, money, quantity } from "../../ui";

function Meter({ used, limit }: { used: number; limit: number }) {
  const share = Number(limit) > 0 ? Math.min(1, Number(used) / Number(limit)) : 1;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-chart-track" aria-hidden>
      <span
        className={
          "block h-full rounded-full transition-[width] duration-500 " +
          (share >= 0.9 ? "bg-text-error-primary" : "bg-chart-9-active")
        }
        style={{ width: `${share * 100}%` }}
      />
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value: string;
  hint: string;
  children?: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className="flex min-w-0 flex-1 basis-56 flex-col gap-2 rounded-2xl bg-background-secondary-default p-4"
    >
      <p className="text-body-medium text-text-secondary">{label}</p>
      <p className="text-title-semibold text-text-primary tabular-nums">{value}</p>
      {children}
      <p className="text-caption-regular text-text-tertiary">{hint}</p>
    </section>
  );
}

export default function AssistantUsage() {
  const { page } = useApp();
  const u = page.data.usage;
  const month = new Date(u.month).toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });
  return (
    <Layout
      height="fill"
      contentWidth={1200}
      content={
        <LayoutContent padding={0} data-oneflow-scroll>
          <VStack padding={4} gap={6}>
            <HStack hAlign="between" vAlign="center" wrap="wrap" gap={4}>
              <VStack gap={2}>
                <Heading level={1}>Pemakaian Tanya OneFlow</Heading>
                <Text color="secondary">
                  {month}. Hanya chat yang memakai AI berbayar; rencana kunjungan
                  dan Perlu perhatian tidak.
                </Text>
              </VStack>
              <Button label="Atur batas dan harga" href="/assistant/policy/" />
            </HStack>
            {!page.data.enabled && (
              <Banner
                status="info"
                title="Tanya OneFlow belum aktif"
                description="Kunci API belum dipasang di server, jadi belum ada biaya AI."
              />
            )}
            <div className="flex flex-wrap gap-3">
              <Tile
                label="Pertanyaan ke AI bulan ini"
                value={`${quantity(u.billed)} / ${quantity(u.monthly_company)}`}
                hint={`Batas per pengguna: ${quantity(u.daily_per_user)} per hari`}
              >
                <Meter used={u.billed} limit={u.monthly_company} />
              </Tile>
              <Tile
                label="Dijawab dari simpanan"
                value={quantity(u.from_cache)}
                hint="Pertanyaan sama pada data yang sama, tanpa biaya"
              />
              <Tile
                label="Perkiraan biaya"
                value={u.priced ? money(u.cost_rupiah) : "Belum dihitung"}
                hint={
                  u.priced
                    ? `${quantity(u.input_tokens)} token masukan, ${quantity(u.output_tokens)} keluaran`
                    : "Isi harga token di Atur batas dan harga"
                }
              />
            </div>
            <DataTable
              title="Pemakaian per pengguna"
              rows={u.people}
              empty="Belum ada pertanyaan bulan ini."
              columns={[
                { key: "name", header: "Pengguna", renderCell: (row: Row) => row.name },
                {
                  key: "today",
                  header: "Hari ini",
                  align: "end",
                  renderCell: (row: Row) => `${quantity(row.today)} / ${quantity(u.daily_per_user)}`,
                },
                {
                  key: "questions",
                  header: "Bulan ini",
                  align: "end",
                  renderCell: (row: Row) => quantity(row.questions),
                },
                {
                  key: "from_cache",
                  header: "Dari simpanan",
                  align: "end",
                  renderCell: (row: Row) => quantity(row.from_cache),
                },
                {
                  key: "tokens",
                  header: "Token",
                  align: "end",
                  renderCell: (row: Row) => quantity(row.tokens),
                },
                {
                  key: "cost",
                  header: "Perkiraan biaya",
                  align: "end",
                  renderCell: (row: Row) =>
                    row.cost_rupiah == null ? "–" : money(row.cost_rupiah),
                },
                {
                  key: "last",
                  header: "Terakhir",
                  renderCell: (row: Row) => dateLabel(row.last_day),
                },
              ]}
            />
          </VStack>
        </LayoutContent>
      }
    />
  );
}
