import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { IconArrowUpRight, IconMapPin } from "@/icons";
import { cx } from "@/utils/cx";

type Tone = "danger" | "warning" | "ok" | "accent";
type RowItem = { label: string; value: string; sub?: string };
type RankItem = { name: string; sub?: string; href?: string | null; value: string; percent: number; tone: Tone };
export type Card =
  | {
      kind: "stat";
      title: string;
      value?: number;
      text?: string;
      unit: string;
      tone: Tone;
      progress?: { percent: number; label: string };
      parts: { label: string; value: string; percent: number }[];
    }
  | { kind: "ranking"; title: string; items: RankItem[] }
  | {
      kind: "route";
      title: string;
      summary: string;
      stops: { name: string; area: string; href: string; reasons: { text: string; tone: Tone }[]; rows: RowItem[] }[];
    }
  | { kind: "groups"; title: string; summary: string; href: string; groups: { label: string; tone: Tone; rows: RowItem[] }[] }
  | { kind: "choices"; title: string; items: string[] };

type Actions = { open: (href: string) => void; ask: (question: string) => void };

const FILL: Record<Tone, string> = {
  danger: "bg-text-error-primary",
  warning: "bg-chart-2-active",
  ok: "bg-chart-9-active",
  accent: "bg-accent-500",
};
const TEXT: Record<Tone, string> = {
  danger: "text-text-error-primary",
  warning: "text-accent-500",
  ok: "text-chart-9-active",
  accent: "text-accent-500",
};
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Counts up once when the card arrives. */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(reduced() ? value : 0);
  useEffect(() => {
    if (reduced()) return setShown(value);
    const began = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - began) / 700);
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{shown.toLocaleString("id-ID")}</>;
}

/** A bar that grows to its value after mount; `order` staggers bars in a list. */
function Bar({ percent, tone, order = 0 }: { percent: number; tone: Tone; order?: number }) {
  return (
    <span className="block h-1.5 overflow-hidden rounded-full bg-background-tertiary-default">
      <span
        className={cx("assistant-bar block h-full rounded-full", FILL[tone])}
        style={{ "--bar": `${Math.max(percent, 2)}%`, animationDelay: `${120 + order * 45}ms` } as CSSProperties}
      />
    </span>
  );
}

function Shell({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="assistant-card overflow-hidden rounded-2xl border border-separator-border bg-background-primary-default">
      <header className="flex items-baseline justify-between gap-3 px-3.5 pt-3">
        <h3 className="text-body-2-medium text-text-secondary">{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  );
}

function Name({ href, children, open }: { href?: string | null; children: ReactNode; open: Actions["open"] }) {
  if (!href) return <span className="truncate text-body-medium text-text-primary">{children}</span>;
  return (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        open(href);
      }}
      className="group/name flex min-w-0 items-center gap-0.5 rounded-sm text-body-medium text-text-primary outline-none hover:text-accent-500 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
    >
      <span className="truncate">{children}</span>
      <IconArrowUpRight
        aria-hidden
        className="size-3.5 shrink-0 -translate-x-1 opacity-0 transition-[opacity,transform] duration-200 group-hover/name:translate-x-0 group-hover/name:opacity-100 group-focus-visible/name:translate-x-0 group-focus-visible/name:opacity-100"
      />
    </a>
  );
}

