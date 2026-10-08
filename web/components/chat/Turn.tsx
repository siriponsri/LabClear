"use client";
/*
 * Conversation turns, shared by /app and the website dock (port of static/js/turns.js):
 * speaker row with time, Markdown answer with numbered citation chips, report values on the
 * printed range, "How this was checked", sources, page shortcuts, action previews, report cards
 * and follow-up chips. Every turn is memoised so a streamed step does not re-render the list.
 */
import Link from "next/link";
import { createContext, memo, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { Markdown } from "@/components/ui/Markdown";
import { money, longDate } from "@/lib/format";
import { Icon, type IconName } from "./icons";
import { stepDetail, stepLabel } from "./steps";
import { clock, reportImage, safeUrl, useBranchName, useObjectUrl } from "./util";
import type { Attachment, ChatMessage, LiveTurn, Observation, ReportField, Shortcut, Source } from "./types";

export type ShortcutView = { label: string; icon: IconName; href?: string; run?: () => void };

/** What a turn can do; one stable object per chat surface (see useHandlers in ChatView/DockPanel). */
export type TurnHandlers = {
  interactive: boolean;
  retry: (id: string) => void;
  cardRetry: (id: string) => void;
  followup: (q: string) => void;
  staff: () => void;
  followupCheck: () => void;
  shortcut: (cmd: Shortcut) => ShortcutView | null;
  confirmAction: (m: ChatMessage) => Promise<boolean>;
  confirmCard: (id: string) => Promise<void>;
  editCard: (m: ChatMessage) => void;
  discardCard: (id: string) => Promise<void>;
  openImage: (src: string, name: string) => void;
  isBusy: () => boolean;
};

export const HandlersContext = createContext<TurnHandlers | null>(null);
const useHandlers = () => useContext(HandlersContext)!;

/* ------------------------------------------------------------ small pieces */

function Act({ view }: { view: ShortcutView }) {
  const body = (
    <>
      <Icon name={view.icon} />
      {view.label}
    </>
  );
  if (view.href) {
    const u = safeUrl(view.href);
    if (u?.internal)
      return (
        <Link className="act" href={u.href}>
          {body}
        </Link>
      );
    return (
      <a className="act" href={view.href}>
        {body}
      </a>
    );
  }
  return (
    <button type="button" className="act" onClick={view.run}>
      {body}
    </button>
  );
}

function Toggle({ icon, label, open, onToggle, controls }: { icon: IconName; label: string; open: boolean; onToggle: () => void; controls: string }) {
  return (
    <button type="button" className="act" aria-expanded={open} aria-controls={controls} onClick={onToggle}>
      <Icon name={icon} />
      {label}
    </button>
  );
}

function TurnHead({ m, status }: { m: Pick<ChatMessage, "role" | "at" | "dot">; status?: string }) {
  const { t, lang } = useT();
  const time = clock(m.at, lang);
  return (
    <div className="turn-head">
      {m.role === "user" ? (
        <span className="who">{t("You")}</span>
      ) : m.role === "staff" ? (
        <>
          <span className="who ai">{t("LabClear team")}</span>
          <span className="role">{t("a person")}</span>
        </>
      ) : (
        <>
          <span className="speaker-dot" aria-hidden="true" />
          <span className="who ai">LabClear</span>
          <span className="role">{status ?? t(m.dot?.name || "Assistant") + ", AI"}</span>
        </>
      )}
      {time ? <time dateTime={new Date(m.at * 1000).toISOString()}>{time}</time> : null}
    </div>
  );
}

function Thumb({ a }: { a: Attachment }) {
  const { t, tf } = useT();
  const h = useContext(HandlersContext);
  const src = a.preview || (a.report_id ? reportImage(a.report_id, a.page || 1) : "");
  const { url, failed } = useObjectUrl(src);
  const name = a.name || t("Report image");
  if (!src || failed)
    return (
      <span className="file-chip">
        <Icon name="attach" />
        {failed ? t("Image unavailable. Reopen the report.") : name}
      </span>
    );
  return (
    <button
      type="button"
      className="thumb"
      aria-label={(a.page || 1) > 1 ? tf("Open {name}, page {page}", { name, page: a.page || 1 }) : tf("Open {name}", { name })}
      onClick={() => url && h?.openImage(url, name)}
    >
      {url ? <img src={url} alt="" loading="lazy" /> : <span className="thumb-wait" aria-hidden="true" />}
    </button>
  );
}

function Attachments({ list }: { list: Attachment[] }) {
  if (!list?.length) return null;
  return (
    <div className="attachments sent">
      {list.map((a, i) => (
        <Thumb key={(a.report_id || a.name || "") + ":" + (a.page || i)} a={a} />
      ))}
    </div>
  );
}

const FAILED: Record<string, string> = { safety_blocked: "Not answered: the safety check blocked this request." };

function Failure({ m, onRetry }: { m: ChatMessage; onRetry?: (id: string) => void }) {
  const { t } = useT();
  const h = useHandlers();
  const [busy, setBusy] = useState(false);
  const text = m.retryable ? t("Not answered yet.") : t(FAILED[m.error || ""] || "Not answered.");
  return (
    <div className="callout bad failure" role="alert">
      <strong>{text}</strong>
      {m.error_message ? <span className="small"> {t(m.error_message)}</span> : !m.retryable ? <span className="small"> {t("Try rephrasing, or ask our team.")}</span> : null}
      {h.interactive && m.retryable && onRetry ? (
        <button
          type="button"
          className="btn sm"
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={() => {
            if (h.isBusy()) return;
            setBusy(true);
            onRetry(m.id);
          }}
        >
          {t("Retry")}
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ answer body and citations */

function Body({ m, onCite }: { m: ChatMessage; onCite: (n: number) => void }) {
  const { tf } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const sources = (m.sources || []) as Source[];
  const ids = useMemo(() => sources.map((s) => s.id), [sources]);
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    box.querySelectorAll<HTMLElement>(".cite[data-cite]").forEach((el) => {
      const i = ids.indexOf(el.dataset.cite || "");
      const s = sources[i];
      if (!s) return;
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.title = s.title;
      el.setAttribute("aria-label", tf("Source {n}: {title}", { n: i + 1, title: s.title }));
    });
  }, [ids, sources, m.content, tf]);
  const pick = (target: EventTarget) => {
    const el = (target as Element).closest?.(".cite[data-cite]") as HTMLElement | null;
    if (!el) return false;
    const i = ids.indexOf(el.dataset.cite || "");
    if (i < 0) return false;
    onCite(i + 1);
    return true;
  };
  return (
    <div
      ref={ref}
      className="answer"
      onClick={(e) => pick(e.target)}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && pick(e.target)) e.preventDefault();
      }}
    >
      <Markdown text={m.content || ""} citations={ids} />
    </div>
  );
}

