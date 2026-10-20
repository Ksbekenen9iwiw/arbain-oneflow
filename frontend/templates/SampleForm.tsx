import { MotionPanel } from "../motion";

import { withReturn } from "../navigation";
import { useState } from "react";
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
import { QuantityInput } from "../QuantityInput";
import { useApp } from "../router";
import type { Field, FormSpec, Row } from "../types";

type Line = {
  id: string;
  product: string;
  quantity: string;
  deleted: boolean;
  errors: Record<string, string>;
};

export default function SampleForm() {
  const { page, busy, markDirty } = useApp();
  const d = page.data;
  const spec: FormSpec = d.form;
  const { values, onChange } = useFields(spec);
  const [lines, setLines] = useState<Line[]>(() =>
    (d.formset.forms.length
      ? d.formset.forms
      : [{ fields: [], errors: [] }]
    ).map((form: FormSpec, index: number) => ({
      id: String(index),
      product: String(
        form.fields.find((field) => field.key === "product")?.value || "",
      ),
      quantity: String(
        form.fields.find((field) => field.key === "quantity")?.value || "1",
      ),
      deleted: !!form.fields.find((field) => field.key === "DELETE")?.value,
      errors: Object.fromEntries(
        form.fields
          .filter((field) => field.errors.length)
          .map((field) => [field.key, field.errors.join(" ")]),
      ),
    })),
  );
  const field = (key: string, overrides: Partial<Field> = {}) => {
    const item = spec.fields.find((candidate) => candidate.key === key);
    return item ? (
      <FieldControl
        key={item.name}
        field={{
          ...item,
          ...overrides,
          errors: values[item.name] !== item.value ? [] : item.errors,
        }}
        value={values[item.name]}
        onChange={(value) => onChange(item.name, value)}
      />
    ) : null;
  };
  const updateLine = (id: string, patch: Partial<Line>) => {
    markDirty();
    setLines((current) =>
      current.map((line) =>
        line.id === id ? { ...line, ...patch, errors: {} } : line,
      ),
    );
  };
  const active = lines.filter((line) => !line.deleted);
  return (
    <Layout
      height="fill"
      contentWidth={1260}
      defaultHasDividers
      header={
        <PageHeader
          title={d.editing ? `Edit ${d.editing}` : "Buat pengajuan sampel"}
          description="Draf tidak mereservasi atau mengurangi stok."
          back={{ href: d.back_url, label: "Kembali" }}
          actions={
            <Button
              label="Tambah calon pelanggan"
              href={withReturn("/customers/new/", d.back_url)}
              variant="secondary"
            />
          }
        />
      }
      end={
        <MotionPanel width="19rem" padding={5} role="complementary">
          <VStack gap={6}>
            <VStack gap={2}>
              <Heading level={2}>Alur pengajuan</Heading>
              <Text weight="semibold">1. Simpan draf</Text>
              <Text type="supporting">
                Periksa pelanggan, produk, dan alasan pemberian.
              </Text>
            </VStack>
            <VStack gap={2}>
              <Text weight="semibold">2. Ajukan ke manajer</Text>
              <Text type="supporting">
                Rekomendasi beserta riwayat pelanggan tersedia di detail untuk
                ditinjau.
              </Text>
            </VStack>
            <VStack gap={2}>
              <Text weight="semibold">3. Kirim & tindak lanjuti</Text>
              <Text type="supporting">
                Gudang mengirim setelah disetujui. Sales mencatat penerimaan dan
                tanggapan.
              </Text>
            </VStack>
            <Text type="supporting">
              Sampel mengurangi stok saat dikirim dan tidak menambah omzet.
            </Text>
          </VStack>
        </MotionPanel>
      }
      content={
        <LayoutContent padding={6} data-oneflow-scroll>
          <ServerForm id="sample-form">
            <VStack gap={6}>
              {[...spec.errors, ...d.formset.errors].map(
                (error: string, index: number) => (
                  <Banner
                    key={index}
                    status="error"
                    title={error}
                    role="alert"
                    data-form-errors
                    tabIndex={-1}
                  />
                ),
              )}
              {d.draft_version && (
                <input
                  type="hidden"
                  name="draft_version"
                  value={d.draft_version}
                />
              )}
              {d.formset.management.fields.map((management: Field) => (
                <input
                  key={management.name}
                  type="hidden"
                  name={management.name}
                  value={
                    management.key === "TOTAL_FORMS"
                      ? String(lines.length)
                      : String(management.value)
                  }
                />
              ))}
              <VStack gap={4}>
                <Heading level={2}>Pelanggan</Heading>
                {field("customer")}
                <Text type="supporting">
                  Cari pelanggan yang sudah tercatat sebelum menambahkan calon
                  pelanggan baru.
                </Text>
              </VStack>
              <VStack gap={4}>
                <HStack hAlign="between" vAlign="center">
                  <Heading level={2}>Produk sampel</Heading>
                  <Button
                    label="Tambah produk"
                    type="button"
                    isDisabled={lines.length >= 50}
                    variant="secondary"
                    onClick={() => {
                      markDirty();
                      setLines((current) => [
                        ...current,
                        {
                          id: String(current.length),
                          product: "",
                          quantity: "1",
                          deleted: false,
                          errors: {},
                        },
                      ]);
                    }}
                  />
                </HStack>
                {active.map((line) => (
                  <HStack key={line.id} gap={3} vAlign="end">
                    <input
                      type="hidden"
                      name={`lines-${line.id}-DELETE`}
                      value=""
                    />
                    <VStack gap={2} width="100%">
                      <Selector
                        label="Produk"
                        htmlName={`lines-${line.id}-product`}
                        width="100%"
                        hasSearch
                        value={line.product}
                        options={d.catalog.map((product: Row) => ({
                          value: product.id,
                          label: `${product.name} · ${product.sku}`,
                        }))}
                        onChange={(product) => updateLine(line.id, { product })}
                        status={
                          line.errors.product
                            ? { type: "error", message: line.errors.product }
                            : undefined
                        }
                      />
                      {line.product && (
                        <Text type="supporting">
                          Stok bebas saat ini:{" "}
                          {d.catalog.find(
                            (product: Row) => product.id === line.product,
                          )?.available ?? "—"}{" "}
                          {
                            d.catalog.find(
                              (product: Row) => product.id === line.product,
                            )?.unit
                          }
                          . Kelayakan batch diperiksa saat persetujuan.
                        </Text>
                      )}
                    </VStack>
                    <QuantityInput
                      label="Jumlah"
                      htmlName={`lines-${line.id}-quantity`}
                      value={line.quantity}
                      min="1"
                      max="9223372036854775807"
                      onChange={(quantity) =>
                        updateLine(line.id, { quantity: String(quantity) })
                      }
                      status={
                        line.errors.quantity
                          ? { type: "error", message: line.errors.quantity }
                          : undefined
                      }
                    />
                    <Button
                      label="Hapus"
                      type="button"
                      variant="secondary"
                      isDisabled={active.length === 1}
                      onClick={() => updateLine(line.id, { deleted: true })}
                    />
                  </HStack>
                ))}
                {lines
                  .filter((line) => line.deleted)
                  .map((line) => (
                    <VStack key={line.id}>
                      <input
                        type="hidden"
                        name={`lines-${line.id}-product`}
                        value={line.product}
                      />
                      <input
                        type="hidden"
                        name={`lines-${line.id}-quantity`}
                        value={line.quantity}
                      />
                      <input
                        type="hidden"
                        name={`lines-${line.id}-DELETE`}
                        value="on"
                      />
                    </VStack>
                  ))}
              </VStack>
              <VStack gap={4}>
                <Heading level={2}>Dasar pengajuan</Heading>
                {field("purpose", {
                  help: "Jelaskan tujuan pemberian agar manajer bisa menilai kebutuhan sampel.",
                })}
                {field("customer_need")}
                {field("potential_orders")}
                {field("business_profile", {
                  help: "Wajib sebelum diajukan: jenis usaha dan kebutuhan utama pelanggan.",
                })}
                {field("notes")}
              </VStack>
            </VStack>
          </ServerForm>
        </LayoutContent>
      }
      footer={
        <LayoutFooter padding={6}>
          <HStack hAlign="between" gap={3}>
            <Button label="Batal" href={d.back_url} isDisabled={busy} />
            <Text type="supporting">
              Draf dapat diperiksa sebelum diajukan.
            </Text>
            <Button
              form="sample-form"
              type="submit"
              variant="primary"
              label="Simpan draf"
              isLoading={busy}
            />
          </HStack>
        </LayoutFooter>
      }
    />
  );
}
