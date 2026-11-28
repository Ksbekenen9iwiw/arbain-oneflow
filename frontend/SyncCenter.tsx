import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, ModalBody, ModalHeader } from "@/components/base/modal/modal";
import { IconRefresh } from "@/icons";
import { Banner, Button, Icon, Token, useToast } from "@/kit";
import { cx } from "@/utils/cx";
import {
  clearSavedPages,
  list,
  prune,
  registerServiceWorker,
  remove,
  retry,
  subscribe,
  sync,
  warm,
  type QueueItem,
} from "./offline";
import { useApp } from "./router";
import { dateLabel } from "./ui";

const STATUS: Record<QueueItem["status"], { label: string; color: string }> = {
  waiting: { label: "Menunggu koneksi", color: "orange" },
  syncing: { label: "Menyinkronkan", color: "blue" },
  synced: { label: "Tersinkron", color: "green" },
  rejected: { label: "Perlu diperiksa", color: "red" },
};
/** What the person typed, so a refused note can be read and entered again. */
const filled = (item: QueueItem) =>
  item.entries
    .filter(
      ([name, value]) =>
        typeof value === "string" &&
        /\s/.test(value.trim()) &&
        name !== "csrfmiddlewaretoken",
    )
    .map(([, value]) => (value as string).trim())
    .join(" · ");
const STALE_MS = 24 * 60 * 60 * 1000;

export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

