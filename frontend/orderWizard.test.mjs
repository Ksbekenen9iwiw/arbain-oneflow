import test from "node:test";
import assert from "node:assert/strict";
import {
  initialLines,
  initialStep,
  orderPayload,
  orderTotal,
  validQuantity,
  validateOrder,
} from "./orderWizard.ts";
const product = {
  id: "7",
  name: "Produk",
  sku: "SKU",
  price: "9007199254740993",
  available: "0",
  unit: "unit",
};
const line = {
  id: "0",
  product: "7",
  quantity: "2",
  deleted: false,
  errors: {},
};
const field = (name, value, errors = []) => ({
  name,
  key: name.split("-").at(-1),
  value,
  errors,
});
const data = {
  form: { fields: [field("customer", "3")], errors: [] },
  formset: {
    forms: [
      {
        fields: [field("lines-0-product", "7"), field("lines-0-quantity", "2")],
        errors: [],
      },
    ],
    errors: [],
    management: {
      fields: [
        field("lines-INITIAL_FORMS", "1"),
        field("lines-MIN_NUM_FORMS", "1"),
        field("lines-MAX_NUM_FORMS", "50"),
      ],
      errors: [],
    },
  },
  catalog: [product],
  suggested: true,
};
test("review and payload retain large integers exactly across unmounted steps", () => {
  assert.equal(orderTotal([line], [product]), 18014398509481986n);
  const payload = orderPayload("csrf", "3", [line], data.formset.management);
  assert.equal(payload.get("customer"), "3");
  assert.equal(payload.get("lines-0-quantity"), "2");
  assert.equal(payload.get("lines-INITIAL_FORMS"), "1");
  assert.equal(payload.get("lines-TOTAL_FORMS"), "1");
  assert.equal(payload.get("csrfmiddlewaretoken"), "csrf");
  assert.equal(payload.get("price"), null);
});
test("deleted lines retain indices but cannot affect total or duplicate checks", () => {
  const removed = { ...line, deleted: true };
  const replacement = { ...line, id: "1", quantity: "3" };
  assert.deepEqual(
    validateOrder("3", [{ value: "3" }], [removed, replacement], [product]),
    [{}, {}],
  );
  assert.equal(
    orderTotal([removed, replacement], [product]),
    27021597764222979n,
  );
  const payload = orderPayload(
    "csrf",
    "3",
    [removed, replacement],
    data.formset.management,
  );
  assert.equal(payload.get("lines-0-DELETE"), "on");
  assert.equal(payload.get("lines-1-product"), "7");
  assert.equal(payload.get("lines-TOTAL_FORMS"), "2");
});
test("forward validation rejects missing, duplicate, fractional and overflowing quantities", () => {
  assert.ok(validateOrder("", [], [line], [product])[0].customer);
  assert.ok(
    validateOrder(
      "3",
      [{ value: "3" }],
      [line, { ...line, id: "1" }],
      [product],
    )[1]["product-1"],
  );
  assert.ok(
    validateOrder(
      "3",
      [{ value: "3" }],
      [{ ...line, product: "missing" }],
      [product],
    )[1]["product-0"],
  );
  for (const value of [
    "",
    "0",
    "-1",
    "1.5",
    "1e3",
    "NaN",
    "9223372036854775808",
  ])
    assert.equal(validQuantity(value), false, value);
  assert.equal(validQuantity("9223372036854775807"), true);
  assert.ok(
    validateOrder(
      "3",
      [{ value: "3" }],
      [{ ...line, quantity: "2000" }],
      [product],
    )[1].total,
  );
});
test("insufficient stock is allowed for a draft", () => {
  assert.deepEqual(validateOrder("3", [{ value: "3" }], [line], [product]), [
    {},
    {},
  ]);
});
test("server rejection restores the relevant panel and preserves posted values", () => {
  const rejected = structuredClone(data);
  rejected.formset.forms[0].fields[1] = field("lines-0-quantity", "-2", [
    "Minimal 1",
  ]);
  assert.equal(initialStep(rejected), 1);
  assert.equal(initialLines(rejected)[0].quantity, "-2");
  assert.equal(initialLines(rejected)[0].errors.quantity, "Minimal 1");
  rejected.form.fields[0].errors = ["Pelanggan tidak tersedia"];
  assert.equal(initialStep(rejected), 0);
  const business = structuredClone(data);
  business.form.errors = ["Penanggung jawab pelanggan harus sales aktif."];
  assert.equal(initialStep(business), 2);
});
