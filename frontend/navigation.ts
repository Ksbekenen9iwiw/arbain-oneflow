export function withReturn(path: string, back: string) {
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set("return_to", back);
  return pathname + "?" + params;
}
export function backLabel(path: string) {
  const pathname = path.split("?")[0];
  if (pathname === "/") return "Dashboard";
  if (pathname.startsWith("/customers/"))
    return pathname === "/customers/" ? "Pelanggan" : "Detail pelanggan";
  if (pathname.startsWith("/products/")) return "Detail produk";
  if (pathname.startsWith("/orders/"))
    return pathname === "/orders/" ? "Pesanan" : "Detail pesanan";
  return "Produk & stok";
}

// Keep each stock tab's filters separate, including its own sort and page.
export function stockTabUrl(url: string, tab: string) {
  const params = new URLSearchParams(url.split("?")[1]);
  const current = params.get("tab") === "movements" ? "movements" : "products";
  const keys = [
    "q",
    "status",
    "filter",
    "sort",
    "product",
    "kind",
    "from",
    "to",
    "page",
  ];
  for (const key of keys) {
    const value = params.get(key);
    if (value) params.set(`${current}_${key}`, value);
    else params.delete(`${current}_${key}`);
    const next = params.get(`${tab}_${key}`);
    if (next) params.set(key, next);
    else params.delete(key);
  }
  if (tab === "movements") params.set("tab", tab);
  else params.delete("tab");
  return "/stock/" + (params.size ? "?" + params : "");
}
