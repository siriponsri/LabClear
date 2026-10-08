"use client";
/* Building blocks shared by the service desk views. Every action calls a real endpoint. */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api, type Message } from "@/lib/api/client";
import type { Lang, T } from "@/lib/i18n/shared";
import { ago, money } from "@/lib/format";
import { Markdown } from "@/components/ui/Markdown";
import { ActionButton, Badge, Empty, Skeleton } from "@/components/workspace/ui";
import { useStaff, type ConfirmOptions } from "./context";

type Tone = "" | "ok" | "warn" | "bad" | "neutral" | "accent";

/* ------------------------------------------------------------------ data loading */

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export type Load<T> = {
  data: T | null;
  error: string;
  loading: boolean;
  /** Reload without clearing what is shown. Rejects when the request fails. */
  reload: () => Promise<void>;
};

/** Loads on mount and whenever deps change. Later reloads keep the current data on screen. */
export function useLoad<T>(load: () => Promise<T>, deps: React.DependencyList): Load<T> {
  const [state, setState] = useState<{ data: T | null; error: string; loading: boolean }>({ data: null, error: "", loading: true });
  const ref = useRef(load);
  useEffect(() => {
    ref.current = load;
  });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: "" }));
    ref.current().then(
      (data) => alive && setState({ data, error: "", loading: false }),
      (e) => alive && setState({ data: null, error: errText(e), loading: false }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  const reload = useCallback(async () => {
    try {
      const data = await ref.current();
      setState({ data, error: "", loading: false });
    } catch (e) {
      setState((s) => ({ ...s, error: s.data ? s.error : errText(e), loading: false }));
      throw e;
    }
  }, []);
  return { ...state, reload };
}

/** Skeleton while loading, an error box with Try again, then the content. */
export function Loaded<T>({ state, children, title }: { state: Load<T>; children: (data: T) => React.ReactNode; title?: string }) {
  const { t } = useStaff();
  if (state.data === null && state.loading) return <Skeleton />;
  if (state.data === null)
    return (
      <Empty
        title={title || t("This view could not be loaded")}
        actions={
          <ActionButton className="btn sm" run={() => state.reload().catch(() => {})}>
            {t("Try again")}
          </ActionButton>
        }
      >
        {t(state.error)}
      </Empty>
    );
  return <>{children(state.data)}</>;
}

/* ------------------------------------------------------------------ labels */

export const bookingStates = (t: T): Record<string, [string, Tone]> => ({
  requested: [t("Awaiting confirmation"), "warn"],
  confirmed: [t("Confirmed"), "ok"],
  declined: [t("Declined"), "bad"],
  cancelled: [t("Cancelled"), "neutral"],
});
export const paymentStates = (t: T): Record<string, [string, Tone]> => ({
  pending: [t("Unpaid"), "neutral"],
  paid: [t("Paid (simulation)"), "ok"],
  refunded: [t("Refunded"), "neutral"],
  refund_pending: [t("Refund pending"), "warn"],
  expired: [t("Checkout expired"), "neutral"],
});
export const payStates = (t: T): Record<string, [string, Tone]> => ({
  pending: [t("Waiting for payment"), "warn"],
  succeeded: [t("Succeeded"), "ok"],
  failed: [t("Failed"), "bad"],
  expired: [t("Expired"), "neutral"],
  cancelled: [t("Cancelled"), "neutral"],
  refunded: [t("Refunded"), "neutral"],
  center: [t("Paid at center"), "ok"],
});
export const ticketStates = (t: T): Record<string, string> => ({
  waiting: t("Waiting for a person"),
  staff: t("With staff"),
  bot: t("Back with the assistant"),
  closed: t("Closed"),
});
export const quoteStates = (t: T): Record<string, [string, Tone]> => ({
  offered: [t("Offered"), "warn"],
  accepted: [t("Accepted"), "ok"],
  superseded: [t("Superseded"), "neutral"],
  expired: [t("Expired"), "neutral"],
});
export const methodLabel = (t: T, m: string) =>
  ({ promptpay: t("Test PromptPay"), card: t("Test card"), center: t("At the center") })[m] || m;

/** Integration modes from GET /modes in plain words. */
export const modeLabel = (t: T, mode: string) =>
  ({
    LIVE_MODEL: t("Live model"),
    PROVIDER_SANDBOX: t("Provider sandbox"),
    UNAVAILABLE: t("Unavailable"),
    SIMULATED_INTEGRATION: t("Simulated"),
    SIMULATED_BUSINESS_DATA: t("Simulated data"),
    NOT_CONNECTED: t("Not connected"),
    LINK_ONLY: t("Links only"),
    LOCAL_BM25: t("Keyword search"),
    HYBRID: t("Hybrid search"),
  })[mode] || mode.replaceAll("_", " ").toLowerCase();

export function StateBadge({ map, value }: { map: Record<string, [string, Tone]>; value: string }) {
  const [label, tone] = map[value] || [value, "neutral" as Tone];
  return <Badge tone={tone}>{label}</Badge>;
}

const locale = (lang: Lang) => (lang === "th" ? "th-TH" : "en-GB");
/** 2026-10-12 -> "จ. 12 ต.ค." */
export const shortDate = (iso: string, lang: Lang) => {
  const d = new Date(iso + "T00:00:00");
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(locale(lang), { weekday: "short", day: "numeric", month: "short" });
};
/** 2026-10-12 -> "จ. 12" (capacity table columns) */
export const dayLabel = (iso: string, lang: Lang) => {
  const d = new Date(iso + "T00:00:00");
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(locale(lang), { weekday: "short", day: "numeric" });
};
export const clock = (unix: number, lang: Lang) => new Date(unix * 1000).toLocaleTimeString(locale(lang), { hour: "2-digit", minute: "2-digit" });

/* ------------------------------------------------------------------ small pieces */

export function Kv({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className="chip" aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}

export function RefreshButton({ run }: { run: () => Promise<unknown> }) {
  const { t, fail } = useStaff();
  return (
    <ActionButton className="btn ghost sm" run={run} onError={fail}>
      <Icon name="refresh" />
      {t("Refresh")}
    </ActionButton>
  );
}

const ICONS: Record<string, React.ReactNode> = {
  refresh: <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />,
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  bell: (
    <>
      <path d="M6 9a6 6 0 0 1 12 0c0 6.5 2.5 8 2.5 8h-17S6 15.5 6 9" />
      <path d="M10.3 20.5a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
  external: <path d="M9 5H5.5a.5.5 0 0 0-.5.5v13a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5V15M13 5h6v6M19 5l-8 8" />,
  doc: (
    <>
      <path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20z" />
      <path d="M14 3.5V8h4M10 12h5M10 15.5h5" />
    </>
  ),
  warn: (
    <>
      <path d="M12 4 2.8 19.5h18.4z" />
      <path d="M12 10v4.5M12 17.3v.2" />
    </>
  ),
  chevron: <path d="m9 6 6 6-6 6" />,
};
export function Icon({ name, size = 16 }: { name: keyof typeof ICONS | string; size?: number }) {
  return (
    <svg className="sd-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

/** Copies text and confirms in place; falls back to selecting the text when the clipboard is blocked. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const { t, notice } = useStaff();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => setDone(false), 1800);
    return () => clearTimeout(id);
  }, [done]);
  return (
    <button
      type="button"
      className="btn ghost sm sd-copy"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
        } catch {
          notice(t("Copy is blocked in this browser. Select the code and copy it by hand."), "bad");
        }
      }}
    >
      <Icon name={done ? "check" : "copy"} />
      <span aria-live="polite">{done ? t("Copied") : t("Copy")}</span>
    </button>
  );
}

export function Tile({ label, value, sub, onClick }: { label: string; value: string; sub?: string; onClick?: () => void }) {
  const inner = (
    <>
      <span className="kpi-label">{label}</span>
      <strong className="kpi-value num">{value}</strong>
      {sub ? <span className="kpi-sub">{sub}</span> : null}
    </>
  );
  return onClick ? (
    <button type="button" className="kpi" onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className="kpi">{inner}</div>
  );
}

/* ------------------------------------------------------------------ dialogs */

/** Body of a confirmation dialog: explanation, inline error, Cancel and the confirming action. */
export function ConfirmBody({ o }: { o: ConfirmOptions }) {
  const { t, closeModal } = useStaff();
  const [error, setError] = useState("");
  return (
    <div className="stack">
      <div className="small stack-sm">{o.body}</div>
      {error ? (
        <p className="field-error" role="alert">
          {t(error)}
        </p>
      ) : null}
      <div className="form-actions">
        <ActionButton
          className={o.danger ? "btn danger" : "btn primary"}
          run={async () => {
            setError("");
            await o.run();
            closeModal();
          }}
          onError={(e) => setError(errText(e))}
        >
          {o.confirmLabel}
        </ActionButton>
        <button type="button" className="btn ghost" onClick={closeModal}>
          {t("Cancel")}
        </button>
      </div>
    </div>
  );
}

/** A small form in the dialog: one required text field, then an action that may fail inline. */
export function ReasonForm({
  label,
  hint,
  minLength = 1,
  multiline = true,
  intro,
  submitLabel,
  danger = true,
  submit,
}: {
  label: string;
  hint?: string;
  minLength?: number;
  multiline?: boolean;
  intro?: React.ReactNode;
  submitLabel: string;
  danger?: boolean;
  submit: (value: string) => Promise<unknown>;
}) {
  const { t, closeModal } = useStaff();
  const id = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const common = {
    id,
    className: "input",
    required: true,
    minLength,
    maxLength: 500,
    value,
    "aria-describedby": hint ? id + "-hint" : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValue(e.target.value),
  };
  const run = async () => {
    setError("");
    if (!form.current?.reportValidity()) return;
    try {
      await submit(value.trim());
      closeModal();
    } catch (e) {
      setError(errText(e));
    }
  };
  return (
    <form
      ref={form}
      className="form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        run();
      }}
    >
      {intro ? <div className="small">{intro}</div> : null}
      <div className="field">
        <label htmlFor={id}>{label}</label>
        {hint ? (
          <span className="hint" id={id + "-hint"}>
            {hint}
          </span>
        ) : null}
        {multiline ? <textarea {...common} rows={3} /> : <input {...common} type="text" />}
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {t(error)}
        </p>
      ) : null}
      <div className="form-actions">
        <ActionButton className={danger ? "btn danger" : "btn primary"} run={run}>
          {submitLabel}
        </ActionButton>
        <button type="button" className="btn ghost" onClick={closeModal}>
          {t("Cancel")}
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ appointments */

export type Booking = {
  id: string;
  state: string;
  branch: string;
  owner: string;
  created: number;
  data: {
    items: { name: string }[];
    date: string;
    time: string;
    total_thb: number;
    payment_status: string;
    payment_method: string;
    organization?: boolean;
    requested_at?: number;
    active_txn?: string;
    [k: string]: unknown;
  };
};

/** One appointment with the real actions staff can take on it (3.x staffBookingRow). */
export function BookingRow({ b, after }: { b: Booking; after: () => Promise<unknown> | unknown }) {
  const { t, tf, lang, manager, notice, fail, modal, confirm, branchName } = useStaff();
  const d = b.data;
  const pays = d.organization
    ? t("Organization")
    : ({ center: t("Pays at the center"), promptpay: t("Pays by test PromptPay"), card: t("Pays by test card") } as Record<string, string>)[d.payment_method] ||
      t("Pays at the center");
  const actions: React.ReactNode[] = [];
  if (b.state === "requested") {
    actions.push(
      <ActionButton
        key="confirm"
        className="btn sm primary"
        onError={fail}
        run={async () => {
          await api.post("/staff/bookings/" + b.id + "/decision", { decision: "confirm" });
          notice(t("Confirmed. The customer was notified."));
          await after();
        }}
      >
        {t("Confirm appointment")}
      </ActionButton>,
      <button
        key="decline"
        type="button"
        className="btn sm danger"
        onClick={() =>
          modal(
            t("Decline appointment request"),
            <ReasonForm
              label={t("Reason shown to the customer")}
              hint={t("For example: the center is fully booked at this time. Suggest another day if you can.")}
              submitLabel={t("Decline request")}
              submit={async (note) => {
                await api.post("/staff/bookings/" + b.id + "/decision", { decision: "decline", note });
                notice(t("Declined. The customer was notified."));
                await after();
              }}
            />,
          )
        }
      >
        {t("Decline")}
      </button>,
    );
  }
  if (b.state === "confirmed" && d.payment_status === "pending" && d.payment_method === "center" && !d.active_txn)
    actions.push(
      <button
        key="settle"
        type="button"
        className="btn sm"
        onClick={() =>
          confirm({
            title: t("Record center payment"),
            body: <p>{tf("Confirm you received {amount} for this simulated appointment. This creates an auditable demo receipt.", { amount: money(d.total_thb) })}</p>,
            confirmLabel: t("Confirm receipt"),
            run: async () => {
              await api.post("/staff/bookings/" + b.id + "/settle");
              notice(t("Payment recorded."));
              await after();
            },
          })
        }
      >
        {t("Record payment at center")}
      </button>,
    );
  if (manager && d.payment_status === "paid")
    actions.push(
      <button
        key="refund"
        type="button"
        className="btn sm danger"
        onClick={() =>
          modal(
            t("Approve refund"),
            <ReasonForm
              label={t("Reason")}
              hint={t("Kept in the audit log.")}
              minLength={3}
              multiline={false}
              intro={tf("Refund {amount}. Test payments are refunded through the simulator or provider test mode; center payments create a demo refund record.", { amount: money(d.total_thb) })}
              submitLabel={t("Confirm refund")}
              submit={async (reason) => {
                const r = await api.post<{ status: string }>("/staff/bookings/" + b.id + "/refund", { reason });
                notice(tf("Refund status: {status}", { status: t(r.status) }));
                await after();
              }}
            />,
          )
        }
      >
        {t("Approve full refund")}
      </button>,
    );
  return (
    <article className="record">
      <div className="record-head">
        <h3>{d.items.map((i) => i.name).join(" + ")}</h3>
        <StateBadge map={bookingStates(t)} value={b.state} />
        <StateBadge map={paymentStates(t)} value={d.payment_status} />
      </div>
      <div className="record-meta">
        <span>
          {shortDate(d.date, lang)}, {d.time}
        </span>
        <span>{t(branchName(b.branch))}</span>
        <span className="num">{money(d.total_thb)}</span>
        <span>{pays}</span>
        <span>
          {t("Ref")} {b.id.slice(-8)}
        </span>
        {b.state === "requested" && d.requested_at ? <span>{tf("Requested {when}", { when: ago(d.requested_at, lang) })}</span> : null}
      </div>
      {actions.length ? <div className="record-actions">{actions}</div> : null}
    </article>
  );
}

/* ------------------------------------------------------------------ conversation turns */

/** A turn in a customer's conversation as staff see it. Report images and values stay private. */
export function Turn({ m }: { m: Message }) {
  const { t, lang } = useStaff();
  const role = m.role === "user" ? "user" : m.role === "staff" ? "staff" : "ai";
  const dot = (m as { dot?: { name?: string } }).dot;
  const sources = (m.sources || []).map((s) => s.id);
  return (
    <article className={"turn " + role}>
      <div className="turn-head">
        {role === "user" ? (
          <span className="who">{t("Customer")}</span>
        ) : role === "staff" ? (
          <>
            <span className="who ai">{t("LabClear team")}</span>
            <span className="role">{t("a person")}</span>
          </>
        ) : (
          <>
            <span className="speaker-dot" aria-hidden="true" />
            <span className="who ai">LabClear</span>
            <span className="role">{(dot?.name ? t(dot.name) : t("Assistant")) + ", AI"}</span>
          </>
        )}
        {m.at ? <time dateTime={new Date(m.at * 1000).toISOString()}>{clock(m.at, lang)}</time> : null}
      </div>
      {Array.isArray((m as { attachments?: unknown[] }).attachments) && (m as { attachments?: unknown[] }).attachments!.length ? (
        <p className="small muted">{t("The customer attached a file. It stays private to the customer.")}</p>
      ) : null}
      {m.kind === "report_read" ? (
        <p className="small muted">{t("The customer added a lab report here. Its values stay private to the customer.")}</p>
      ) : role === "user" ? (
        m.content ? <div className="text">{m.content}</div> : null
      ) : (
        <Markdown text={m.content || ""} citations={sources} />
      )}
      {m.failed ? <p className="small muted">{t("This turn failed and was not answered.")}</p> : null}
    </article>
  );
}

/* ------------------------------------------------------------------ AI budget */

export type BudgetData = {
  cost: {
    available: boolean;
    cap_thb: number;
    prior_spend_thb?: number | null;
    settled_thb?: number;
    reserved_thb?: number;
    remaining_thb?: number | null;
    calls?: number;
    priced_models?: string[];
    enabled?: boolean;
  };
  network_enabled: boolean;
  call_cycle: string | null;
  hosted_calls: { cycle: string | null; used: number; limit: number; remaining: number } | null;
};

const USD_RATE = 36;
const thb = (n: number, digits = 2) => n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Project-total AI budget (USD 10 ≈ 360 THB) with a usage meter. */
export function BudgetPanel({ b }: { b: BudgetData }) {
  const { t, tf } = useStaff();
  const c = b.cost;
  const spent = (c.prior_spend_thb ?? 0) + (c.settled_thb ?? 0) + (c.reserved_thb ?? 0);
  const share = c.cap_thb ? Math.min(1, spent / c.cap_thb) : 0;
  const hc = b.hosted_calls;
  return (
    <section className="card stack sd-budget" aria-labelledby="sd-budget-title">
      <div className="record-head">
        <h3 id="sd-budget-title">{t("AI budget (project total)")}</h3>
        <Badge tone={b.network_enabled ? "ok" : "neutral"}>{b.network_enabled ? t("AI calls on") : t("AI calls off")}</Badge>
      </div>
      <div className="sd-budget-figure">
        <strong className="num">฿{thb(c.cap_thb, 0)}</strong>
        <span className="small muted">{tf("about USD {usd} for the whole project, not monthly", { usd: Math.round(c.cap_thb / USD_RATE) })}</span>
      </div>
      {c.available ? (
        <>
          <div className="sd-meter" role="img" aria-label={tf("{spent} of {cap} THB used", { spent: thb(spent), cap: thb(c.cap_thb, 0) })}>
            <span style={{ width: Math.max(share * 100, spent > 0 ? 1 : 0) + "%" }} />
          </div>
          <p className="small muted">
            {tf("{spent} THB used or reserved · {remaining}", {
              spent: thb(spent),
              remaining: c.remaining_thb === null || c.remaining_thb === undefined ? t("remaining unknown") : tf("{n} THB left", { n: thb(c.remaining_thb) }),
            })}
          </p>
        </>
      ) : (
        <p className="callout warn small">{t("The budget ledger is unavailable, so paid AI calls are blocked.")}</p>
      )}
      <Kv
        rows={[
          [
            t("Spent before this ledger"),
            c.prior_spend_thb === null || c.prior_spend_thb === undefined ? t("Not set, so paid AI calls are blocked") : thb(c.prior_spend_thb) + " THB",
          ],
          [t("Settled in ledger"), c.available ? thb(c.settled_thb ?? 0, 4) + " THB" : t("Unavailable")],
          [t("Reserved now"), c.available ? thb(c.reserved_thb ?? 0, 4) + " THB" : t("Unavailable")],
          [t("Paid calls so far"), String(c.calls ?? 0)],
          [
            t("Call cap"),
            hc?.cycle
              ? tf("{used} of {limit} calls used in cycle {cycle}", { used: hc.used, limit: hc.limit, cycle: hc.cycle })
              : t("Set PROVIDER_BUDGET_CYCLE_ID and CLOUD_CALL_LIMIT to allow AI calls"),
          ],
          [t("Priced models"), c.priced_models?.length ? <span className="mono small">{c.priced_models.join(", ")}</span> : t("None configured")],
        ]}
      />
    </section>
  );
}
