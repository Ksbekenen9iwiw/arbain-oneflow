import test from "node:test";
import assert from "node:assert/strict";
import { withReturn, backLabel, stockTabUrl } from "./navigation.ts";
test("prefilled wizard keeps customer and complete parent tab/filter context", () => {
  const back =
    "/customers/1/?tab=orders&return_to=%2Fcustomers%2F%3Fq%3DApotek";
  const params = new URLSearchParams(
    withReturn("/orders/new/?customer=1", back).split("?")[1],
  );
  assert.equal(params.get("customer"), "1");
  assert.equal(params.get("return_to"), back);
});
test("sample workspace has accurate back labels", () => {
  assert.equal(backLabel("/samples/"), "Sampel");
  assert.equal(backLabel("/samples/12/?return_to=%2Fsamples%2F"), "Detail pengajuan sampel");
});
test("stock tabs retain separate filter, sort and pagination contexts", () => {
  const products = "/stock/?status=inactive&filter=low&sort=-available";
  const history = new URL(
    stockTabUrl(products, "movements"),
    "http://localhost",
  );
  assert.equal(history.searchParams.get("status"), null);
  history.searchParams.set("sort", "-delta");
  history.searchParams.set("page", "2");
  history.searchParams.set("product", "8");
  const back = new URL(
    stockTabUrl(history.pathname + history.search, "products"),
    "http://localhost",
  );
  assert.equal(back.searchParams.get("status"), "inactive");
  assert.equal(back.searchParams.get("filter"), "low");
  assert.equal(back.searchParams.get("sort"), "-available");
  assert.equal(back.searchParams.get("page"), null);
  const again = new URL(
    stockTabUrl(back.pathname + back.search, "movements"),
    "http://localhost",
  );
  assert.equal(again.searchParams.get("sort"), "-delta");
  assert.equal(again.searchParams.get("page"), "2");
  assert.equal(again.searchParams.get("product"), "8");
});
