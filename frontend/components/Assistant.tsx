import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { RiArrowUpLine, RiSparkling2Line } from "@remixicon/react";
import { Drawer } from "@/components/base/drawer/drawer";
import { cx } from "@/utils/cx";
import { useApp } from "../router";

type Source = { label: string; href: string };
type Message = {
  role: "user" | "model";
  text: string;
  sources?: Source[];
  failed?: boolean;
};

function bold(text: string): ReactNode[] {
  return text.split("**").map((part, index) =>
    index % 2 ? (
      <strong key={index} className="font-semibold text-text-primary">
        {part}
      </strong>
    ) : (
      part
    ),
  );
}

/** Renders the small subset the assistant is told to use: paragraphs, "- " lists and **bold**. */
function Answer({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let items: string[] = [];
  const flush = () => {
    if (!items.length) return;
    blocks.push(
      <ul key={blocks.length} className="flex list-disc flex-col gap-1.5 ps-4">
        {items.map((item, index) => (
          <li key={index}>{bold(item)}</li>
        ))}
      </ul>,
    );
    items = [];
  };
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (/^[-*•]\s+/.test(trimmed)) items.push(trimmed.replace(/^[-*•]\s+/, ""));
    else {
      flush();
      if (trimmed) blocks.push(<p key={blocks.length}>{bold(trimmed)}</p>);
    }
  }
  flush();
  return <div className="flex flex-col gap-2">{blocks}</div>;
}

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
    let reply: Message;
    try {
      const response = await fetch("/assistant/ask/", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": page.csrf,
        },
        body: JSON.stringify({ question: text, history }),
      });
      const body = await response.json();
      reply = response.ok
        ? { role: "model", text: body.answer, sources: body.sources }
        : {
            role: "model",
            text: body.error || "Asisten tidak bisa menjawab. Coba lagi.",
            failed: true,
          };
    } catch {
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

  return (
    <Drawer
      placement="end"
      size="md"
      aria-label="Tanya OneFlow"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-separator-border px-4 py-3">
          <span className="flex items-center gap-2 text-headline-semibold text-text-primary">
            <RiSparkling2Line aria-hidden className="size-5 text-accent-500" />
            Tanya OneFlow
          </span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer rounded-full px-2 py-1 text-body-medium text-text-secondary outline-none hover:bg-background-tertiary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          >
            Tutup
          </button>
        </header>
        <div
          ref={list}
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
          aria-live="polite"
        >
          {messages.length === 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-body-medium text-text-secondary">
                Tanya apa saja tentang data kamu. Contoh:
              </p>
              {suggestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => void send(question)}
                  className="cursor-pointer rounded-xl border border-separator-border px-3 py-2 text-start text-body-medium text-text-primary outline-none transition-colors hover:bg-background-tertiary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                >
                  {question}
                </button>
              ))}
            </div>
          )}
          {messages.map((message, index) =>
            message.role === "user" ? (
              <p
                key={index}
                data-asked
                className="oneflow-enter max-w-[85%] scroll-mt-4 self-end rounded-2xl bg-background-tertiary-default px-3 py-2 text-body-medium text-text-primary"
              >
                {message.text}
              </p>
            ) : (
              <div
                key={index}
                className={cx(
                  "oneflow-enter flex flex-col gap-2 text-body-medium",
                  message.failed
                    ? "text-text-error-primary"
                    : "text-text-secondary",
                )}
              >
                <Answer text={message.text} />
                {!!message.sources?.length && (
                  <div className="flex flex-wrap gap-1.5">
                    {message.sources.map((source) => (
                      <a
                        key={source.href}
                        href={source.href}
                        onClick={(event) => {
                          event.preventDefault();
                          onOpenChange(false);
                          void navigate(source.href);
                        }}
                        className="rounded-full border border-separator-border px-2.5 py-1 text-caption-1-regular text-text-primary capitalize outline-none hover:bg-background-tertiary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                      >
                        {source.label} ›
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ),
          )}
          {waiting && (
            <p
              role="status"
              className="agent-progress-loading-text text-body-medium"
            >
              Mencari di data kamu…
            </p>
          )}
        </div>
        <form
          onSubmit={submit}
          className="flex shrink-0 items-center gap-2 border-t border-separator-border p-3"
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={400}
            autoFocus
            aria-label="Pertanyaan"
            placeholder="Tulis pertanyaan…"
            className="h-10 min-w-0 flex-1 rounded-full bg-background-tertiary-default px-4 text-body-medium text-text-primary outline-none placeholder:text-text-tertiary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          />
          <button
            type="submit"
            aria-label="Kirim"
            disabled={!draft.trim() || waiting}
            className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-accent-500 text-white outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring disabled:cursor-default disabled:opacity-40"
          >
            <RiArrowUpLine aria-hidden className="size-5" />
          </button>
        </form>
      </div>
    </Drawer>
  );
}
