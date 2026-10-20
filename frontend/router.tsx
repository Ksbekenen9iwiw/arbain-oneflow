import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  type ReactNode,
} from "react";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import type { Page } from "./types";
type AppContext = {
  page: Page;
  busy: boolean;
  error: string;
  revision: number;
  updateQuery: (values: Record<string, string>) => void;
  markDirty: () => void;
  clearDirty: () => void;
  leaveAndSubmit: (url: string, data: FormData) => Promise<void>;
  navigate: (url: string, replace?: boolean) => Promise<void>;
  submit: (url: string, data: FormData) => Promise<void>;
};
const Context = createContext<AppContext>(null!);
export const useApp = () => useContext(Context);
export function Router({
  initial,
  children,
}: {
  initial: Page;
  children: ReactNode;
}) {
  const [page, setPage] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const dirty = useRef(false);
  const currentPage = useRef(initial);
  const listScroll = useRef(new Map<string, number[]>());
  const restoreScroll = useRef<number[]>([]);
  useLayoutEffect(() => {
    document.querySelectorAll("[data-oneflow-scroll]").forEach((el, index) => {
      el.scrollTop = restoreScroll.current[index] || 0;
    });
  }, [revision]);
  const [pending, setPending] = useState<{
    url: string;
    replace: boolean;
    data?: FormData;
  } | null>(null);
  const historyIndex = useRef(0);
  const ignoringPop = useRef(false);
  const markDirty = useCallback(() => {
    dirty.current = true;
  }, []);
  const clearDirty = useCallback(() => {
    dirty.current = false;
  }, []);
  const sequence = useRef(0),
    posting = useRef(false),
    controller = useRef<AbortController | null>(null);
  const load = useCallback(
    async (url: string, data?: FormData, replace = false) => {
      if (posting.current) return;
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      const id = ++sequence.current;
      posting.current = !!data;
      const previous = currentPage.current;
      if (previous.screen !== "login")
        listScroll.current.set(
          previous.url,
          Array.from(
            document.querySelectorAll("[data-oneflow-scroll]"),
            (el) => el.scrollTop,
          ),
        );
      setBusy(true);
      setError("");
      try {
        const response = await fetch(url, {
          method: data ? "POST" : "GET",
          body: data,
          credentials: "same-origin",
          headers: { "X-OneFlow-Page": "1" },
          signal: abort.signal,
        });
        if (
          !response.headers.get("content-type")?.includes("application/json")
        ) {
          if (!data) {
            window.location.assign(response.url);
            return;
          }
          throw new Error(
            "Respons server tidak dapat dibaca. Periksa halaman sebelum mengirim ulang.",
          );
        }
        const next: Page = await response.json();
        if (id !== sequence.current) return;
        next.url =
          new URL(response.url).pathname + new URL(response.url).search;
        if (next.screen === "order_detail" && next.data.detail_url)
          next.url = next.data.detail_url;
        if (next.data.canonical_url) next.url = next.data.canonical_url;
        dirty.current =
          !response.ok &&
          !!data &&
          ["form", "order_form", "product_edit", "login", "today"].includes(
            next.screen,
          );
        restoreScroll.current =
          next.screen !== "login" ? listScroll.current.get(next.url) || [] : [];
        if (next.screen === "login") listScroll.current.clear();
        currentPage.current = next;
        setPage(next);
        setRevision((v) => v + 1);
        const target = next.url;
        if (replace)
          history.replaceState(
            { oneflowIndex: historyIndex.current },
            "",
            target,
          );
        else if (location.pathname + location.search !== target) {
          historyIndex.current += 1;
          history.pushState({ oneflowIndex: historyIndex.current }, "", target);
        }
        requestAnimationFrame(() => {
          const invalid =
            !response.ok && data
              ? document.querySelector(
                  '[aria-invalid="true"], [data-form-errors]',
                )
              : null;
          if (invalid instanceof HTMLElement) {
            invalid.focus();
            invalid.scrollIntoView({ block: "center" });
            return;
          }
          const heading = document.querySelector("h1");
          if (heading instanceof HTMLElement) {
            heading.tabIndex = -1;
            heading.focus({ preventScroll: true });
          }
        });
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError"))
          setError(
            data
              ? "Koneksi terputus. Periksa apakah perubahan sudah tersimpan sebelum mengirim ulang."
              : "Halaman gagal dimuat. Periksa koneksi lalu coba lagi.",
          );
      } finally {
        if (id === sequence.current) {
          posting.current = false;
          setBusy(false);
        }
      }
    },
    [],
  );
  const updateQuery = useCallback((values: Record<string, string>) => {
    const current = currentPage.current;
    const [path, query = ""] = current.url.split("?");
    const params = new URLSearchParams(query);
    for (const [key, value] of Object.entries(values))
      value ? params.set(key, value) : params.delete(key);
    const next = { ...current, url: path + (params.size ? "?" + params : "") };
    currentPage.current = next;
    setPage(next);
    history.replaceState({ oneflowIndex: historyIndex.current }, "", next.url);
  }, []);
  const navigate = useCallback(
    async (url: string, replace = false) => {
      if (posting.current) return;
      if (dirty.current) {
        setPending({ url, replace });
        return;
      }
      await load(url, undefined, replace);
    },
    [load],
  );
  const submit = useCallback(
    (url: string, data: FormData) => load(url, data),
    [load],
  );
  const leaveAndSubmit = useCallback(
    async (url: string, data: FormData) => {
      if (posting.current) return;
      if (dirty.current) {
        setPending({ url, replace: false, data });
        return;
      }
      await load(url, data);
    },
    [load],
  );
  useEffect(() => {
    history.replaceState(
      { oneflowIndex: historyIndex.current },
      "",
      location.href,
    );
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current || posting.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const pop = (e: PopStateEvent) => {
      if (ignoringPop.current) {
        ignoringPop.current = false;
        return;
      }
      const targetIndex = e.state?.oneflowIndex ?? 0;
      const url = location.pathname + location.search;
      if (dirty.current || posting.current) {
        const delta = historyIndex.current - targetIndex;
        if (delta) {
          ignoringPop.current = true;
          history.go(delta);
        }
        if (!posting.current) setPending({ url, replace: false });
        return;
      }
      historyIndex.current = targetIndex;
      void navigate(url, true);
    };
    const click = (e: MouseEvent) => {
      const anchor = (e.target as Element)?.closest("a");
      if (
        !anchor ||
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey ||
        anchor.target ||
        anchor.hasAttribute("download")
      )
        return;
      const url = new URL(anchor.href);
      if (
        url.origin !== location.origin ||
        url.hash ||
        !url.pathname.startsWith("/")
      )
        return;
      e.preventDefault();
      void navigate(url.pathname + url.search);
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", pop);
    document.addEventListener("click", click);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("popstate", pop);
      document.removeEventListener("click", click);
    };
  }, [navigate]);
  useEffect(() => {
    document.title =
      (page.data.heading ||
        (
          {
            today: "Dashboard",
            customers: "Pelanggan",
            orders: "Pesanan",
            samples: "Pengajuan sampel",
            sample_detail: page.data.sample?.number,
            sample_form: page.data.editing
              ? `Edit ${page.data.editing}`
              : "Buat pengajuan sampel",
            sample_policy: "Kebijakan sampel",
            stock: "Produk & stok",
            product_detail: page.data.product?.name,
            order_detail: page.data.order?.number,
            customer_detail: page.data.customer?.name,
            order_form: page.data.editing
              ? `Edit ${page.data.editing}`
              : "Buat pesanan",
            login: "Masuk",
            product_edit: "Edit produk",
          } as Record<string, string>
        )[page.screen] ||
        "Workspace") + " · OneFlow";
  }, [page]);
  return (
    <Context
      value={{
        page,
        busy,
        error,
        revision,
        navigate,
        updateQuery,
        submit,
        markDirty,
        clearDirty,
        leaveAndSubmit,
      }}
    >
      {children}
      <Dialog
        isOpen={!!pending}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        purpose="required"
      >
        <DialogHeader title="Perubahan belum disimpan" />
        <VStack padding={6} gap={4}>
          <Text>
            Jika meninggalkan halaman, perubahan pada formulir ini akan hilang.
          </Text>
          <HStack gap={2} hAlign="end">
            <Button label="Lanjut mengisi" onClick={() => setPending(null)} />
            <Button
              label="Tinggalkan halaman"
              variant="destructive"
              onClick={() => {
                const next = pending;
                setPending(null);
                dirty.current = false;
                if (next) void load(next.url, next.data, next.replace);
              }}
            />
          </HStack>
        </VStack>
      </Dialog>
    </Context>
  );
}

export function useQueryState(
  key: string,
  fallback: string,
): [string, (value: string) => void] {
  const { page, updateQuery } = useApp();
  const value =
    new URLSearchParams(page.url.split("?")[1]).get(key) || fallback;
  return [
    value,
    (next) => updateQuery({ [key]: next === fallback ? "" : next }),
  ];
}
