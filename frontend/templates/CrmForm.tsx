// Copyright (c) Meta Platforms, Inc. and affiliates.
// Retains Astryx form-two-column's single-submit frame and pinned actions.
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import {
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  Banner,
  PageHeader,
  FieldControl,
  ServerForm,
  useFields,
} from "../ui";
import { useApp } from "../router";
import type { Field, FormSpec } from "../types";
export default function CrmForm() {
  const { page, busy } = useApp();
  const d = page.data,
    spec: FormSpec = d.form;
  const { values, onChange } = useFields(spec);
  const activity = d.form_kind === "activity",
    done = values.status === "DONE";
  const field = (key: string, overrides: Partial<Field> = {}) => {
    const f = spec.fields.find((f) => f.key === key);
    const intentChanged =
      activity &&
      ["kind", "status"].some(
        (key) => values[key] !== spec.fields.find((f) => f.key === key)?.value,
      );
    return f ? (
      <FieldControl
        key={f.name}
        field={{
          ...f,
          ...overrides,
          errors:
            values[f.name] !== f.value ||
            (intentChanged &&
              ["scheduled_date", "followup_date", "result"].includes(key))
              ? []
              : f.errors,
        }}
        value={values[f.name]}
        onChange={(v) => onChange(f.name, v)}
      />
    ) : null;
  };
  const plannedDate =
    values.kind === "FOLLOWUP" ? "followup_date" : "scheduled_date";
  return (
    <Layout
      height="fill"
      contentWidth={800}
      defaultHasDividers
      header={
        <PageHeader
          title={d.heading}
          description={d.customer?.name}
          back={{ href: d.back_url, label: "Kembali" }}
        />
      }
      content={
        <LayoutContent padding={6} data-oneflow-scroll>
          <ServerForm id="record-form">
            <VStack gap={6}>
              {spec.errors.map((error, i) => (
                <Banner
                  key={i}
                  status="error"
                  title={error}
                  data-form-errors
                  tabIndex={-1}
                />
              ))}
              {activity ? (
                <>
                  <Selector
                    label="Apa yang ingin dicatat?"
                    value={String(values.status || "PLANNED")}
                    options={[
                      { value: "PLANNED", label: "Jadwalkan aktivitas" },
                      { value: "DONE", label: "Catat interaksi selesai" },
                    ]}
                    onChange={(v) => onChange("status", v)}
                  />
                  <input
                    type="hidden"
                    name="status"
                    value={String(values.status || "PLANNED")}
                  />
                  <VStack gap={4}>
                    {field("kind")}
                    {field("stage")}
                  </VStack>
                  {done ? (
                    <VStack gap={4}>
                      {field("scheduled_date", {
                        label: "Tanggal aktivitas (opsional)",
                        required: false,
                      })}
                      {field("result", {
                        required: true,
                        label: "Hasil interaksi",
                      })}
                      {field("note", { label: "Catatan tambahan (opsional)" })}
                      {field("followup_date", {
                        label: "Tindak lanjut berikutnya (opsional)",
                        required: false,
                        help: "Jika diisi, satu aktivitas tindak lanjut baru akan dibuat setelah hasil ini disimpan.",
                      })}
                    </VStack>
                  ) : (
                    <VStack gap={4}>
                      {field(plannedDate, {
                        label:
                          values.kind === "VISIT"
                            ? "Tanggal kunjungan"
                            : values.kind === "FOLLOWUP"
                              ? "Tanggal tindak lanjut"
                              : "Tanggal interaksi (opsional)",
                        required: values.kind !== "INTERACTION",
                        help: "",
                      })}
                      {field("note", { label: "Rencana / catatan (opsional)" })}
                      {/* Hidden values are deliberately omitted from POST; their draft remains when changing intent. */}
                      {spec.fields
                        .filter(
                          (f) =>
                            [
                              "result",
                              plannedDate === "followup_date"
                                ? "scheduled_date"
                                : "followup_date",
                            ].includes(f.key) && f.errors.length,
                        )
                        .map((f) => field(f.key))}
                    </VStack>
                  )}
                </>
              ) : (
                <>
                  <VStack gap={4}>
                    <Heading level={2}>Identitas pelanggan</Heading>
                    {field("name")}
                    {field("code")}
                  </VStack>
                  <VStack gap={4}>
                    <Heading level={2}>Kontak</Heading>
                    {field("phone")}
                    {field("address")}
                  </VStack>
                  <VStack gap={4}>
                    <Heading level={2}>Pengelolaan</Heading>
                    {page.role === "SALES" && (
                      <Text color="secondary">
                        Penanggung jawab: {page.user?.name}
                      </Text>
                    )}
                    {field("owner")}
                    {field("is_active")}
                  </VStack>
                </>
              )}
            </VStack>
          </ServerForm>
        </LayoutContent>
      }
      footer={
        <LayoutFooter padding={6}>
          <HStack hAlign="between" gap={3}>
            <Button label="Batal" href={d.back_url} isDisabled={busy} />
            <Button
              form="record-form"
              type="submit"
              variant="primary"
              label={
                activity
                  ? done
                    ? "Simpan hasil interaksi"
                    : "Simpan jadwal"
                  : "Simpan pelanggan"
              }
              isLoading={busy}
            />
          </HStack>
        </LayoutFooter>
      }
    />
  );
}
