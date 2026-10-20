import test from "node:test";
import assert from "node:assert/strict";
import { sampleJourney, sampleStage } from "./sampleJourney.ts";
test("cancelled and rejected requests never suggest shipping, regardless of stored fulfillment state", () => {
  for (const status of ["CANCELLED", "REJECTED"]) {
    const result = sampleJourney({
      status,
      fulfillment_status: "WAITING",
      outcome: "NOT_FOLLOWED_UP",
    });
    assert.doesNotMatch(result.title, /siap disiapkan/);
  }
});
test("received samples call for followup while approved waiting samples call for preparation", () => {
  assert.match(
    sampleJourney({
      status: "APPROVED",
      fulfillment_status: "WAITING",
      outcome: "NOT_FOLLOWED_UP",
    }).title,
    /gudang/,
  );
  assert.match(
    sampleJourney({
      status: "APPROVED",
      fulfillment_status: "RECEIVED",
      outcome: "NOT_FOLLOWED_UP",
    }).title,
    /tindak lanjut/,
  );
});
test("warehouse completion points to sales instead of asking for an unavailable action", () => {
  const result = sampleJourney(
    {
      status: "APPROVED",
      fulfillment_status: "RECEIVED",
      outcome: "NOT_FOLLOWED_UP",
    },
    "WAREHOUSE",
  );
  assert.match(result.description, /Sales melanjutkan/);
  assert.doesNotMatch(result.description, /Catat tanggapan/);
});
test("completed evaluations distinguish a linked purchase from no interest", () => {
  assert.match(
    sampleJourney({
      status: "APPROVED",
      fulfillment_status: "RECEIVED",
      outcome: "PURCHASED",
    }).title,
    /pelanggan membeli/,
  );
  assert.match(
    sampleJourney({
      status: "APPROVED",
      fulfillment_status: "RECEIVED",
      outcome: "NOT_INTERESTED",
    }).title,
    /belum berminat/,
  );
  assert.doesNotMatch(
    sampleJourney(
      {
        status: "APPROVED",
        fulfillment_status: "RECEIVED",
        outcome: "PURCHASED",
      },
      "WAREHOUSE",
    ).title,
    /membeli/,
  );
});
test("a cancelled sample never shows a stale fulfillment or purchase stage", () => {
  const cancelled = sampleStage({
    status: "CANCELLED",
    fulfillment_status: "RECEIVED",
    outcome: "PURCHASED",
  });
  assert.equal(cancelled.value, "CANCELLED");
});
test("warehouse stage excludes commercial evaluation even when it is supplied", () => {
  const received = { status: "APPROVED", fulfillment_status: "RECEIVED" };
  assert.deepEqual(
    sampleStage({ ...received, outcome: "PURCHASED" }, "WAREHOUSE"),
    sampleStage({ ...received, outcome: "NO_RESPONSE" }, "WAREHOUSE"),
  );
  assert.notDeepEqual(
    sampleStage({ ...received, outcome: "PURCHASED" }, "SALES"),
    sampleStage({ ...received, outcome: "NO_RESPONSE" }, "SALES"),
  );
});
test("sample in transit does not use the completed success tone", () => {
  const stage = sampleStage({
    status: "APPROVED",
    fulfillment_status: "SHIPPED",
  });
  assert.notEqual(stage.value, "DONE");
  assert.notEqual(stage.value, "RECEIVED");
  assert.notEqual(stage.value, "SHIPPED");
});