function SourceList({ m, id }: { m: ChatMessage; id: string }) {
  const { t } = useT();
  return (
    <div className="sources" id={id}>
      {((m.sources || []) as Source[]).map((s, i) => {
        const u = safeUrl(s.url);
        // Codex organization references are private, versioned excerpts with a member-only download.
        const org = s.data_class === "organization_private";
        const inner = (
          <>
            <span className="cite">{i + 1}</span>
            <span className="src-text">
              {org ? <span className="src-org">{t("Organization document")}</span> : null}
              {s.title}
              {org && s.version ? <span className="src-pub">, {"v" + s.version + (s.section ? " · " + s.section : "")}</span> : null}
              {s.publisher ? <span className="src-pub">, {s.publisher}</span> : null}
            </span>
          </>
        );
        const key = s.id + i;
        const props = { id: `${id}-${i + 1}`, className: org ? "src-org-row" : undefined };
        if (!u)
          return (
            <span key={key} {...props} tabIndex={-1}>
              {inner}
            </span>
          );
        if (org && u.internal)
          return (
            <a key={key} {...props} href={u.href} download>
              {inner}
            </a>
          );
        if (u.internal)
          return (
            <Link key={key} {...props} href={u.href}>
              {inner}
            </Link>
          );
        return (
          <a key={key} {...props} href={u.href} target="_blank" rel="noopener noreferrer">
            {inner}
          </a>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------ report values on the printed range */

/** Reference text printed on the user's own report: "70-99", "< 200", "> 40"; null when not drawable. */
export function parseRange(ref: string | undefined): { lo: number | null; hi: number | null } | null {
  const text = String(ref || "").replace(/,/g, "").trim();
  const num = "(-?\\d+(?:\\.\\d+)?)";
  let m = text.match(new RegExp("^" + num + "\\s*[-\u2013\u2014to]+\\s*" + num));
  if (m) return { lo: +m[1], hi: +m[2] };
  if ((m = text.match(new RegExp("^(?:<|\u2264|less than|up to)\\s*" + num, "i")))) return { lo: null, hi: +m[1] };
  if ((m = text.match(new RegExp("^(?:>|\u2265|more than|at least)\\s*" + num, "i")))) return { lo: +m[1], hi: null };
  return null;
}

const STATUS: Record<string, [string, string]> = {
  low: ["Below the printed range", "warn"],
  high: ["Above the printed range", "warn"],
  within: ["Within the printed range", "ok"],
  unknown: ["No range to compare with", "neutral"],
};

function ObservationRow({ o }: { o: Observation }) {
  const { t, tf } = useT();
  const [label, tone] = STATUS[o.status || ""] || STATUS.unknown;
  const r = parseRange(o.reference);
  const v = parseFloat(String(o.value).replace(/,/g, ""));
  let ruler: React.ReactNode = <span className="no-ruler">{t("Not drawn: the printed range is not a simple number range.")}</span>;
  if (r && Number.isFinite(v)) {
    const lo = r.lo ?? Math.min(0, v);
    const hi = r.hi ?? Math.max((r.lo ?? 0) * 2, v);
    const span = Math.max(hi - lo, 1e-9);
    const min = Math.min(lo - span * 0.35, v);
    const max = Math.max(hi + span * 0.35, v);
    const pos = (x: number) => (((x - min) / (max - min)) * 100).toFixed(1) + "%";
    ruler = (
      <div className="obs-ruler" role="img" aria-label={`${o.value} ${o.unit || ""}, ${t(label)} ${o.reference}`}>
        <span className="band" style={{ "--from": pos(r.lo ?? min), "--to": pos(r.hi ?? max) } as React.CSSProperties} />
        <span className="mark" style={{ "--at": pos(v) } as React.CSSProperties} />
        {[r.lo, r.hi].map((x, i) =>
          x !== null && x !== undefined ? (
            <span key={i} className="tick" style={{ "--at": pos(x) } as React.CSSProperties}>
              {x}
            </span>
          ) : null,
        )}
      </div>
    );
  }
  return (
    <div className="obs">
      <div className="obs-head">
        <strong>
          {(o.name || t("Value")) + " " + o.value + (o.unit ? " " + o.unit : "")}
        </strong>
        <span>{o.reference ? tf("Range printed on your report: {range}", { range: o.reference }) : t("Your report prints no range for this value")}</span>
        <span className={"badge " + tone}>{t(label)}</span>
      </div>
      {ruler}
    </div>
  );
}

/* ------------------------------------------------------------ what ran before the answer was shown */

function Receipt({ m, id }: { m: ChatMessage; id: string }) {
  const { t, tf } = useT();
  const c = m.checks || {};
  if (m.trace?.length)
    return (
      <ul className="receipt" id={id}>
        {m.trace.map((x, i) => (
          <li key={(x.id || "") + i}>
            <div>
              <span className="step-label">{stepLabel(x.label, t, tf)}</span>
              {x.detail ? <span className="step-detail">{stepDetail(x.detail, t, tf)}</span> : null}
            </div>
          </li>
        ))}
      </ul>
    );
  const n = Number(c.citations_validated || 0);
  const obs = Number(c.observations || 0);
  const items = [
    t("Safety check on your question"),
    n ? (n === 1 ? t("Each claim matched to 1 cited source") : tf("Each claim matched to {n} cited sources", { n })) : t("No source needed for this reply"),
    ...(obs ? [obs === 1 ? t("1 report value matched exactly to your confirmed report") : tf("{n} report values matched exactly to your confirmed report", { n: obs })] : []),
    t("Second review: supported, values unchanged, in scope"),
    t("Safety check on the answer"),
    ...(m.dot?.name ? [tf("Answered by the {name}", { name: t(m.dot.name) })] : []),
  ];
  return (
    <ul className="receipt" id={id}>
      {items.map((x) => (
        <li key={x}>{x}</li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------ action previews (book, quote, handoff, pay) */

const ACTION_TITLES: Record<string, string> = {
  book: "Appointment request preview",
  quote: "Package preview",
  pay: "Payment preview",
  handoff: "Continue with our team",
  link: "Link your LINE conversation",
};
const ACTION_BUTTON: Record<string, string> = { book: "Send appointment request", quote: "Keep this selection", handoff: "Request our team", pay: "Open test payment" };

function ActionCard({ m }: { m: ChatMessage }) {
  const { t, tf, lang } = useT();
  const h = useHandlers();
  const a = m.action!;
  const branch = useBranchName(a.branch_id);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const label = ACTION_BUTTON[a.type];
  return (
    <div className="action-card">
      <strong>{t(ACTION_TITLES[a.type] || "Preview")}</strong>
      {a.quote ? <p className="small">{a.quote.items.map((x) => x.name).join(" + ") + " · " + money(a.quote.total_thb)}</p> : null}
      {a.type === "book" && a.date ? <p className="small">{tf("{center}, {date}, {time} Bangkok time", { center: branch, date: longDate(a.date, lang), time: a.time || "" })}</p> : null}
      {a.summary ? <p className="small muted">{a.summary}</p> : null}
      {a.type === "book" ? <p className="tiny muted">{t("Sending this creates a request. Our team confirms it before payment opens.")}</p> : null}
      {a.type === "link" ? <p className="tiny muted">{t("Open the invitation from your LINE chat while signed in here to link accounts.")}</p> : null}
      {h.interactive && m.action_id && label ? (
        done ? (
          <span className="badge ok">{a.type === "book" ? t("Request sent") : t("Done")}</span>
        ) : (
          <button
            type="button"
            className="btn primary sm"
            disabled={busy}
            aria-busy={busy || undefined}
            onClick={async () => {
              setBusy(true);
              try {
                if (await h.confirmAction(m)) setDone(true);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t(label)}
          </button>
        )
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ values read from a report sent in the chat */

const CARD_STATUS: Record<string, [string, string]> = { high: ["Above", "warn"], low: ["Below", "warn"], within: ["Within", "ok"] };

function ReportCard({ m }: { m: ChatMessage }) {
  const { t } = useT();
  const h = useHandlers();
  const [pending, setPending] = useState<"" | "confirm" | "discard">("");
  const state = pending === "confirm" ? "confirmed" : m.state || "draft";
  if (state === "discarded")
    return (
      <div className="report-card discarded">
        <div className="rc-head">
          <strong>{t("Report discarded")}</strong>
          <span className="badge neutral">{t("Not used")}</span>
        </div>
        <p className="small muted">{t("These values were not saved or used.")}</p>
      </div>
    );
  const fields: ReportField[] = m.fields || [];
  return (
    <div className={"report-card " + state}>
      <div className="rc-head">
        <strong>{t("Values read from your report")}</strong>
        {state === "confirmed" ? <span className="badge ok">{t("Confirmed by you")}</span> : <span className="badge warn">{t("Please check")}</span>}
      </div>
      {m.critical_note ? <p className="callout warn">{t(m.critical_note)}</p> : null}
      {m.sample ? <p className="tiny muted">{t("Synthetic sample, not a patient record.")}</p> : null}
      <div className="table-wrap">
        <table className="data rc-table">
          <thead>
            <tr>
              <th scope="col">{t("Test")}</th>
              <th scope="col">{t("Result")}</th>
              <th scope="col">{t("Printed range")}</th>
              <th scope="col">{t("Compared with range")}</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f, i) => {
              const st = CARD_STATUS[f.status || ""];
              return (
                <tr key={(f.id || f.name) + i}>
                  <td>{f.name}</td>
                  <td className="num">{(f.value + " " + (f.unit || "")).trim()}</td>
                  <td className={f.reference ? "" : "muted"}>{f.reference || t("None printed")}</td>
                  <td>
                    {st ? <span className={"badge " + st[1]}>{t(st[0])}</span> : <span className="tiny muted">{t("Not compared")}</span>}
                    {f.printed_flag ? <span className="tiny muted"> {t("flag")} {f.printed_flag}</span> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {m.warnings?.length ? <p className="callout warn small">{m.warnings.join(" · ")}</p> : null}
      {state === "draft" && h.interactive ? (
        <>
          <p className="small muted">{t("Compare them with your image. Nothing is explained or saved to your dashboard until you confirm.")}</p>
          <div className="row rc-actions">
            <button
              type="button"
              className="btn primary sm"
              disabled={!!pending}
              onClick={async () => {
                if (h.isBusy()) return;
                setPending("confirm");
                await h.confirmCard(m.id);
                setPending("");
              }}
            >
              {t("Values are correct, this is my report")}
            </button>
            <button type="button" className="btn sm" disabled={!!pending} onClick={() => h.editCard(m)}>
              {t("Edit values")}
            </button>
            <button
              type="button"
              className="btn ghost sm"
              disabled={!!pending}
              aria-busy={pending === "discard" || undefined}
              onClick={async () => {
                setPending("discard");
                await h.discardCard(m.id);
                setPending("");
              }}
            >
              {t("Discard")}
            </button>
          </div>
        </>
      ) : state === "confirmed" && pending === "confirm" && m.state === "draft" ? (
        <p className="small muted">{t("Confirmed. Explaining it now.")}</p>
      ) : state === "confirmed" ? (
        <p className="tiny muted">{t("Used in this chat. It is also in My reports and the Lab dashboard.")}</p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ one turn */

function AssistantExtras({ m, last }: { m: ChatMessage; last: boolean }) {
  const { t, tf } = useT();
  const h = useHandlers();
  const [open, setOpen] = useState<"" | "sources" | "checks">("");
  const sources = (m.sources || []) as Source[];
  const srcId = "src-" + m.id;
  const chkId = "chk-" + m.id;
  const shortcuts = (m.ui || []).map((c) => h.shortcut(c)).filter(Boolean) as ShortcutView[];
  const onCite = (n: number) => {
    setOpen("sources");
    requestAnimationFrame(() => document.getElementById(`${srcId}-${n}`)?.focus());
  };
  return (
    <>
      <Body m={m} onCite={onCite} />
      {m.observations?.length ? (
        <div className="obs-list" role="group" aria-label={t("Report values in this answer")}>
          {m.observations.map((o, i) => (
            <ObservationRow key={(o.field_id || "") + i} o={o} />
          ))}
        </div>
      ) : null}
      {h.interactive ? (
        <>
          <div className="actions">
            {sources.length ? (
              <Toggle
                icon="source"
                controls={srcId}
                open={open === "sources"}
                onToggle={() => setOpen((o) => (o === "sources" ? "" : "sources"))}
                label={sources.length === 1 ? t("View source") : tf("View {n} sources", { n: sources.length })}
              />
            ) : null}
            {m.checks || m.trace?.length ? (
              <Toggle icon="check" controls={chkId} open={open === "checks"} onToggle={() => setOpen((o) => (o === "checks" ? "" : "checks"))} label={t("How this was checked")} />
            ) : null}
            {shortcuts.map((s, i) => (
              <Act key={s.label + i} view={s} />
            ))}
            {last && m.dot?.id === "explainer" ? <Act view={{ label: t("Find a follow-up check"), icon: "calendar", run: h.followupCheck }} /> : null}
            {last && m.role !== "staff" ? <Act view={{ label: t("Ask our team"), icon: "staff", run: h.staff }} /> : null}
          </div>
          {open === "sources" && sources.length ? <SourceList m={m} id={srcId} /> : null}
          {open === "checks" ? <Receipt m={m} id={chkId} /> : null}
          {m.action && m.action_id ? <ActionCard m={m} /> : null}
          {m.followups?.length ? (
            <div className="row followups">
              {m.followups.slice(0, 3).map((q) => (
                <button key={q} type="button" className="chip" onClick={() => h.followup(q)}>
                  {q}
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}

export const MessageTurn = memo(function MessageTurn({ m, last }: { m: ChatMessage; last: boolean }) {
  const h = useHandlers();
  const role = m.role === "user" ? "user" : m.role === "staff" ? "staff" : "ai";
  return (
    <article className={"turn " + role}>
      <TurnHead m={m} />
      {m.role === "user" ? (
        <>
          <Attachments list={m.attachments || []} />
          {m.content ? <div className="text">{m.content}</div> : null}
          {m.failed ? <Failure m={m} onRetry={h.retry} /> : null}
        </>
      ) : m.kind === "report_read" ? (
        <>
          <ReportCard m={m} />
          {m.failed ? <Failure m={m} onRetry={h.cardRetry} /> : null}
        </>
      ) : (
        <AssistantExtras m={m} last={last} />
      )}
    </article>
  );
});

/** The message just sent, shown until the server has it. */
export function PendingUserTurn({ content, attachments }: { content: string; attachments: Attachment[] }) {
  const at = useMemo(() => Date.now() / 1000, []);
  return (
    <article className="turn user pending">
      <TurnHead m={{ role: "user", at, dot: null }} />
      <Attachments list={attachments} />
      {content ? <div className="text">{content}</div> : null}
    </article>
  );
}

/** Shown while a reply is prepared; the finished steps stay with the answer under "How this was checked". */
export function LiveTurnView({ live }: { live: LiveTurn }) {
  const { t, tf } = useT();
  const at = useMemo(() => Date.now() / 1000, []);
  const current = [...live.steps].reverse().find((s) => s.state === "running");
  return (
    <article className={"turn ai thinking" + (live.stopped ? " stopped" : "")} aria-busy={!live.stopped}>
      <TurnHead m={{ role: "assistant", at, dot: null }} status={live.stopped ? t("Stopped") : t("Thinking")} />
      <ol className="live-steps">
        {live.steps.map((s) => (
          <li key={s.id} className={"step " + s.state}>
            <span className="step-icon" aria-hidden="true" />
            <div className="step-text">
              <span className="step-label">{stepLabel(s.label, t, tf)}</span>
              {s.detail ? <span className="step-detail">{stepDetail(s.detail, t, tf)}</span> : null}
            </div>
          </li>
        ))}
        {live.note ? <li className="step-note">{live.note}</li> : null}
      </ol>
      <span className="sr-only" role="status">
        {live.stopped ? t("Stopped") : current ? stepLabel(current.label, t, tf) : ""}
      </span>
    </article>
  );
}
