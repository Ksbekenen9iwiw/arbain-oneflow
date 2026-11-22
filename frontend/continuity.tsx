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
let origin: string | null = null;

/** Remember which row a detail page was opened from, and point back at it on return. */
export function useReturnHighlight(url: string) {
  useEffect(() => {
    const remember = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element ? event.target.closest("a") : null;
      if (anchor?.closest(ROW) && anchor.closest("main, [data-oneflow-scroll]"))
        origin = anchor.getAttribute("href");
    };
    document.addEventListener("click", remember, true);
    return () => document.removeEventListener("click", remember, true);
  }, []);
  useLayoutEffect(() => {
    if (!origin) return;
    const path = origin.split("?")[0];
    if (url.split("?")[0] === path) return;
    const timer = window.setTimeout(() => {
      const anchor = Array.from(
        document.querySelectorAll<HTMLAnchorElement>("[data-oneflow-scroll] a"),
      ).find((a) => a.getAttribute("href")?.split("?")[0] === path);
      const row = anchor?.closest(ROW);
      origin = null;
      if (!row) return;
      row.scrollIntoView({ block: "nearest" });
      row.classList.add("oneflow-returned");
      window.setTimeout(() => row.classList.remove("oneflow-returned"), 1600);
    }, 60);
    return () => window.clearTimeout(timer);
  }, [url]);
}
