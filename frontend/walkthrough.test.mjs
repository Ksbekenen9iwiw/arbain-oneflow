import test from "node:test";
import assert from "node:assert/strict";
import { tourSteps, stepCompleted, placeHint } from "./tourSteps.ts";
test("warehouse walkthrough never routes into CRM; manager and sales keep customer journey", () => {
  const warehouse = tourSteps("WAREHOUSE");
  assert.equal(warehouse[0].destination, "orders");
  assert.ok(
    warehouse.every((step) => !step.destination.startsWith("customer")),
  );
  for (const role of ["SALES", "MANAGER"]) {
    const steps = tourSteps(role);
    assert.equal(steps[0].destination, "customers");
    assert.equal(steps.at(-1).destination, "today");
    const empty = steps.findIndex((step) => step.id === "customer");
    assert.equal(steps[empty + steps[empty].skip].id, "orders");
  }
});
test("only a target action followed by successful navigation can complete a route step", () => {
  const step = tourSteps("SALES")[0];
  assert.equal(
    stepCompleted(step, { screen: "customers", url: "/customers/" }, 4, null),
    false,
  );
  assert.equal(
    stepCompleted(step, { screen: "customers", url: "/customers/" }, 4, 4),
    false,
  );
  assert.equal(
    stepCompleted(step, { screen: "error", url: "/customers/" }, 5, 4),
    false,
  );
  assert.equal(
    stepCompleted(step, { screen: "customers", url: "/customers/" }, 5, 4),
    true,
  );
});
test("customer tab requires the requested selected tab, not just any click", () => {
  const step = tourSteps("SALES").find((step) => step.id === "customer-orders");
  assert.equal(
    stepCompleted(
      step,
      { screen: "customer_detail", url: "/customers/1/" },
      4,
      4,
    ),
    false,
  );
  assert.equal(
    stepCompleted(
      step,
      { screen: "customer_detail", url: "/customers/1/?tab=orders" },
      4,
      4,
    ),
    true,
  );
});
test("coachmark stays adjacent and inside the viewport near each edge", () => {
  const viewport = { width: 1440, height: 900 };
  assert.deepEqual(
    placeHint(
      { left: 8, right: 252, top: 140, bottom: 180 },
      352,
      240,
      viewport,
      12,
    ),
    { left: 264, top: 140 },
  );
  for (const target of [
    { left: 1300, right: 1420, top: 800, bottom: 850 },
    { left: 400, right: 1200, top: 800, bottom: 850 },
    { left: 8, right: 1400, top: 5, bottom: 45 },
  ]) {
    const pos = placeHint(target, 352, 240, viewport, 12);
    assert.ok(pos.left >= 12 && pos.left + 352 <= 1428);
    assert.ok(pos.top >= 12 && pos.top + 240 <= 888);
    assert.ok(
      pos.left + 352 <= target.left ||
        pos.left >= target.right ||
        pos.top + 240 <= target.top ||
        pos.top >= target.bottom,
    );
  }
});

test("detail navigation is followed by an overview that never auto-completes", () => {
  for (const role of ["SALES", "MANAGER", "WAREHOUSE"]) {
    const steps = tourSteps(role);
    for (const id of [
      "order",
      "product",
      ...(role === "WAREHOUSE" ? [] : ["customer", "customer-orders"]),
    ]) {
      const index = steps.findIndex((step) => step.id === id);
      const overview = steps[index + 1];
      assert.equal(overview.mode, "overview");
      assert.equal(overview.destination, steps[index].destination);
      assert.equal(
        stepCompleted(
          overview,
          { screen: overview.destination, url: "/?tab=orders" },
          10,
          9,
        ),
        false,
      );
      assert.equal(
        stepCompleted(
          overview,
          { screen: overview.destination, url: "/" },
          10,
          null,
        ),
        false,
      );
    }
    for (const [record, next] of [
      ["order", "samples"],
      ["product", "dashboard"],
    ]) {
      const index = steps.findIndex((step) => step.id === record);
      assert.equal(steps[index + steps[index].skip].id, next);
    }
  }
});