function Stat({ card }: { card: Extract<Card, { kind: "stat" }> }) {
  return (
    <Shell title={card.title}>
      <div className="flex flex-col gap-3 px-3.5 pt-1 pb-3.5">
        <p className="flex items-baseline gap-2">
          <span className={cx("text-title-1-medium tabular-nums", card.value ? TEXT[card.tone] : "text-text-primary")}>
            {card.text ?? <CountUp value={card.value ?? 0} />}
          </span>
          <span className="text-body-2-medium text-text-tertiary">{card.unit}</span>
        </p>
        {card.progress && (
          <div className="flex flex-col gap-1.5">
            <Bar percent={card.progress.percent} tone={card.progress.percent >= 80 ? "ok" : "warning"} />
            <span className="text-caption-1-regular text-text-secondary">{card.progress.label}</span>
          </div>
        )}
        {card.parts.length > 0 && (
          <ul className="flex flex-col gap-2.5">
            {card.parts.map((part, index) => (
              <li key={part.label} className="assistant-row flex flex-col gap-1" style={{ animationDelay: `${index * 45}ms` }}>
                <span className="flex justify-between gap-3 text-body-2-medium">
                  <span className="text-text-primary">{part.label}</span>
                  <span className="text-text-secondary tabular-nums">{part.value}</span>
                </span>
                <Bar percent={part.percent} tone={card.tone === "ok" ? "warning" : card.tone} order={index} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}

function Ranking({ card, open }: { card: Extract<Card, { kind: "ranking" }>; open: Actions["open"] }) {
  return (
    <Shell title={card.title}>
      <ul className="flex flex-col px-3.5 pt-1 pb-2">
        {card.items.map((item, index) => (
          <li
            key={item.name}
            className="assistant-row flex flex-col gap-1.5 border-b border-separator-border py-2.5 last:border-b-0"
            style={{ animationDelay: `${index * 45}ms` }}
          >
            <span className="flex items-baseline justify-between gap-3">
              <Name href={item.href} open={open}>
                {item.name}
              </Name>
              <span className={cx("shrink-0 text-body-2-medium tabular-nums", TEXT[item.tone])}>{item.value}</span>
            </span>
            <Bar percent={item.percent} tone={item.tone} order={index} />
            {item.sub && <span className="text-caption-1-regular text-text-tertiary">{item.sub}</span>}
          </li>
        ))}
      </ul>
    </Shell>
  );
}

function Rows({ rows }: { rows: RowItem[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((row) => (
        <li key={row.label} className="flex items-baseline justify-between gap-3 text-body-2-medium">
          <span className="min-w-0">
            <span className="block truncate text-text-primary">{row.label}</span>
            {row.sub && <span className="block text-caption-1-regular text-text-tertiary">{row.sub}</span>}
          </span>
          <span className="shrink-0 text-text-secondary tabular-nums">{row.value}</span>
        </li>
      ))}
    </ul>
  );
}

/** The day as numbered stops on a line; a stop opens to show what to bring. */
function Route({ card, open }: { card: Extract<Card, { kind: "route" }>; open: Actions["open"] }) {
  const [expanded, setExpanded] = useState(0);
  return (
    <Shell title={card.title} aside={<span className="text-caption-1-regular text-text-tertiary">{card.summary}</span>}>
      <ol className="flex flex-col px-3.5 pt-2 pb-2">
        {card.stops.map((stop, index) => {
          const isOpen = expanded === index && stop.rows.length > 0;
          return (
            <li key={stop.name} className="assistant-row relative flex gap-3 pb-3 last:pb-1.5" style={{ animationDelay: `${index * 55}ms` }}>
              {index < card.stops.length - 1 && <span aria-hidden className="absolute top-6 bottom-0 left-[11px] w-px bg-separator-border" />}
              <span
                className={cx(
                  "relative z-1 flex size-6 shrink-0 items-center justify-center rounded-full text-caption-1-regular tabular-nums transition-colors duration-200",
                  isOpen ? "bg-accent-500 text-white" : "bg-background-tertiary-default text-text-secondary",
                )}
              >
                {index + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  disabled={!stop.rows.length}
                  onClick={() => setExpanded(isOpen ? -1 : index)}
                  className="flex min-w-0 cursor-pointer flex-col gap-1 rounded-md text-start outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring disabled:cursor-default"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-body-medium text-text-primary">{stop.name}</span>
                    <span className="flex shrink-0 items-center gap-0.5 text-caption-1-regular text-text-tertiary">
                      <IconMapPin aria-hidden className="size-3" />
                      {stop.area}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-caption-1-regular">
                    {stop.reasons.map((reason) => (
                      <span key={reason.text} className={TEXT[reason.tone]}>
                        {reason.text}
                      </span>
                    ))}
                  </span>
                </button>
                <div className={cx("assistant-fold", isOpen && "is-open")}>
                  <div className="min-h-0 overflow-hidden">
                    <div className="mt-1.5 flex flex-col gap-2 rounded-xl bg-background-secondary-default p-2.5">
                      <span className="text-caption-1-regular text-text-tertiary">Bawa</span>
                      <Rows rows={stop.rows} />
                      <button
                        type="button"
                        onClick={() => open(stop.href)}
                        className="cursor-pointer self-start rounded-sm text-caption-1-regular text-accent-500 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                      >
                        Buka outlet
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </Shell>
  );
}

function Groups({ card, open }: { card: Extract<Card, { kind: "groups" }>; open: Actions["open"] }) {
  return (
    <Shell
      title={card.title}
      aside={
        <button
          type="button"
          onClick={() => open(card.href)}
          className="shrink-0 cursor-pointer rounded-sm text-caption-1-regular text-accent-500 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          Buka outlet
        </button>
      }
    >
      <div className="flex flex-col gap-3 px-3.5 pt-0.5 pb-3.5">
        {card.summary && <span className="text-caption-1-regular text-text-tertiary">{card.summary}</span>}
        {card.groups.map((group, index) => (
          <div key={group.label} className="assistant-row flex flex-col gap-2" style={{ animationDelay: `${index * 70}ms` }}>
            <span className="flex items-center gap-1.5 text-caption-1-medium text-text-secondary">
              <span aria-hidden className={cx("size-1.5 rounded-full", FILL[group.tone])} />
              {group.label}
            </span>
            <Rows rows={group.rows} />
          </div>
        ))}
      </div>
    </Shell>
  );
}

function Choices({ card, ask }: { card: Extract<Card, { kind: "choices" }>; ask: Actions["ask"] }) {
  return (
    <Shell title={card.title}>
      <div className="flex flex-col gap-1.5 px-3.5 pt-2 pb-3.5">
        {card.items.map((item, index) => (
          <button
            key={item}
            type="button"
            onClick={() => ask(item)}
            className="assistant-row assistant-press cursor-pointer rounded-xl bg-background-secondary-default px-3 py-2 text-start text-body-2-medium text-text-primary outline-none hover:bg-background-tertiary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            style={{ animationDelay: `${index * 45}ms` }}
          >
            {item}
          </button>
        ))}
      </div>
    </Shell>
  );
}

export function Cards({ cards, open, ask }: { cards: Card[] } & Actions) {
  return (
    <div className="flex flex-col gap-2.5">
      {cards.map((card, index) => (
        <div key={card.kind + card.title} style={{ "--order": index } as CSSProperties}>
          {card.kind === "stat" && <Stat card={card} />}
          {card.kind === "ranking" && <Ranking card={card} open={open} />}
          {card.kind === "route" && <Route card={card} open={open} />}
          {card.kind === "groups" && <Groups card={card} open={open} />}
          {card.kind === "choices" && <Choices card={card} ask={ask} />}
        </div>
      ))}
    </div>
  );
}
