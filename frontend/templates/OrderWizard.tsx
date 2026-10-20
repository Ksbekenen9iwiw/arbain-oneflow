import { ProductIdentity } from "../ProductIdentity";
import { useContentMotion, useListMotion, MotionStack } from "../motion";
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Adapted from Astryx 0.7.0 form-wizard. Frame, stepper and pinned footer
// retain the original template; the fields submit to Django's order formset.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Layout,
  LayoutContent,
  LayoutFooter,
  LayoutHeader,
} from "@astryxdesign/core/Layout";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Step, Stepper } from "@astryxdesign/core/Stepper";
import { Selector, SelectorOption } from "@astryxdesign/core/Selector";
import { QuantityInput } from "../QuantityInput";
import { proportional } from "@astryxdesign/core/Table";
import { Divider } from "@astryxdesign/core/Divider";
import { Icon } from "@astryxdesign/core/Icon";
import {
  VStack,
  HStack,
  StackItem,
  Heading,
  Text,
  Button,
  Banner,
  DataTable,
  Fact,
  money,
  quantity,
} from "../ui";
import { useApp } from "../router";
import {
  initialLines,
  initialStep,
  orderPayload,
  orderTotal,
  validQuantity,
  validateOrder,
  type WizardData,
} from "../orderWizard";

