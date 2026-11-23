import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { IconArrowUp, IconArrowUpRight, IconCheck, IconPlus, IconSparkles, IconStop } from "@/icons";
import { Drawer } from "@/components/base/drawer/drawer";
import { cx } from "@/utils/cx";
import { useApp } from "../../router";
import { type Card, Cards } from "./Cards";

const LIMIT = 400;
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

type Source = { label: string; href: string };
type Message = {
  role: "user" | "model";
  text: string;
  sources?: Source[];
  cards?: Card[];
  tools?: string[];
  followUps?: string[];
  failed?: boolean;
  /** The answer has finished writing itself out, so it is not replayed. */
  settled?: boolean;
};

/** Words fade in one by one; **bold** spans stay intact. */
function Words({ text, shown }: { text: string; shown: number }) {
  let count = 0;
  const out: ReactNode[] = [];
  text.split("**").forEach((part, index) => {
    for (const word of part.split(/(\s+)/)) {
      if (!word.trim()) {
        if (word && count < shown) out.push(" ");
        continue;
      }
      if (count++ >= shown) return;
      out.push(
        <span key={count} className={cx("assistant-word", index % 2 === 1 && "font-semibold text-text-primary")}>
          {word}
        </span>,
      );
    }
  });
  return <>{out}</>;
}

/** Writes the answer out, then lets the rest of the reply appear. */
function Answer({ text, settled, onSettled }: { text: string; settled: boolean; onSettled: () => void }) {
  const total = text.split(/\s+/).filter(Boolean).length;
  const [shown, setShown] = useState(settled || reduced() ? total : 0);
  useEffect(() => {
    if (shown >= total) {
      if (!settled) onSettled();
      return;
    }
    const timer = setTimeout(() => setShown((n) => n + 1), 32);
    return () => clearTimeout(timer);
  }, [shown, total, settled]);
  let before = 0;
  return (
    <div className="flex flex-col gap-2">
      {text.split("\n").filter((line) => line.trim()).map((line, index) => {
        const offset = before;
        before += line.split(/\s+/).filter(Boolean).length;
        return shown > offset ? (
          <p key={index}>
            <Words text={line.replace(/^[-*•]\s+/, "")} shown={shown - offset} />
          </p>
        ) : null;
      })}
    </div>
  );
}

function Thinking() {
  return (
    <div role="status" className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-body-medium">
        <IconSparkles aria-hidden className="assistant-spark size-4 text-accent-500" />
        <span className="agent-progress-loading-text">Mencari di data kamu…</span>
      </p>
      <div aria-hidden className="flex flex-col gap-2.5 rounded-2xl border border-separator-border p-3.5">
        <span className="assistant-skeleton h-3 w-1/3 rounded-full" />
        <span className="assistant-skeleton h-7 w-1/2 rounded-lg" />
        <span className="assistant-skeleton h-1.5 w-full rounded-full" />
        <span className="assistant-skeleton h-1.5 w-4/5 rounded-full" />
      </div>
    </div>
  );
}

const chip =
  "assistant-press cursor-pointer rounded-full border border-separator-border px-3 py-1.5 text-start text-body-2-medium text-text-primary outline-none hover:border-accent-500 hover:bg-background-secondary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring";

