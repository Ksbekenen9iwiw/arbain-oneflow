import test from "node:test";
import assert from "node:assert/strict";
import { requestIssue } from "./requestState.ts";

test("read recovery preserves filters, return context and history replacement", () => {
  const url = "/orders/?status=CONFIRMED&return_to=%2F%3Fview%3Dshipping";
  assert.deepEqual(requestIssue(url, false, true).retry, {
    url,
    replace: true,
  });
});

test("an uncertain write must never offer a replay action", () => {
  for (const url of ["/orders/new/", "/samples/2/ship/", "/stock/receive/"]) {
    const issue = requestIssue(url, true);
    assert.equal(issue.retry, null);
    assert.match(issue.description, /sebelum mengirim ulang/);
  }
});

test("login failures give sign-in recovery, not transaction instructions", () => {
  const issue = requestIssue("/login/?next=%2Forders%2F", true);
  assert.equal(issue.retry, null);
  assert.match(issue.description, /coba masuk kembali/);
  assert.doesNotMatch(issue.description, /riwayat|dua kali/);
});
