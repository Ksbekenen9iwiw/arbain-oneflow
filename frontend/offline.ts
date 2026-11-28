/**
 * Offline queue. A write that cannot reach the server is kept on the device
 * and sent again when the connection returns, each with its own key so the
 * server runs it once. The device never decides stock: the server does, in the
 * order writes arrive, and a write it refuses stays here as "Perlu diperiksa".
 */
export type QueueStatus = "waiting" | "syncing" | "synced" | "rejected";

export interface QueueItem {
  key: string;
  url: string;
  entries: [string, string | Blob][];
  label: string;
  userId: string;
  createdAt: string;
  /** Server time of the page the form was filled from. */
  basedOn: string;
  status: QueueStatus;
  message: string;
  resultUrl: string;
}

/** These need an answer from the server before anything else may happen. */
const ONLINE_ONLY = /^\/(orders\/\d+\/confirm|assistant|login|logout)\//;
export const canQueue = (url: string) => !ONLINE_ONLY.test(url.split("?")[0]);

export const newKey = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");

const STORE = "queue";
let database: Promise<IDBDatabase> | null = null;
const open = () =>
  (database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("oneflow-offline", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE, { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));

async function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = work(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());
export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export async function list(userId: string): Promise<QueueItem[]> {
  const items = await run<QueueItem[]>("readonly", (store) => store.getAll());
  return items
    .filter((item) => item.userId === userId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

const put = async (item: QueueItem) => {
  await run("readwrite", (store) => store.put(item));
  changed();
};

export async function remove(key: string) {
  await run("readwrite", (store) => store.delete(key));
  changed();
}

/** The server refused this write and kept that answer, so a new attempt needs a new key. */
export async function retry(item: QueueItem) {
  await run("readwrite", (store) => store.delete(item.key));
  await put({ ...item, key: newKey(), status: "waiting", message: "" });
}

export async function enqueue(
  item: Pick<QueueItem, "key" | "url" | "label" | "userId" | "basedOn">,
  data: FormData,
) {
  await put({
    ...item,
    entries: Array.from(data.entries()),
    createdAt: new Date().toISOString(),
    status: "waiting",
    message: "",
    resultUrl: "",
  });
  window.dispatchEvent(new Event("oneflow:queued"));
}

/** Reasons a page payload gives for refusing a write. */
function reasons(payload: any): string {
  if (typeof payload?.message === "string") return payload.message;
  const found: string[] = [];
  const data = payload?.data || {};
  if (data.error?.message) found.push(data.error.message);
  for (const value of Object.values<any>(data))
    if (value && Array.isArray(value.fields) && Array.isArray(value.errors)) {
      found.push(...value.errors);
      for (const field of value.fields)
        for (const text of field.errors || [])
          found.push(`${field.label || field.name}: ${text}`);
    }
  for (const message of payload?.messages || [])
    if (message.type === "error" || message.type === "warning")
      found.push(message.text);
  return (
    Array.from(new Set(found)).join(" ") ||
    "Ditolak server. Buka halamannya untuk memeriksa."
  );
}

export type SyncResult = { sent: number; needsLogin: boolean };
let running: Promise<SyncResult> | null = null;

/** Sends waiting writes oldest first. Stops at the first one that cannot reach the server. */
export function sync(userId: string): Promise<SyncResult> {
  return (running ??= send(userId).finally(() => (running = null)));
}

async function send(userId: string): Promise<SyncResult> {
  const result = { sent: 0, needsLogin: false };
  const waiting = (await list(userId)).some((item) => item.status === "waiting");
  if (!waiting || !navigator.onLine) return result;
  // The session may have ended, or been replaced, while the device was offline.
  let csrf = "";
  try {
    const token = await (
      await fetch("/sync/token/", { credentials: "same-origin" })
    ).json();
    if (token.user !== userId) return { sent: 0, needsLogin: true };
    csrf = token.csrf;
  } catch {
    return result;
  }
  for (const item of await list(userId)) {
    if (item.status !== "waiting") continue;
    if (!navigator.onLine) break;
    await put({ ...item, status: "syncing" });
    const body = new FormData();
    for (const [name, value] of item.entries)
      body.append(name, name === "csrfmiddlewaretoken" ? csrf : value);
    let response: Response;
    try {
      response = await fetch(item.url, {
        method: "POST",
        body,
        credentials: "same-origin",
        headers: {
          "X-OneFlow-Page": "1",
          "X-OneFlow-Key": item.key,
          "X-OneFlow-Queued": "1",
          "X-OneFlow-Based-On": item.basedOn,
        },
      });
    } catch {
      await put({ ...item, status: "waiting" });
      break;
    }
    if (!response.headers.get("content-type")?.includes("application/json")) {
      // Not an answer about this write (expired session, server fault): keep it.
      await put({ ...item, status: "waiting" });
      break;
    }
    const payload = await response.json();
    if (payload.oneflow_replay && payload.ok === null) {
      await put({ ...item, status: "waiting" });
      break;
    }
    if (payload.screen === "login") {
      result.needsLogin = true;
      await put({ ...item, status: "waiting" });
      break;
    }
    const ok = payload.oneflow_replay ? payload.ok === true : response.ok;
    const target = new URL(response.url);
    await put({
      ...item,
      status: ok ? "synced" : "rejected",
      message: ok ? "" : reasons(payload),
      resultUrl: payload.oneflow_replay
        ? payload.url || ""
        : ok
          ? target.pathname + target.search
          : "",
    });
    if (ok) result.sent += 1;
  }
  return result;
}

/** Forget writes that reached the server more than a day ago. */
export async function prune(userId: string) {
  const limit = Date.now() - 24 * 60 * 60 * 1000;
  for (const item of await list(userId))
    if (item.status === "synced" && Date.parse(item.createdAt) < limit)
      await remove(item.key);
}

export function registerServiceWorker() {
  if ("serviceWorker" in navigator && window.isSecureContext)
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
}

export const clearSavedPages = () =>
  navigator.serviceWorker?.controller?.postMessage("clear-pages");

/** Fetch pages in the background so they open without a connection later. */
export async function warm(urls: string[]) {
  if (!navigator.onLine || !navigator.serviceWorker?.controller) return;
  for (const url of Array.from(new Set(urls)).slice(0, 40)) {
    if (!navigator.onLine) return;
    await fetch(url, {
      credentials: "same-origin",
      headers: { "X-OneFlow-Page": "1" },
    }).catch(() => {});
  }
}
