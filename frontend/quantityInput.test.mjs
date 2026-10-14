import test from "node:test";
import assert from "node:assert/strict";
import { MAX_QUANTITY, steppedQuantity } from "./quantityStep.ts";

test("quantity controls respect different order and physical-count lower bounds", () => {
  assert.equal(steppedQuantity("", 1, "1"), "1");
  assert.equal(steppedQuantity("", -1, "1"), null);
  assert.equal(steppedQuantity("1", -1, "1"), null);
  assert.equal(steppedQuantity("1", -1, "0"), "0");
  assert.equal(steppedQuantity("0", -1, "0"), null);
  assert.equal(steppedQuantity("0", 1, "1"), "1");
});
test("quantity controls preserve large integer precision and enforce server maximum", () => {
  assert.equal(steppedQuantity("9007199254740992", 1), "9007199254740993");
  assert.equal(steppedQuantity("9007199254740993", -1), "9007199254740992");
  assert.equal(steppedQuantity(MAX_QUANTITY, 1), null);
  assert.equal(steppedQuantity("9223372036854775806", 1), MAX_QUANTITY);
  assert.equal(steppedQuantity("10", 1, "0", "10"), null);
});
test("quantity controls leave invalid text available for validation instead of silently rounding", () => {
  for (const text of ["1.5", "1e3", "-2", "abc", "9".repeat(100)]) {
    assert.equal(steppedQuantity(text, 1), null);
    assert.equal(steppedQuantity(text, -1), null);
  }
});
