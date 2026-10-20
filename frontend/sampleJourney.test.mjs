import test from "node:test";
import assert from "node:assert/strict";
import { sampleJourney } from "./sampleJourney.ts";
test("cancelled and rejected requests never suggest shipping, regardless of stored fulfillment state", () => {
  for (const status of ["CANCELLED", "REJECTED"]) {
    const result = sampleJourney({status, fulfillment_status:"WAITING", outcome:"NOT_FOLLOWED_UP"});
    assert.doesNotMatch(result.title, /siap disiapkan/);
  }
});
test("received samples call for followup while approved waiting samples call for preparation", () => {
  assert.match(sampleJourney({status:"APPROVED", fulfillment_status:"WAITING", outcome:"NOT_FOLLOWED_UP"}).title, /gudang/);
  assert.match(sampleJourney({status:"APPROVED", fulfillment_status:"RECEIVED", outcome:"NOT_FOLLOWED_UP"}).title, /tindak lanjut/);
});
test("warehouse completion points to sales instead of asking for an unavailable action", () => {
  const result = sampleJourney({status:"APPROVED", fulfillment_status:"RECEIVED", outcome:"NOT_FOLLOWED_UP"}, "WAREHOUSE");
  assert.match(result.description, /Sales melanjutkan/);
  assert.doesNotMatch(result.description, /Catat tanggapan/);
});
test("completed evaluations distinguish a linked purchase from no interest", () => {
  assert.match(sampleJourney({status:"APPROVED", fulfillment_status:"RECEIVED", outcome:"PURCHASED"}).title, /pelanggan membeli/);
  assert.match(sampleJourney({status:"APPROVED", fulfillment_status:"RECEIVED", outcome:"NOT_INTERESTED"}).title, /belum berminat/);
  assert.doesNotMatch(sampleJourney({status:"APPROVED", fulfillment_status:"RECEIVED", outcome:"PURCHASED"}, "WAREHOUSE").title, /membeli/);
});
