import { useEffect, useLayoutEffect, useRef, useState } from "react";

const reduced = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const remembered = (key: string) => {
  try {
    const value = sessionStorage.getItem(`oneflow-count:${key}`);
    return value == null ? null : Number(value);
  } catch {
    return null;
  }
};

/** A count that rolls from the value last seen under `id`, so finished work visibly ticks down. */
export function RollingNumber({
  id,
  value,
  className,
}: {
  id: string;
  value: number;
  className?: string;
}) {
  const [shown, setShown] = useState(() => remembered(id) ?? value);
  const from = useRef(shown);
  useEffect(() => {
    try {
      sessionStorage.setItem(`oneflow-count:${id}`, String(value));
    } catch {
      /* private mode: the count simply does not roll */
    }
    const start = from.current;
    if (start === value || reduced()) {
      from.current = value;
      setShown(value);
      return;
    }
    const began = performance.now();
    const duration = Math.min(900, 320 + Math.abs(value - start) * 40);
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - began) / duration);
      const current = Math.round(start + (value - start) * (1 - (1 - t) ** 3));
      from.current = current;
      setShown(current);
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [id, value]);
  return (
    <span className={className} aria-label={String(value)}>
      {shown.toLocaleString("id-ID")}
    </span>
  );
}

const ROW = "tr, li, [data-row]";
const pathOf = (url: string) => url.split("?")[0];
let origin: { list: string; href: string } | null = null;

/** Remember which row a detail page was opened from, and point back at it on return to that list. */
export function useReturnHighlight(url: string) {
  const current = useRef(url);
  current.current = url;
  useEffect(() => {
    const remember = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element ? event.target.closest("a") : null;
      const href = anchor?.getAttribute("href");
      if (href && anchor?.closest(ROW) && anchor.closest("[data-oneflow-scroll]"))
        origin = { list: pathOf(current.current), href: pathOf(href) };
    };
    document.addEventListener("click", remember, true);
    return () => document.removeEventListener("click", remember, true);
  }, []);
  useLayoutEffect(() => {
    if (!origin) return;
    const path = pathOf(url);
    if (path !== origin.list) {
      // Still inside the record that was opened; anywhere else ends the trip.
      if (!path.startsWith(origin.href)) origin = null;
      return;
    }
    const { href } = origin;
    origin = null;
    const timer = window.setTimeout(() => {
      const scroller = document.querySelector("[data-oneflow-scroll]");
      const anchor = Array.from(
        scroller?.querySelectorAll<HTMLAnchorElement>("a") || [],
      ).find((a) => pathOf(a.getAttribute("href") || "") === href);
      const row = anchor?.closest(ROW);
      if (!row || !scroller) return;
      const box = row.getBoundingClientRect();
      const view = scroller.getBoundingClientRect();
      if (box.bottom < view.top || box.top > view.bottom)
        row.scrollIntoView({ block: "center" });
      row.classList.add("oneflow-returned");
      window.setTimeout(() => row.classList.remove("oneflow-returned"), 1600);
    }, 60);
    return () => window.clearTimeout(timer);
  }, [url]);
}