/** Queue state for the signed-in user, and the loop that sends it. */
export function useSync() {
  const { page, navigate } = useApp();
  const userId = page.user?.id || "";
  const online = useOnline();
  const toast = useToast();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [needsLogin, setNeedsLogin] = useState(false);

  const refresh = useCallback(() => {
    if (userId) void list(userId).then(setItems, () => setItems([]));
    else setItems([]);
  }, [userId]);
  useEffect(() => {
    refresh();
    return subscribe(refresh);
  }, [refresh]);

  const send = useCallback(async () => {
    if (!userId || !navigator.onLine) return;
    const result = await sync(userId);
    setNeedsLogin(result.needsLogin);
    if (result.sent)
      toast({
        body: `${result.sent} catatan dari perangkat ini sudah tersinkron.`,
        status: "success",
      });
  }, [userId, toast]);

  useEffect(() => {
    registerServiceWorker();
  }, []);
  // A different person on this device must not open the previous one's pages.
  useEffect(() => {
    const previous = localStorage.getItem("oneflow:offline-user");
    if (previous !== userId) {
      if (previous) clearSavedPages();
      localStorage.setItem("oneflow:offline-user", userId);
    }
    if (userId) void prune(userId);
  }, [userId]);
  useEffect(() => {
    if (!online) return;
    void send();
    const timer = window.setInterval(send, 30_000);
    window.addEventListener("oneflow:queued", send);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("oneflow:queued", send);
    };
  }, [online, send]);

  // Keep the day's work on the device: the screens of this role and the
  // records linked from the page in view.
  const warmed = useRef("");
  useEffect(() => {
    if (!userId || !online || warmed.current === page.url) return;
    warmed.current = page.url;
    const timer = window.setTimeout(() => {
      const base =
        page.role === "WAREHOUSE"
          ? ["/", "/orders/", "/stock/", "/samples/"]
          : ["/", "/customers/", "/orders/", "/samples/", "/stock/", "/orders/new/"];
      if (page.role === "MANAGER") base.push("/attention/");
      const linked = Array.from(
        document.querySelectorAll<HTMLAnchorElement>("main a[href^='/']"),
        (a) => a.getAttribute("href") || "",
      ).filter((href) => /^\/(customers|orders|products|samples)\/\d+\//.test(href));
      void warm([...base, ...linked]);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [userId, online, page.url, page.role]);

  const waiting = items.filter((i) => i.status === "waiting" || i.status === "syncing");
  const rejected = items.filter((i) => i.status === "rejected");
  return { items, waiting, rejected, online, needsLogin, send, navigate };
}

export type SyncState = ReturnType<typeof useSync>;

export function syncSummary(state: SyncState) {
  if (!state.online)
    return {
      label: state.waiting.length
        ? `Offline · ${state.waiting.length} menunggu`
        : "Offline",
      tone: "text-status-orange-text",
    };
  if (state.rejected.length)
    return { label: `${state.rejected.length} perlu diperiksa`, tone: "text-status-rose-text" };
  if (state.waiting.length)
    return { label: `Menyinkronkan ${state.waiting.length}`, tone: "text-status-blue-text" };
  return { label: "Tersinkron", tone: "text-status-lime-text" };
}

export function SyncDot({ state, className }: { state: SyncState; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "size-2 shrink-0 rounded-full bg-current",
        syncSummary(state).tone,
        state.online && state.waiting.length > 0 && "animate-pulse",
        className,
      )}
    />
  );
}

export function SyncPanel({
  state,
  isOpen,
  onOpenChange,
}: {
  state: SyncState;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { items, online, needsLogin, send, navigate } = state;
  const stale = items.some(
    (item) =>
      item.status === "waiting" && Date.now() - Date.parse(item.createdAt) > STALE_MS,
  );
  const open = (url: string) => {
    onOpenChange(false);
    void navigate(url);
  };
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="md">
      <ModalHeader
        title="Antrean sinkron"
        description={
          online
            ? "Catatan yang dibuat tanpa koneksi dikirim otomatis, berurutan."
            : "Tidak ada koneksi. Catatan tersimpan di perangkat ini dan dikirim saat tersambung."
        }
        closeLabel="Tutup"
      />
      <ModalBody className="flex flex-col gap-3 pb-5">
        {needsLogin && (
          <Banner
            status="warning"
            title="Sesi sudah habis"
            description="Masuk kembali agar catatan yang menunggu bisa terkirim."
            endContent={<Button label="Masuk" size="sm" href="/login/?next=/" />}
          />
        )}
        {stale && (
          <Banner
            status="warning"
            title="Ada catatan yang belum terkirim lebih dari sehari"
            description="Catatan hanya ada di perangkat ini. Sambungkan ke internet sebelum menghapus data browser."
          />
        )}
        {items.length === 0 ? (
          <p className="py-6 text-center text-body-regular text-text-secondary">
            Tidak ada catatan yang menunggu. Semua sudah tersimpan di server.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {[...items].reverse().map((item) => (
              <li
                key={item.key}
                className="oneflow-enter flex flex-col gap-2 rounded-2xl border border-separator-border bg-background-secondary-default p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-body-medium text-text-primary">
                      {item.label}
                    </p>
                    <p className="text-caption-regular text-text-tertiary">
                      Dibuat {dateLabel(item.createdAt, true)}
                    </p>
                  </div>
                  <Token
                    label={STATUS[item.status].label}
                    color={STATUS[item.status].color}
                  />
                </div>
                {item.status === "rejected" && (
                  <p className="text-body-regular text-text-primary">{item.message}</p>
                )}
                {item.status !== "synced" && filled(item) && (
                  <p className="line-clamp-3 text-caption-regular text-text-secondary">
                    Isian: {filled(item)}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {item.status === "rejected" && (
                    <>
                      <Button
                        label="Buka halamannya"
                        size="sm"
                        variant="primary"
                        onClick={() => open(item.url)}
                      />
                      <Button
                        label="Kirim ulang"
                        size="sm"
                        onClick={() => void retry(item).then(send)}
                      />
                    </>
                  )}
                  {item.status === "synced" && item.resultUrl && (
                    <Button label="Lihat" size="sm" onClick={() => open(item.resultUrl)} />
                  )}
                  {item.status !== "syncing" && (
                    <Button
                      label={item.status === "synced" ? "Hapus dari daftar" : "Batalkan"}
                      size="sm"
                      variant="ghost"
                      onClick={() => void remove(item.key)}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {online && state.waiting.length > 0 && (
          <Button
            label="Kirim sekarang"
            icon={<Icon icon={IconRefresh} />}
            onClick={() => void send()}
          />
        )}
      </ModalBody>
    </Modal>
  );
}