export default function Assistant({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { page, navigate } = useApp();
  const suggestions: string[] = page.data.assistant_suggestions || [];
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [waiting, setWaiting] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const request = useRef<AbortController | null>(null);

  // Keep the question at the top so a long answer is read from its first line.
  useEffect(() => {
    const asked = list.current?.querySelectorAll("[data-asked]");
    asked?.[asked.length - 1]?.scrollIntoView({ block: "start" });
  }, [messages, waiting, isOpen]);

  async function send(question: string) {
    const text = question.trim();
    if (!text || waiting) return;
    const history = messages
      .filter((m) => !m.failed)
      .map(({ role, text }) => ({ role, text }));
    setMessages((current) => [...current, { role: "user", text }]);
    setDraft("");
    setWaiting(true);
    if (field.current) field.current.style.height = "";
    const controller = (request.current = new AbortController());
    let reply: Message;
    try {
      const response = await fetch("/assistant/ask/", {
        method: "POST",
        credentials: "same-origin",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": page.csrf,
        },
        body: JSON.stringify({ question: text, history }),
      });
      const body = await response.json();
      reply = response.ok
        ? {
            role: "model",
            text: body.answer,
            sources: body.sources,
            cards: body.cards,
            tools: body.tools,
            followUps: body.follow_ups,
          }
        : {
            role: "model",
            text: body.error || "Asisten tidak bisa menjawab. Coba lagi.",
            failed: true,
          };
    } catch {
      if (controller.signal.aborted) {
        setMessages((current) => current.slice(0, -1));
        setDraft(text);
        setWaiting(false);
        return;
      }
      reply = {
        role: "model",
        text: "Tidak tersambung. Periksa internet lalu coba lagi.",
        failed: true,
      };
    }
    setMessages((current) => [...current, reply]);
    setWaiting(false);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(draft);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void send(draft);
  }

  const open = (href: string) => {
    onOpenChange(false);
    void navigate(href);
  };
  const settle = (index: number) =>
    setMessages((current) => current.map((m, i) => (i === index ? { ...m, settled: true } : m)));
  const last = messages.length - 1;

  return (
    <Drawer placement="end" size="md" aria-label="Tanya OneFlow" isOpen={isOpen} onOpenChange={onOpenChange}>
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-2 px-4 py-3">
          <span className="flex items-center gap-2 text-headline-semibold text-text-primary">
            <IconSparkles aria-hidden className="size-5 text-accent-500" />
            Tanya OneFlow
          </span>
          <span className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  request.current?.abort();
                  setMessages([]);
                }}
                className="assistant-press flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-body-medium text-text-secondary outline-none hover:bg-background-tertiary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring"
              >
                <IconPlus aria-hidden className="size-4" />
                Baru
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="assistant-press cursor-pointer rounded-full px-2 py-1 text-body-medium text-text-secondary outline-none hover:bg-background-tertiary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            >
              Tutup
            </button>
          </span>
        </header>
        <div ref={list} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-2 pb-4" aria-live="polite">
          {messages.length === 0 && (
            <div className="flex flex-1 flex-col justify-end gap-4">
              <div className="assistant-card flex flex-col gap-1">
                <IconSparkles aria-hidden className="mb-2 size-7 text-accent-500" />
                <p className="text-title-1-medium text-text-primary">Mau tahu apa hari ini?</p>
                <p className="text-body-medium text-text-secondary">Jawaban diambil dari data OneFlow kamu.</p>
              </div>
              <div className="flex flex-col gap-2">
                {suggestions.map((question, index) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => void send(question)}
                    style={{ animationDelay: `${120 + index * 60}ms` }}
                    className="assistant-row assistant-press group flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-separator-border bg-background-primary-default px-3.5 py-3 text-start text-body-medium text-text-primary outline-none hover:border-accent-500 hover:bg-background-secondary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                  >
                    {question}
                    <IconArrowUpRight
                      aria-hidden
                      className="size-4 shrink-0 text-text-tertiary transition-[transform,color] duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent-500"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message, index) =>
            message.role === "user" ? (
              <p
                key={index}
                data-asked
                className="oneflow-enter max-w-[85%] scroll-mt-2 self-end rounded-2xl rounded-br-md bg-accent-500 px-3.5 py-2 text-body-medium text-white"
              >
                {message.text}
              </p>
            ) : (
              <div
                key={index}
                className={cx(
                  "flex flex-col gap-3 text-body-medium",
                  message.failed ? "text-text-error-primary" : "text-text-secondary",
                )}
              >
                {!!message.tools?.length && (
                  <div className="flex flex-wrap gap-1.5">
                    {message.tools.map((tool) => (
                      <span
                        key={tool}
                        className="assistant-card flex items-center gap-1 rounded-full bg-background-tertiary-default py-1 ps-1.5 pe-2.5 text-caption-1-medium text-text-secondary"
                      >
                        <IconCheck aria-hidden className="size-3.5 text-chart-9-active" />
                        {tool}
                      </span>
                    ))}
                  </div>
                )}
                <Answer text={message.text} settled={!!message.settled} onSettled={() => settle(index)} />
                {message.settled && !!message.cards?.length && <Cards cards={message.cards} open={open} ask={(q) => void send(q)} />}
                {message.settled && !!message.sources?.length && (
                  <div className="assistant-card flex flex-wrap gap-1.5" style={{ "--order": message.cards?.length ?? 0 } as CSSProperties}>
                    {message.sources.map((source) => (
                      <a
                        key={source.href}
                        href={source.href}
                        onClick={(event) => {
                          event.preventDefault();
                          open(source.href);
                        }}
                        className="assistant-press group flex items-center gap-1 rounded-full bg-background-tertiary-default py-1 ps-2.5 pe-2 text-caption-1-medium text-text-primary capitalize outline-none hover:bg-background-quaternary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                      >
                        {source.label}
                        <IconArrowUpRight aria-hidden className="size-3.5 text-text-tertiary transition-colors group-hover:text-accent-500" />
                      </a>
                    ))}
                  </div>
                )}
                {message.settled && index === last && !waiting && !!message.followUps?.length && (
                  <div
                    className="assistant-card flex flex-col items-start gap-1.5 pt-1"
                    style={{ "--order": (message.cards?.length ?? 0) + 1 } as CSSProperties}
                  >
                    <span className="text-caption-1-regular text-text-tertiary">Lanjut tanya</span>
                    {message.followUps.map((question) => (
                      <button key={question} type="button" onClick={() => void send(question)} className={chip}>
                        {question}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ),
          )}
          {waiting && <Thinking />}
        </div>
        <form onSubmit={submit} className="shrink-0 px-3 pb-3">
          <div className="flex items-end gap-2 rounded-3xl border border-separator-border bg-background-primary-default py-1.5 ps-4 pe-1.5 shadow-sm transition-[border-color,box-shadow] duration-200 focus-within:border-accent-500 focus-within:shadow-md">
            <textarea
              ref={field}
              rows={1}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                event.target.style.height = "";
                event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={onKeyDown}
              maxLength={LIMIT}
              autoFocus
              aria-label="Pertanyaan"
              placeholder="Tanya tentang data kamu…"
              className="min-w-0 flex-1 resize-none bg-transparent py-2 text-body-medium text-text-primary outline-none placeholder:text-text-tertiary"
            />
            {draft.length > LIMIT - 60 && (
              <span className="self-center text-caption-1-regular text-text-tertiary tabular-nums">{LIMIT - draft.length}</span>
            )}
            {waiting ? (
              <button
                type="button"
                aria-label="Batalkan"
                onClick={() => request.current?.abort()}
                className="assistant-press flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-text-primary text-background-primary-default outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
              >
                <IconStop aria-hidden className="oneflow-enter size-4" />
              </button>
            ) : (
              <button
                type="submit"
                aria-label="Kirim"
                disabled={!draft.trim()}
                className="assistant-press icon-on-fill flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-accent-500 text-white outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring disabled:cursor-default disabled:bg-background-tertiary-default disabled:text-text-tertiary"
              >
                <IconArrowUp aria-hidden className="size-5" />
              </button>
            )}
          </div>
        </form>
      </div>
    </Drawer>
  );
}
