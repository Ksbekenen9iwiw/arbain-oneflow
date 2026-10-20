import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Card } from "@astryxdesign/core/Card";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Icon } from "@astryxdesign/core/Icon";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { VStack, HStack, Text, Heading, Button } from "./ui";
import { useApp } from "./router";
import { playMotion } from "./motion";
import { tourSteps, stepCompleted, placeHint } from "./tourSteps";

const seenThisSession = new Set<string>();
const readScreens = new Set([
  "today",
  "customers",
  "customer_detail",
  "samples",
  "sample_detail",
  "orders",
  "order_detail",
  "stock",
  "product_detail",
]);
export function canStartTour(screen: string) {
  return readScreens.has(screen);
}

type Box = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};
export default function Walkthrough({ request }: { request: number }) {
  const { page, revision, busy, error, navigate } = useApp();
  const key = `oneflow:walkthrough:v1:${page.user?.id}:${page.role}`;
  const [phase, setPhase] = useState<"closed" | "welcome" | "tour" | "done">(
    "closed",
  );
  const [index, setIndex] = useState(0);
  const stepLocation = useRef<{
    index: number;
    url: string;
    screen: string;
  } | null>(null);
  const visits = useRef<{ index: number; url: string; screen: string }[]>([]);
  const [returning, setReturning] = useState<{
    index: number;
    url: string;
    screen: string;
  } | null>(null);
  const [armedAt, setArmedAt] = useState<number | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [missing, setMissing] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const card = useRef<HTMLDivElement>(null);
  const previousPosition = useRef<{ left: number; top: number } | null>(null);
  const previousRequest = useRef(0);
  const targetRef = useRef<HTMLElement | null>(null);
  const steps = tourSteps(page.role);
  const step = steps[index];
  const active = phase !== "closed";
  const overview = phase === "tour" && step.mode === "overview";
  const markSeen = () => {
    seenThisSession.add(key);
    try {
      localStorage.setItem(key, "seen");
    } catch {
      /* Storage may be unavailable. */
    }
  };
  const close = () => {
    markSeen();
    setPhase("closed");
    setReturning(null);
    setArmedAt(null);
    previousPosition.current = null;
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('[data-tour="help"]')?.focus(),
    );
  };
  useEffect(() => {
    if (page.screen !== "today" || seenThisSession.has(key)) return;
    try {
      if (localStorage.getItem(key)) return;
    } catch {
      /* Session fallback. */
    }
    seenThisSession.add(key);
    setPhase("welcome");
  }, [key, page.screen]);
  useEffect(() => {
    if (request === previousRequest.current) return;
    previousRequest.current = request;
    setIndex(0);
    visits.current = [];
    stepLocation.current = null;
    setReturning(null);
    setArmedAt(null);
    setPhase("welcome");
  }, [request]);
  // Capture the page before the action runs; by the time a route step completes,
  // page already describes the destination, not the control's original page.
  useLayoutEffect(() => {
    if (
      phase === "tour" &&
      !busy &&
      !returning &&
      stepLocation.current?.index !== index
    ) {
      stepLocation.current = { index, url: page.url, screen: page.screen };
    }
  }, [phase, index, busy, returning, page.url, page.screen]);
  const advance = (count = 1) => {
    visits.current.push(
      stepLocation.current || { index, url: page.url, screen: page.screen },
    );
    setArmedAt(null);
    if (index + count >= steps.length) {
      markSeen();
      setPhase("done");
    } else setIndex(index + count);
  };
  const goBack = () => {
    const previous = visits.current.at(-1);
    if (!previous || busy || returning) return;
    setArmedAt(null);
    if (page.url === previous.url && page.screen === previous.screen) {
      visits.current.pop();
      setIndex(previous.index);
    } else {
      setReturning(previous);
      void navigate(previous.url);
    }
  };
  useEffect(() => {
    if (!returning || busy) return;
    if (error) {
      setReturning(null);
      return;
    }
    if (page.url === returning.url && page.screen === returning.screen) {
      visits.current.pop();
      setIndex(returning.index);
      setReturning(null);
    }
  }, [returning, busy, error, page.url, page.screen]);
  useEffect(() => {
    if (
      !returning &&
      phase === "tour" &&
      !busy &&
      !error &&
      stepCompleted(step, page, revision, armedAt)
    )
      advance();
  }, [
    page.url,
    page.screen,
    revision,
    busy,
    error,
    armedAt,
    phase,
    index,
    returning,
  ]);

  // Measure the actual anchor after route/layout changes. Keep the same card mounted
  // so it can move between anchors instead of flashing in a fixed corner.
  useLayoutEffect(() => {
    if (!active || returning) return;
    let frame = 0;
    let focused = false;
    let described: HTMLElement | null = null;
    let previousDescription: string | null = null;
    const muted: HTMLElement[] = [];
    const selector = `[data-tour="${phase === "tour" ? step.target : "help"}"]`;
    const measure = () => {
      const target = document.querySelector<HTMLElement>(selector);
      targetRef.current = target;
      setMissing(!target && !busy);
      const fallback =
        document.querySelector<HTMLElement>("h1") ||
        document.querySelector<HTMLElement>('[data-tour="help"]');
      const anchor = target || fallback;
      if (!anchor || !card.current) return;
      const rect = anchor.getBoundingClientRect();
      let visibleTop = 0,
        visibleBottom = innerHeight;
      // Spotlight only the visible part of a section inside scrolling panels.
      for (
        let parent = anchor.parentElement;
        parent;
        parent = parent.parentElement
      ) {
        if (
          /(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)
        ) {
          const bounds = parent.getBoundingClientRect();
          visibleTop = Math.max(visibleTop, bounds.top);
          visibleBottom = Math.min(visibleBottom, bounds.bottom);
        }
      }
      const styles = getComputedStyle(card.current);
      const length = (token: string, fallback: number) => {
        const value = styles.getPropertyValue(token).trim();
        const scale = value.endsWith("rem")
          ? parseFloat(getComputedStyle(document.documentElement).fontSize)
          : value.endsWith("em")
            ? parseFloat(styles.fontSize)
            : 1;
        return parseFloat(value) * scale || fallback;
      };
      const gap = length("--spacing-3", 12);
      const pad = length("--spacing-1", 4);
      const next = {
        left: Math.max(0, rect.left - pad),
        top: Math.max(visibleTop, Math.min(innerHeight, rect.top - pad)),
        right: Math.min(innerWidth, rect.right + pad),
        bottom: Math.max(
          visibleTop,
          Math.min(visibleBottom, rect.bottom + pad),
        ),
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      };
      setBox((old) =>
        old &&
        Object.keys(next).every(
          (k) => old[k as keyof Box] === next[k as keyof Box],
        )
          ? old
          : next,
      );
      const cardRect = card.current.getBoundingClientRect();
      const placement = placeHint(
        next,
        cardRect.width,
        cardRect.height,
        { width: innerWidth, height: innerHeight },
        gap,
      );
      setPosition((old) =>
        old.left === placement.left && old.top === placement.top
          ? old
          : placement,
      );
      if (
        !focused &&
        !busy &&
        getComputedStyle(card.current).visibility !== "hidden"
      ) {
        focused = true;
        if (target && phase === "tour" && !overview) {
          described = target;
          previousDescription = target.getAttribute("aria-describedby");
          target.setAttribute(
            "aria-describedby",
            [previousDescription, "tour-description", "tour-action"]
              .filter(Boolean)
              .join(" "),
          );
        }
        (phase === "tour" && target && !overview ? target : card.current).focus(
          {
            preventScroll: true,
          },
        );
      }
    };
    const target = document.querySelector<HTMLElement>(selector);
    // Keep both the real control and the coachmark accessible, while shielding
    // unrelated controls from keyboard and assistive-technology activation.
    let branch: HTMLElement | null =
      target || document.querySelector<HTMLElement>("h1");
    while (branch && branch !== document.body) {
      for (const sibling of Array.from(branch.parentElement?.children || [])) {
        if (
          sibling instanceof HTMLElement &&
          sibling !== branch &&
          !sibling.contains(card.current) &&
          !sibling.inert
        ) {
          sibling.inert = true;
          muted.push(sibling);
        }
      }
      branch = branch.parentElement;
    }
    target?.scrollIntoView({
      block: overview ? "start" : "nearest",
      inline: "nearest",
      behavior: "instant",
    });
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    schedule();
    const observer = new ResizeObserver(schedule);
    if (card.current) observer.observe(card.current);
    if (target) observer.observe(target);
    window.addEventListener("resize", schedule);
    document.addEventListener("scroll", schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      muted.forEach((element) => {
        element.inert = false;
      });
      window.removeEventListener("resize", schedule);
      document.removeEventListener("scroll", schedule, true);
      if (described) {
        if (previousDescription === null)
          described.removeAttribute("aria-describedby");
        else described.setAttribute("aria-describedby", previousDescription);
      }
    };
  }, [active, phase, index, revision, busy, returning]);
  useLayoutEffect(() => {
    if (!active || !box || !card.current) return;
    const previous = previousPosition.current;
    previousPosition.current = position;
    const animation = playMotion(
      card.current,
      previous
        ? [
            {
              transform: `translate(${previous.left - position.left}px, ${previous.top - position.top}px)`,
            },
            { transform: "translate(0, 0)" },
          ]
        : [
            { opacity: 0, transform: "translateY(var(--spacing-2))" },
            { opacity: 1, transform: "translateY(0)" },
          ],
    );
    return () => animation?.cancel();
  }, [position, active, !!box]);
  useEffect(() => {
    if (!active) return;
    const activate = (event: MouseEvent) => {
      if (overview && targetRef.current?.contains(event.target as Node)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (
        returning ||
        overview ||
        phase !== "tour" ||
        busy ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey
      )
        return;
      if (targetRef.current?.contains(event.target as Node))
        setArmedAt(revision);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        card.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), a[href]",
        ) || [],
      );
      const target =
        phase === "tour" && !busy && !returning && !overview
          ? targetRef.current
          : null;
      if (target) controls.unshift(target);
      if (!controls.length) return;
      const current = controls.indexOf(document.activeElement as HTMLElement);
      const next =
        (current + (event.shiftKey ? -1 : 1) + controls.length) %
        controls.length;
      event.preventDefault();
      controls[next].focus();
    };
    document.addEventListener("click", activate, true);
    document.addEventListener("keydown", keyboard, true);
    return () => {
      document.removeEventListener("click", activate, true);
      document.removeEventListener("keydown", keyboard, true);
    };
  }, [active, phase, index, revision, busy, returning]);
  if (!active) return null;
  const emptyList =
    missing &&
    (
      { customer: "customers", order: "orders", product: "stock" } as Record<
        string,
        string
      >
    )[step.id] === page.screen;
  const title =
    phase === "welcome"
      ? "Kenali alur kerja OneFlow"
      : phase === "done"
        ? "Siap melanjutkan pekerjaan"
        : step.title;
  const description =
    phase === "welcome"
      ? `Panduan singkat untuk ${page.role === "WAREHOUSE" ? "tim gudang" : page.role === "MANAGER" ? "manajer" : "tim sales"}. Ikuti tindakan pada bagian yang disorot. Setelah halaman terbuka, baca penjelasannya lalu tekan Lanjut. Tidak ada data yang dibuat atau diubah.`
      : phase === "done"
        ? "Anda sudah mengenal jalur utama aplikasi. Untuk mengulang, buka Panduan aplikasi di sidebar."
        : missing
          ? (emptyList ? step.empty : undefined) ||
            "Bagian ini belum tersedia. Tutup panduan, kembali ke Dashboard, lalu coba lagi."
          : step.description;
  const b = box;
  return (
    <>
      {b && (
        <>
          {/* Four shields leave the real target clickable; the overlay never clones UI. */}
          {[
            {
              left: 0,
              top: 0,
              width: "100%",
              height: busy || returning ? "100%" : b.top,
            },
            { left: 0, top: b.bottom, width: "100%", bottom: 0 },
            { left: 0, top: b.top, width: b.left, height: b.bottom - b.top },
            { left: b.right, top: b.top, right: 0, height: b.bottom - b.top },
          ].map((style, i) => (
            <VStack
              key={i}
              aria-hidden="true"
              style={{
                position: "fixed",
                zIndex: 1000,
                backgroundColor:
                  "color-mix(in srgb, var(--color-overlay) 65%, transparent)",
                ...style,
              }}
            />
          ))}
          <VStack
            aria-hidden="true"
            style={{
              position: "fixed",
              pointerEvents: overview ? "auto" : "none",
              zIndex: 1001,
              left: b.left,
              top: b.top,
              width: b.right - b.left,
              height: b.bottom - b.top,
              borderRadius: "var(--radius-element)",
              outline: "var(--spacing-0-5) solid var(--color-accent)",
            }}
          />
        </>
      )}
      <Card
        ref={card}
        padding={5}
        elevation="high"
        role="dialog"
        aria-label={title}
        aria-describedby="tour-description"
        tabIndex={-1}
        width="22rem"
        style={{
          position: "fixed",
          zIndex: 1002,
          left: position.left,
          top: position.top,
          maxWidth: "calc(100vw - var(--spacing-8))",
          maxHeight: "calc(100dvh - var(--spacing-8))",
          overflowY: "auto",
          visibility: b ? "visible" : "hidden",
        }}
      >
        <VStack gap={3}>
          <HStack hAlign="between" vAlign="center" gap={2}>
            <Text type="supporting">
              {phase === "tour"
                ? `${overview ? "Kenali halaman" : "Panduan"} · ${index + 1} dari ${steps.length}`
                : "Panduan aplikasi"}
            </Text>
            <IconButton
              label="Tutup panduan"
              tooltip="Tutup panduan (Esc)"
              size="sm"
              variant="secondary"
              icon={<Icon icon={XMarkIcon} />}
              onClick={close}
            />
          </HStack>
          <Heading level={2}>{title}</Heading>
          <Text id="tour-description">{description}</Text>
          {phase === "tour" &&
            (!overview || busy || returning || error || missing) && (
              <Text id="tour-action" weight="semibold" aria-live="polite">
                {returning
                  ? "Membuka langkah sebelumnya…"
                  : busy
                    ? "Membuka halaman…"
                    : error
                      ? "Halaman belum berhasil dibuka. Klik bagian yang disorot untuk mencoba lagi, atau tutup panduan."
                      : missing
                        ? emptyList
                          ? "Langkah ini bisa dilewati sampai data tersedia."
                          : "Tutup panduan untuk kembali ke halaman Anda."
                        : step.action}
              </Text>
            )}
          {(phase !== "tour" ||
            (overview && !missing) ||
            (emptyList && step.empty)) && (
            <HStack gap={2}>
              {phase === "welcome" && (
                <>
                  <Button
                    label="Mulai panduan"
                    variant="primary"
                    onClick={() => {
                      markSeen();
                      setIndex(0);
                      visits.current = [];
                      stepLocation.current = null;
                      setReturning(null);
                      setPhase("tour");
                      setArmedAt(null);
                    }}
                  />
                  <Button label="Nanti saja" onClick={close} />
                </>
              )}
              {phase === "tour" && (
                <>
                  {overview && (
                    <Button
                      label="Kembali"
                      variant="secondary"
                      isDisabled={
                        busy || !!returning || visits.current.length === 0
                      }
                      onClick={goBack}
                    />
                  )}
                  {overview && !missing && (
                    <Button
                      label="Lanjut"
                      variant="primary"
                      isDisabled={
                        busy ||
                        !!returning ||
                        !!error ||
                        page.screen !== step.destination
                      }
                      onClick={() => advance()}
                    />
                  )}
                  {emptyList && step.empty && (
                    <Button
                      label="Lanjut tanpa data"
                      size="sm"
                      onClick={() => advance(step.skip || 1)}
                    />
                  )}
                </>
              )}
              {phase === "done" && (
                <Button
                  label="Mulai bekerja"
                  variant="primary"
                  onClick={close}
                />
              )}
            </HStack>
          )}
        </VStack>
      </Card>
    </>
  );
}