const STEPS = ["Pelanggan", "Produk & jumlah", "Tinjau pesanan"];
const footerZone: CSSProperties = { flexBasis: 0 };
export default function OrderWizard() {
  const { page, busy, submit, markDirty } = useApp();
  const d = page.data as WizardData;
  const customerField = d.form.fields.find((f) => f.key === "customer")!;
  const [customer, setCustomer] = useState(String(customerField.value || ""));
  const [customerError, setCustomerError] = useState(
    customerField.errors.join(" "),
  );
  const [lines, setLines] = useState(() => initialLines(d));
  const [step, setStep] = useState(() => initialStep(d));
  const [attempted, setAttempted] = useState<ReadonlySet<number>>(new Set());
  const [focusError, setFocusError] = useState("");
  const panel = useRef<HTMLElement>(null);
  const errors = validateOrder(
    customer,
    customerField.choices,
    lines,
    d.catalog,
  );
  const active = lines.filter((l) => !l.deleted);
  useContentMotion(panel, step, "step");
  useListMotion(panel, `${step}:${active.map((line) => line.id).join(",")}`);
  const total = orderTotal(lines, d.catalog);
  const customerDetails = d.customer_details?.find((c) => c.id === customer);
  const customerLabel = customerField.choices.find(
    (c) => c.value === customer,
  )?.label;
  const shownError = (at: number, key: string, server = "") =>
    server || (attempted.has(at) ? errors[at]?.[key] : "");
  const status = (message: string) =>
    message ? { type: "error" as const, message } : undefined;

  useEffect(() => {
    const root = panel.current;
    if (!root) return;
    const target = focusError
      ? root.querySelector<HTMLElement>(
          `[data-field="${focusError}"] input:not([type="hidden"]), [data-field="${focusError}"] button`,
        )
      : null;
    (target || root.querySelector<HTMLElement>("h2"))?.focus();
    if (!focusError)
      root.closest("[data-oneflow-scroll]")?.scrollTo({ top: 0 });
  }, [step, focusError]);

  const goTo = (next: number) => {
    if (busy) return;
    if (next > step) {
      setAttempted(
        (old) =>
          new Set([...old, ...Array.from({ length: next }, (_, i) => i)]),
      );
      for (let i = 0; i < next; i++) {
        const first = Object.keys(errors[i] || {})[0];
        if (first) {
          setStep(i);
          setFocusError(first);
          // Repeated attempts should focus the same invalid control again.
          requestAnimationFrame(() =>
            panel.current
              ?.querySelector<HTMLElement>(
                `[data-field="${first}"] input:not([type="hidden"]), [data-field="${first}"] button`,
              )
              ?.focus(),
          );
          return;
        }
      }
    }
    setFocusError("");
    setStep(next);
  };
  const save = () => {
    if (busy) return;
    setAttempted(new Set([0, 1]));
    const invalid = errors.findIndex((e) => Object.keys(e).length);
    if (invalid >= 0) {
      setStep(invalid);
      setFocusError(Object.keys(errors[invalid])[0]);
      return;
    }
    const payload = orderPayload(
      page.csrf,
      customer,
      lines,
      d.formset.management,
    );
    if (d.editing) payload.set("draft_version", d.draft_version || "");
    void submit(page.url, payload);
  };
  const update = (
    id: string,
    key: "product" | "quantity" | "deleted",
    value: string | boolean,
  ) => {
    markDirty();
    setLines((all) =>
      all.map((line) =>
        line.id === id
          ? { ...line, [key]: value, errors: { ...line.errors, [key]: "" } }
          : line,
      ),
    );
  };
  const addLine = () => {
    markDirty();
    setLines((all) => {
      const available = all.findIndex((l) => l.deleted);
      const id = String(available < 0 ? all.length : available);
      const line = {
        id,
        product: "",
        quantity: "",
        deleted: false,
        errors: {},
      };
      return available < 0
        ? [...all, line]
        : all.map((l, i) => (i === available ? line : l));
    });
  };
  const shortages = active.filter((l) => {
    const product = d.catalog.find((p) => p.id === l.product);
    return (
      product &&
      validQuantity(l.quantity) &&
      BigInt(l.quantity) > BigInt(product.available)
    );
  });

  return (
    <Layout
      height="fill"
      contentWidth={720}
      padding={5}
      defaultHasDividers
      header={
        <LayoutHeader hasDivider={false}>
          <VStack gap={5}>
            <HStack gap={3} vAlign="center">
              <StackItem size="fill">
                <VStack gap={1}>
                  <Heading level={1}>
                    {d.editing ? `Edit ${d.editing}` : "Buat pesanan"}
                  </Heading>
                  {d.editing && (
                    <Text type="supporting">
                      Harga produk lama tetap. Produk baru memakai harga saat
                      ini.
                    </Text>
                  )}
                </VStack>
              </StackItem>
              <Button
                label="Batal"
                variant="ghost"
                href={d.back_url || "/orders/"}
                isDisabled={busy}
              />
            </HStack>
            <Stepper
              activeStep={step}
              orientation="horizontal"
              onStepClick={goTo}
              label={
                d.editing ? "Progres edit pesanan" : "Progres buat pesanan"
              }
              density="balanced"
              indicatorPosition="on-track"
            >
              {STEPS.map((label, i) => (
                <Step
                  key={label}
                  step={i}
                  label={label}
                  isDisabled={busy}
                  status={
                    attempted.has(i) && Object.keys(errors[i] || {}).length
                      ? "error"
                      : undefined
                  }
                />
              ))}
            </Stepper>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent data-oneflow-scroll>
          <section ref={panel} aria-labelledby="order-step-heading">
            <form
              id="order-wizard"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                if (step === 2) save();
                else goTo(step + 1);
              }}
            >
              <VStack gap={5}>
                <VStack gap={1}>
                  <Heading level={2} id="order-step-heading" tabIndex={-1}>
                    {
                      [
                        "Pilih pelanggan",
                        "Isi produk pesanan",
                        "Tinjau pesanan",
                      ][step]
                    }
                  </Heading>
                  <Text type="supporting" color="secondary">
                    {
                      [
                        "Pilih pelanggan yang akan menerima pesanan ini.",
                        d.editing
                          ? "Ubah produk dan jumlah yang dipesan. Harga produk lama tetap dipertahankan."
                          : "Tambahkan produk dan jumlah yang dipesan. Harga mengikuti katalog saat ini.",
                        "Pastikan pelanggan, produk, dan jumlah sudah sesuai sebelum menyimpan draft.",
                      ][step]
                    }
                  </Text>
                </VStack>
                {d.form.errors.map((error, i) => (
                  <Banner key={i} status="error" title={error} />
                ))}
                {step === 0 && (
                  <>
                    {d.suggested && (
                      <Banner
                        status="info"
                        title="Diisi dari rekomendasi"
                        description="Pelanggan dan produk sudah dipilih. Kamu tetap bisa mengubahnya sebelum menyimpan."
                      />
                    )}
                    <VStack data-field="customer">
                      <FormLayout defaultOptionality="optional">
                        <Selector
                          label="Pelanggan"
                          isRequired
                          value={customer}
                          onChange={(value) => {
                            markDirty();
                            setCustomer(value);
                            setCustomerError("");
                          }}
                          options={customerField.choices.filter((c) => c.value)}
                          placeholder="Pilih pelanggan"
                          hasSearch
                          searchPlaceholder="Cari pelanggan…"
                          emptySearchText="Pelanggan tidak ditemukan"
                          width="100%"
                          isDisabled={busy}
                          status={status(
                            shownError(0, "customer", customerError),
                          )}
                          statusVariant="detached"
                        />
                      </FormLayout>
                    </VStack>
                    {customerDetails && (
                      <HStack gap={6} wrap="wrap">
                        <Fact label="Telepon">
                          {customerDetails.phone || "Belum diisi"}
                        </Fact>
                        <Fact label="Alamat">
                          {customerDetails.address || "Belum diisi"}
                        </Fact>
                        <Fact label="Sales">{customerDetails.owner.name}</Fact>
                      </HStack>
                    )}
                    {!customerField.choices.some((c) => c.value) && (
                      <Banner
                        status="info"
                        title="Belum ada pelanggan aktif"
                        description="Tambahkan pelanggan dari menu Pelanggan sebelum membuat pesanan."
                      />
                    )}
                  </>
                )}
                {step === 1 && (
                  <>
                    <HStack hAlign="between" vAlign="center" gap={3}>
                      <Text weight="medium">{customerLabel}</Text>
                      <Button
                        label="Ubah pelanggan"
                        variant="ghost"
                        onClick={() => goTo(0)}
                        isDisabled={busy}
                      />
                    </HStack>
                    {d.formset.errors.map((error, i) => (
                      <Banner key={i} status="error" title={error} />
                    ))}
                    {d.formset.forms.flatMap((form, i) =>
                      lines[i]?.deleted
                        ? []
                        : form.errors.map((error, j) => (
                            <Banner
                              key={`${i}-${j}`}
                              status="error"
                              title={error}
                            />
                          )),
                    )}
                    {shownError(1, "lines") && (
                      <Banner status="error" title={shownError(1, "lines")} />
                    )}
                    {active.map((line, index) => {
                      const product = d.catalog.find(
                        (p) => p.id === line.product,
                      );
                      const subtotal =
                        product && validQuantity(line.quantity)
                          ? BigInt(product.price) * BigInt(line.quantity)
                          : 0n;
                      return (
                        <MotionStack
                          preset="expand"
                          data-motion-item={line.id}
                          key={line.id}
                          gap={3}
                        >
                          {index > 0 && <Divider />}
                          <HStack gap={3} vAlign="start">
                            <StackItem size="fill">
                              <VStack data-field={`product-${line.id}`}>
                                <Selector
                                  label={`Produk ${index + 1}`}
                                  isRequired
                                  value={line.product}
                                  onChange={(value) =>
                                    update(line.id, "product", value)
                                  }
                                  options={d.catalog.map((p) => ({
                                    value: p.id,
                                    label: `${p.name} · ${p.sku}`,
                                  }))}
                                  renderOption={(option) => {
                                    const item = d.catalog.find(
                                      (p) => p.id === option.value,
                                    );
                                    return (
                                      <ProductIdentity
                                        sku={item?.sku}
                                        name={
                                          item?.name || option.label || "Produk"
                                        }
                                      >
                                        <SelectorOption
                                          label={item?.name || option.label}
                                          description={item?.sku}
                                        />
                                      </ProductIdentity>
                                    );
                                  }}
                                  renderValue={(option) => (
                                    <ProductIdentity
                                      sku={
                                        d.catalog.find(
                                          (p) => p.id === option.value,
                                        )?.sku
                                      }
                                      name={option.label || "Produk"}
                                      size="compact"
                                    >
                                      <Text maxLines={1}>{option.label}</Text>
                                    </ProductIdentity>
                                  )}
                                  placeholder="Pilih produk"
                                  hasSearch
                                  searchPlaceholder="Cari nama atau SKU…"
                                  emptySearchText="Produk tidak ditemukan"
                                  width="100%"
                                  isDisabled={busy}
                                  status={status(
                                    shownError(
                                      1,
                                      `product-${line.id}`,
                                      line.errors.product,
                                    ),
                                  )}
                                  statusVariant="detached"
                                />
                              </VStack>
                            </StackItem>
                            <VStack
                              width="13rem"
                              data-field={`quantity-${line.id}`}
                            >
                              <QuantityInput
                                label="Jumlah"
                                controlLabel={`Jumlah produk ${index + 1}`}
                                min="1"
                                isRequired
                                value={line.quantity}
                                onChange={(value) =>
                                  update(line.id, "quantity", value)
                                }
                                placeholder="0"

                                isDisabled={busy}
                                status={status(
                                  shownError(
                                    1,
                                    `quantity-${line.id}`,
                                    line.errors.quantity,
                                  ),
                                )}
                              />
                            </VStack>
                          </HStack>
                          <HStack gap={3} hAlign="between" vAlign="center">
                            <Text type="supporting" color="secondary">
                              {product
                                ? `${money(product.price)} / ${product.unit} · stok bebas ${quantity(product.available)} ${product.unit}`
                                : "Pilih produk untuk melihat harga dan stok."}
                            </Text>
                            <Button
                              label={`Hapus produk ${index + 1}`}
                              tooltip="Hapus produk"
                              icon={<Icon icon="close" />}
                              isIconOnly
                              size="sm"
                              variant="ghost"
                              isDisabled={busy || active.length === 1}
                              onClick={() => {
                                update(line.id, "deleted", true);
                                requestAnimationFrame(() => {
                                  const remaining =
                                    panel.current?.querySelectorAll<HTMLElement>(
                                      "[data-motion-item]",
                                    );
                                  const next =
                                    remaining?.[
                                      Math.min(index, remaining.length - 1)
                                    ];
                                  next
                                    ?.querySelector<HTMLButtonElement>(
                                      "button:not(:disabled)",
                                    )
                                    ?.focus({ preventScroll: true });
                                });
                              }}
                            />
                          </HStack>
                          {product && validQuantity(line.quantity) && (
                            <HStack hAlign="between">
                              <Text type="supporting">Subtotal</Text>
                              <Text weight="medium">
                                {money(subtotal.toString())}
                              </Text>
                            </HStack>
                          )}
                        </MotionStack>
                      );
                    })}
                    <HStack hAlign="start">
                      <Button
                        label="Tambah produk"
                        variant="secondary"
                        onClick={addLine}
                        isDisabled={busy || active.length >= 50}
                      />
                    </HStack>
                    {shownError(1, "total") && (
                      <Banner status="error" title={shownError(1, "total")} />
                    )}
                  </>
                )}
                {step === 2 && (
                  <>
                    <HStack hAlign="between" vAlign="center">
                      <VStack gap={1}>
                        <Text type="supporting" color="secondary">
                          Pelanggan
                        </Text>
                        <Text weight="medium">{customerLabel}</Text>
                      </VStack>
                      <Button
                        label="Ubah pelanggan"
                        size="sm"
                        variant="ghost"
                        onClick={() => goTo(0)}
                        isDisabled={busy}
                      />
                    </HStack>
                    <Divider />
                    <VStack gap={3}>
                      <HStack hAlign="between" vAlign="center">
                        <Heading level={3}>Produk pesanan</Heading>
                        <Button
                          label="Ubah produk"
                          size="sm"
                          variant="ghost"
                          onClick={() => goTo(1)}
                          isDisabled={busy}
                        />
                      </HStack>
                      <DataTable
                        rows={active.map((line) => ({
                          ...line,
                          item: d.catalog.find((p) => p.id === line.product)!,
                        }))}
                        columns={[
                          {
                            key: "product",
                            header: "Produk",
                            width: proportional(2),
                            renderCell: (row) => (
                              <ProductIdentity
                                sku={row.item.sku}
                                name={row.item.name}
                                size="row"
                              >
                                <VStack gap={1}>
                                  <Text>{row.item.name}</Text>
                                  <Text type="supporting" color="secondary">
                                    {row.item.sku}
                                  </Text>
                                </VStack>
                              </ProductIdentity>
                            ),
                          },
                          {
                            key: "quantity",
                            header: "Jumlah",
                            align: "end",
                            renderCell: (row) =>
                              `${quantity(row.quantity)} ${row.item.unit}`,
                          },
                          {
                            key: "price",
                            header: "Harga satuan",
                            align: "end",
                            renderCell: (row) => money(row.item.price),
                          },
                          {
                            key: "subtotal",
                            header: "Subtotal",
                            align: "end",
                            renderCell: (row) =>
                              money(
                                (
                                  BigInt(row.item.price) * BigInt(row.quantity)
                                ).toString(),
                              ),
                          },
                        ]}
                      />
                    </VStack>
                  </>
                )}
                {step > 0 && (
                  <>
                    <Divider />
                    <HStack hAlign="between" vAlign="center">
                      <Text weight="medium">Estimasi total</Text>
                      <Heading level={3}>{money(total.toString())}</Heading>
                    </HStack>
                    {shortages.length > 0 && (
                      <Banner
                        status="warning"
                        title="Jumlah melebihi stok tersedia"
                        description={
                          shortages
                            .map((line) => {
                              const product = d.catalog.find(
                                (p) => p.id === line.product,
                              )!;
                              const available = BigInt(product.available);
                              const missing =
                                BigInt(line.quantity) -
                                (available > 0n ? available : 0n);
                              return `${product.name}: diminta ${quantity(line.quantity)}, tersedia ${quantity(product.available)}, kurang ${quantity(missing.toString())} ${product.unit}.`;
                            })
                            .join(" ") +
                          " Draft tetap bisa disimpan; konfirmasi menunggu stok mencukupi."
                        }
                      />
                    )}
                    {step === 2 && (
                      <Text type="supporting" color="secondary">
                        {d.editing
                          ? "Perubahan belum mereservasi stok. Harga produk lama tetap; harga produk baru diperiksa saat disimpan."
                          : "Disimpan sebagai draft. Stok baru direservasi saat pesanan dikonfirmasi. Harga diperiksa kembali saat disimpan."}
                      </Text>
                    )}
                  </>
                )}
              </VStack>
            </form>
          </section>
        </LayoutContent>
      }
      footer={
        <LayoutFooter>
          <HStack gap={3} vAlign="center">
            <StackItem size="fill" style={footerZone} />
            <Text type="supporting" color="secondary">
              {step + 1} dari {STEPS.length}
            </Text>
            <StackItem size="fill" style={footerZone}>
              <HStack gap={3} hAlign="end">
                <Button
                  label="Kembali"
                  variant="secondary"
                  isDisabled={step === 0 || busy}
                  onClick={() => goTo(step - 1)}
                />
                <Button
                  label={
                    step === 2
                      ? d.editing
                        ? "Simpan perubahan"
                        : "Simpan draft"
                      : "Lanjut"
                  }
                  variant="primary"
                  type="submit"
                  form="order-wizard"
                  isLoading={busy}
                  isDisabled={busy}
                />
              </HStack>
            </StackItem>
          </HStack>
        </LayoutFooter>
      }
    />
  );
}
