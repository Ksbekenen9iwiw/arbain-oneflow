import type { FormSpec } from "./types";

export type Product = {
  id: string;
  name: string;
  sku: string;
  price: string;
  available: string;
  unit: string;
};
export type OrderLine = {
  id: string;
  product: string;
  quantity: string;
  deleted: boolean;
  errors: Record<string, string>;
};
export type WizardData = {
  form: FormSpec;
  formset: { forms: FormSpec[]; management: FormSpec; errors: string[] };
  catalog: Product[];
  suggested: boolean;
  editing?: string;
  draft_version?: string;
  back_url?: string;
  customer_details?: {
    id: string;
    phone: string;
    address: string;
    owner: { name: string };
  }[];
};
export const MAX_INTEGER = 9223372036854775807n;
export function validQuantity(value: string) {
  return (
    /^\d{1,19}$/.test(value) &&
    BigInt(value) > 0n &&
    BigInt(value) <= MAX_INTEGER
  );
}
export function initialLines(data: WizardData): OrderLine[] {
  return data.formset.forms.map((form, index) => ({
    id: String(index),
    product: String(form.fields.find((f) => f.key === "product")?.value || ""),
    quantity: String(
      form.fields.find((f) => f.key === "quantity")?.value || "",
    ),
    deleted: !!form.fields.find((f) => f.key === "DELETE")?.value,
    errors: Object.fromEntries(
      form.fields
        .filter((f) => f.errors.length)
        .map((f) => [f.key, f.errors.join(" ")]),
    ),
  }));
}
export function initialStep(data: WizardData) {
  if (data.form.fields.some((f) => f.errors.length)) return 0;
  if (
    data.formset.errors.length ||
    data.formset.forms.some(
      (f) => f.errors.length || f.fields.some((v) => v.errors.length),
    )
  )
    return 1;
  return data.form.errors.length ? 2 : 0;
}
export function orderTotal(lines: OrderLine[], catalog: Product[]) {
  return lines
    .filter((l) => !l.deleted)
    .reduce((sum, line) => {
      const product = catalog.find((p) => p.id === line.product);
      return (
        sum +
        (product && validQuantity(line.quantity)
          ? BigInt(product.price) * BigInt(line.quantity)
          : 0n)
      );
    }, 0n);
}
export function validateOrder(
  customer: string,
  choices: { value: string }[],
  lines: OrderLine[],
  catalog: Product[],
) {
  const errors: [Record<string, string>, Record<string, string>] = [{}, {}];
  if (!customer || !choices.some((c) => c.value === customer))
    errors[0].customer = "Pilih pelanggan untuk pesanan ini.";
  const active = lines.filter((l) => !l.deleted),
    used = new Set<string>();
  if (!active.length) errors[1].lines = "Tambahkan setidaknya satu produk.";
  if (active.length > 50)
    errors[1].lines = "Maksimal 50 produk dalam satu pesanan.";
  active.forEach((line) => {
    if (!catalog.some((p) => p.id === line.product))
      errors[1][`product-${line.id}`] =
        "Pilih produk yang tersedia di katalog.";
    else if (used.has(line.product))
      errors[1][`product-${line.id}`] =
        "Produk sudah dipilih. Gabungkan jumlahnya ke baris sebelumnya.";
    used.add(line.product);
    if (!validQuantity(line.quantity))
      errors[1][`quantity-${line.id}`] =
        /^\d+$/.test(line.quantity) && BigInt(line.quantity) > MAX_INTEGER
          ? "Jumlah melebihi batas sistem."
          : "Masukkan jumlah bulat minimal 1.";
  });
  if (orderTotal(lines, catalog) > MAX_INTEGER)
    errors[1].total =
      "Nilai pesanan melebihi batas sistem. Kurangi jumlah produk.";
  return errors;
}
// Build from state: fields in earlier panels are deliberately unmounted.
// Keep Django's indices and deletion markers, including recommendation initials.
export function orderPayload(
  csrf: string,
  customer: string,
  lines: OrderLine[],
  management: FormSpec,
) {
  const data = new FormData();
  data.set("csrfmiddlewaretoken", csrf);
  data.set("customer", customer);
  management.fields.forEach((f) => data.set(f.name, String(f.value)));
  data.set("lines-TOTAL_FORMS", String(lines.length));
  lines.forEach((line, i) => {
    data.set(`lines-${i}-product`, line.product);
    data.set(`lines-${i}-quantity`, line.quantity);
    if (line.deleted) data.set(`lines-${i}-DELETE`, "on");
  });
  return data;
}
