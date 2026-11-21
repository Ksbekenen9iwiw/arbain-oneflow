import test from "node:test";
import assert from "node:assert/strict";
import {
  activityMatches,
  dashboardQueue,
  salesGreeting,
} from "../dashboard.ts";

test("work queue includes overdue and today; excludes future and undated until requested", () => {
  const dates = ["2026-10-13", "2026-10-14", "2026-10-15", null];
  const select = (mode) =>
    dates.filter((d) => activityMatches(d, mode, "2026-10-14"));
  assert.deepEqual(select("priority"), dates.slice(0, 2));
  assert.deepEqual(select("late"), dates.slice(0, 1));
  assert.deepEqual(select("today"), dates.slice(1, 2));
  assert.deepEqual(select("future"), dates.slice(2));
  assert.deepEqual(select("all"), dates);
});
test("warehouse keeps shipping as fallback and allows sample fulfillment", () => {
  for (const query of [
    "activities",
    "recommendations",
    "shipping",
    "bogus",
    "",
  ]) {
    assert.equal(dashboardQueue("WAREHOUSE", query), "shipping");
  }
  assert.equal(dashboardQueue("WAREHOUSE", "samples"), "samples");
  for (const role of ["SALES", "MANAGER"]) {
    assert.equal(dashboardQueue(role, "samples"), "samples");
    assert.equal(dashboardQueue(role, "recommendations"), "recommendations");
    assert.equal(dashboardQueue(role, "shipping"), "shipping");
    assert.equal(dashboardQueue(role, "bogus"), "activities");
  }
});

test("sales greeting uses Jakarta local time and the signed-in name", () => {
  for (const [time, period] of [
    ["03:59", "pagi"],
    ["04:00", "siang"],
    ["08:00", "sore"],
    ["11:00", "malam"],
    ["17:00", "pagi"],
  ]) {
    assert.equal(
      salesGreeting("Endri", new Date(`2026-11-21T${time}:00Z`)),
      `Selamat ${period}, Endri`,
    );
  }
});
