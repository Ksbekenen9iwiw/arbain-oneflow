import { useState } from "react";
import { IconCopy, IconDownload, IconPlus } from "@/icons";
import { Banner, Button, Icon, Layout, LayoutContent, Token } from "@/kit";
import { DataTable } from "../../components/DataKit";
import { ServerForm } from "../../components/FormKit";
import { useApp } from "../../router";
import type { Row } from "../../types";
import { HStack, Heading, Text, VStack, dateLabel } from "../../ui";

function Secret({ secret }: { secret: Row }) {
  const [copied, setCopied] = useState(false);
  const text = `OneFlow\nNama pengguna: ${secret.username}\nPassword sementara: ${secret.password}`;
  return (
    <section
      aria-label="Password sementara"
      className="flex flex-col gap-3 rounded-2xl bg-background-secondary-default p-4"
    >
      <div className="flex flex-col gap-0.5">
        <p className="text-headline-medium text-text-primary">
          {secret.created ? "Akun dibuat untuk " : "Password baru untuk "}
          {secret.name}
        </p>
        <p className="text-body-medium text-text-secondary">
          Catat atau kirim sekarang. Password ini hanya tampil sekali dan hilang
          saat halaman ditutup. Minta pengguna menggantinya lewat menu Ganti
          password.
        </p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-medium">
        <dt className="text-text-secondary">Nama pengguna</dt>
        <dd className="font-mono text-text-primary">{secret.username}</dd>
        <dt className="text-text-secondary">Password sementara</dt>
        <dd className="font-mono text-text-primary select-all">
          {secret.password}
        </dd>
      </dl>
      <div>
        <Button
          variant="secondary"
          size="sm"
          icon={<Icon icon={IconCopy} />}
          label={copied ? "Tersalin" : "Salin untuk dikirim"}
          onClick={() =>
            void navigator.clipboard?.writeText(text).then(() => setCopied(true))
          }
        />
      </div>
    </section>
  );
}

export default function Team() {
  const { page, busy } = useApp();
  const d = page.data;
  const active = d.members.filter((m: Row) => m.active).length;
  return (
    <Layout
      height="fill"
      contentWidth={1200}
      content={
        <LayoutContent padding={0} data-oneflow-scroll>
          <VStack padding={4} gap={6}>
            <HStack hAlign="between" vAlign="center" wrap="wrap" gap={4}>
              <VStack gap={2}>
                <Heading level={1}>Pengguna</Heading>
                <Text color="secondary">
                  {active} akun aktif dari {d.members.length}. Tambah orang
                  baru, buat ulang password yang lupa, atau tutup akses orang
                  yang sudah keluar.
                </Text>
              </VStack>
              <HStack gap={2} wrap="wrap">
                <Button
                  variant="secondary"
                  label="Unduh cadangan data"
                  icon={<Icon icon={IconDownload} />}
                  onClick={() => window.location.assign("/team/backup/")}
                />
                <Button
                  variant="primary"
                  label="Tambah pengguna"
                  href="/team/add/"
                  icon={<Icon icon={IconPlus} />}
                />
              </HStack>
            </HStack>
            {d.secret && <Secret secret={d.secret} />}
            <DataTable
              title="Daftar pengguna"
              rows={d.members}
              empty="Belum ada pengguna."
              columns={[
                {
                  key: "name",
                  header: "Nama",
                  renderCell: (m: Row) => (
                    <VStack gap={0}>
                      <Text weight="semibold">
                        {m.name}
                        {m.is_me ? " (kamu)" : ""}
                      </Text>
                      <Text color="secondary" size="sm">
                        {m.username}
                      </Text>
                    </VStack>
                  ),
                },
                { key: "role", header: "Peran", renderCell: (m: Row) => m.role },
                {
                  key: "active",
                  header: "Status",
                  renderCell: (m: Row) => (
                    <Token
                      label={m.active ? "Aktif" : "Nonaktif"}
                      color={m.active ? "green" : "neutral"}
                    />
                  ),
                },
                {
                  key: "last_login",
                  header: "Terakhir masuk",
                  renderCell: (m: Row) =>
                    m.last_login ? dateLabel(m.last_login, true) : "Belum pernah",
                },
                {
                  key: "actions",
                  header: "",
                  renderCell: (m: Row) => (
                    <HStack gap={2} hAlign="end" wrap="wrap">
                      {m.active && (
                        <ServerForm action={`/team/${m.id}/reset/`}>
                          <Button
                            type="submit"
                            size="sm"
                            variant="secondary"
                            label="Buat ulang password"
                            isDisabled={busy}
                          />
                        </ServerForm>
                      )}
                      {!m.is_me && (
                        <ServerForm action={`/team/${m.id}/active/`}>
                          <Button
                            type="submit"
                            size="sm"
                            variant="ghost"
                            label={m.active ? "Nonaktifkan" : "Aktifkan"}
                            isDisabled={busy}
                          />
                        </ServerForm>
                      )}
                    </HStack>
                  ),
                },
              ]}
            />
            <Banner
              status="info"
              title="Cadangan data"
              description="Berkas cadangan memuat seluruh data OneFlow tanpa password. Unduh sebulan sekali dan simpan di Google Drive perusahaan. Berkas ini dipakai untuk memulihkan data bila terjadi masalah."
            />
          </VStack>
        </LayoutContent>
      }
    />
  );
}
