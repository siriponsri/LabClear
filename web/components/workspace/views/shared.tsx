"use client";
/* Helpers shared by the workspace views: data loading, error and loading states, confirmations,
   status labels, plan helpers and the slot picker. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { T } from "@/lib/i18n/shared";
import { useWorkspace, type WorkspaceState } from "../context";
import { ActionButton, Badge, Empty, Skeleton } from "../ui";

type Tone = "" | "ok" | "warn" | "bad" | "neutral" | "accent";

/* ------------------------------------------------------------ loading */

export type Loaded<D> = {
  data: D | undefined;
  error: unknown;
  loading: boolean;
  /** Load again. quiet=true keeps the current content on screen and throws on error. */
  reload: (quiet?: boolean) => Promise<D | undefined>;
};

/** Run an async loader on mount (and when deps change). Only the latest call updates state. */
export function useLoad<D>(fn: () => Promise<D>, deps: React.DependencyList = []): Loaded<D> {
  const [st, setSt] = useState<{ data?: D; error?: unknown; loading: boolean }>({ loading: true });
  const seq = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  const reload = useCallback(
    async (quiet = false) => {
      const mine = ++seq.current;
      if (!quiet) setSt((s) => ({ ...s, loading: true, error: undefined }));
      try {
        const data = await run();
        if (mine === seq.current) setSt({ data, loading: false });
        return data;
      } catch (error) {
        if (mine !== seq.current) return undefined;
        if (quiet) {
          setSt((s) => ({ ...s, loading: false }));
          throw error;
        }
        setSt({ error, loading: false });
        return undefined;
      }
    },
    [run],
  );
  useEffect(() => {
    reload().catch(() => undefined);
  }, [reload]);
  return { data: st.data, error: st.error, loading: st.loading, reload };
}

/** The /workspace payload, reloaded (throws when it cannot be read). */
export async function freshState(refresh: () => Promise<WorkspaceState | null>): Promise<WorkspaceState> {
  const s = await refresh();
  if (!s) throw new Error("The server response could not be read.");
  return s;
}

export function errorText(t: T, e: unknown) {
  return t(e instanceof Error ? e.message : String(e || "The request could not be completed."));
}

/** Skeleton rows while a view loads. */
export function Loading({ rows = 3 }: { rows?: number }) {
  const { t } = useWorkspace();
  return (
    <div className="stack-sm views-loading" aria-busy="true">
      <span className="sr-only" role="status">
        {t("Loading…")}
      </span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} />
      ))}
    </div>
  );
}

/** A view that could not load: the reason and a retry button. */
export function LoadError({ error, retry, title }: { error: unknown; retry: () => unknown; title?: string }) {
  const { t } = useWorkspace();
  return (
    <div role="alert">
      <Empty
        title={title || t("This view could not be loaded")}
        actions={
          <button type="button" className="btn sm primary" onClick={() => retry()}>
            {t("Try again")}
          </button>
        }
      >
        {errorText(t, error)}
      </Empty>
    </div>
  );
}

/** ActionButton that reports errors through the workspace toast. */
export function Act(props: React.ComponentProps<typeof ActionButton>) {
  const { fail } = useWorkspace();
  return <ActionButton onError={fail} {...props} />;
}

/* ------------------------------------------------------------ dialogs */

function ConfirmBody({ body, label, run, danger }: { body: React.ReactNode; label: string; run: () => Promise<unknown>; danger: boolean }) {
  const { t, closeModal, fail } = useWorkspace();
  return (
    <div className="stack">
      {typeof body === "string" ? <p>{body}</p> : body}
      <div className="row">
        <ActionButton
          className={"btn " + (danger ? "danger" : "primary")}
          run={async () => {
            await run();
            closeModal();
          }}
          onError={(e) => {
            closeModal();
            fail(e);
          }}
        >
          {label}
        </ActionButton>
        <button type="button" className="btn ghost" onClick={closeModal}>
          {t("Go back")}
        </button>
      </div>
    </div>
  );
}

/** Ask before a destructive or binding action. `run` closes the dialog when it succeeds. */
export function useConfirm() {
  const { modal } = useWorkspace();
  return useCallback(
    (title: string, body: React.ReactNode, label: string, run: () => Promise<unknown>, danger = true) =>
      modal(title, <ConfirmBody body={body} label={label} run={run} danger={danger} />),
    [modal],
  );
}

/* ------------------------------------------------------------ labels */

export function bookingState(t: T): Record<string, [string, Tone]> {
  return {
    requested: [t("Awaiting confirmation"), "warn"],
    confirmed: [t("Confirmed"), "ok"],
    declined: [t("Declined"), "bad"],
    cancelled: [t("Cancelled"), "neutral"],
  };
}

export function paymentState(t: T): Record<string, [string, Tone]> {
  return {
    pending: [t("Unpaid"), "neutral"],
    paid: [t("Paid (simulation)"), "ok"],
    refunded: [t("Refunded"), "neutral"],
    refund_pending: [t("Refund pending"), "warn"],
    expired: [t("Checkout expired"), "neutral"],
  };
}

export function labStatus(t: T): Record<string, [string, Tone]> {
  return {
    within: [t("Within printed range"), "ok"],
    high: [t("Above printed range"), "warn"],
    low: [t("Below printed range"), "warn"],
    unknown: [t("No range to compare"), "neutral"],
  };
}

export function StatusBadge({ map, value }: { map: Record<string, [string, Tone]>; value: string }) {
  const [label, tone] = map[value] || [value, "neutral"];
  return <Badge tone={tone}>{label}</Badge>;
}

/* ------------------------------------------------------------ plan */

export type Plan = WorkspaceState["plan"];

export function planOf(state: WorkspaceState | null): Plan {
  return state?.plan || { plan: "free", images_per_read: 1, trends: false, can_read: true, ai_reads_used: 0, ai_reads_limit: 1 };
}

/** "8 ต.ค. 2569" / "8 Oct 2026" from unix seconds. */
export function dayText(ts: number | undefined | null, lang: "th" | "en") {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleDateString(lang === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** YYYY-MM-DD as a short date (Buddhist year in Thai). */
export function shortDate(d: string, lang: "th" | "en") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || "")) return d || "";
  return new Date(d + "T00:00:00").toLocaleDateString(lang === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function PlanStrip() {
  const { t, tf, lang, state, navigate } = useWorkspace();
  const p = planOf(state);
  if (p.plan === "plus")
    return (
      <div className="plan-strip">
        <Badge tone="ok">LabClear Plus</Badge>
        <span className="small muted">{tf("Active until {date} · up to 3 pages or images per reading", { date: dayText(p.period_end as unknown as number, lang) })}</span>
      </div>
    );
  return (
    <div className="plan-strip">
      <Badge tone="neutral">{t("Free plan")}</Badge>
      <span className="small muted">{p.can_read ? t("One AI report reading of one image is included.") : t("Your free AI reading is used. Samples stay free.")}</span>
      <button type="button" className="btn sm primary" onClick={() => navigate("plan")}>
        {t("Get Plus, ฿355 for 30 days")}
      </button>
    </div>
  );
}

function UpgradeBody({ reason }: { reason: string }) {
  const { t, closeModal, navigate } = useWorkspace();
  return (
    <div className="stack">
      <p>{reason}</p>
      <p className="small muted">
        {t("LabClear Plus costs ฿355 for 30 days. It reads reports without the one-report limit, up to three pages or images at once, and shows your results over time. It does not renew by itself.")}
      </p>
      <button
        type="button"
        className="btn primary"
        onClick={() => {
          closeModal();
          navigate("plan");
        }}
      >
        {t("See LabClear Plus")}
      </button>
    </div>
  );
}

export function useUpgrade() {
  const { modal, t } = useWorkspace();
  return useCallback((reason: string) => modal(t("This needs LabClear Plus"), <UpgradeBody reason={reason} />), [modal, t]);
}

/* ------------------------------------------------------------ booking */

/** A fresh key for one booking attempt (the server ignores a repeated submit with the same key). */
export function newKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Date.now().toString(16) + Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
}

export function isSunday(date: string) {
  return !!date && new Date(date + "T00:00:00").getDay() === 0;
}

type Slot = { time: string; available: number; capacity: number };

/**
 * Available half-hour times for one center and date. Only the latest request draws the times, so
 * two quick changes never show stale slots. `version` forces a reload (e.g. after "slot full").
 */
export function SlotPicker({ branchId, date, value, onPick, version = 0 }: { branchId: string; date: string; value: string; onPick: (time: string) => void; version?: number }) {
  const { api, t, tf } = useWorkspace();
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);
  const [loadedFor, setLoadedFor] = useState("");
  const want = branchId && date && !isSunday(date) ? `${branchId}|${date}|${version}|${retry}` : "";

  useEffect(() => {
    if (!want) return;
    let alive = true;
    api
      .get<{ slots: Slot[] }>("/slots?" + new URLSearchParams({ branch_id: branchId, date }))
      .then((d) => {
        if (!alive) return;
        setSlots(d.slots);
        setError(null);
        setLoadedFor(want);
      })
      .catch((e) => {
        if (!alive) return;
        setSlots(null);
        setError(e);
        setLoadedFor(want);
      });
    return () => {
      alive = false;
    };
  }, [want, api, branchId, date]);

  const loading = !!want && loadedFor !== want;
  const open = slots ? slots.filter((s) => s.available > 0).length : 0;
  let message: string;
  if (!branchId || !date) message = t("Choose a center and date to see available times.");
  else if (isSunday(date)) message = t("Centers are closed on Sundays. Choose Monday to Saturday.");
  else if (loading) message = t("Loading times…");
  else if (error) message = errorText(t, error);
  else if (!slots?.length) message = t("No times are open on this date (past, or more than 30 days ahead). Choose another date.");
  else message = open ? tf("{open} of {total} times available.", { open, total: slots.length }) : t("This date is fully booked. Try another date or center.");

  return (
    <div className="stack-sm">
      <p className="small muted" aria-live="polite">
        {message}
      </p>
      {error && !loading ? (
        <div className="row">
          <button type="button" className="btn sm" onClick={() => setRetry((n) => n + 1)}>
            {t("Try again")}
          </button>
        </div>
      ) : null}
      {want && !loading && slots?.length ? (
        <div className="slot-grid" role="group" aria-label={t("Available times")}>
          {slots.map((s) => (
            <button
              key={s.time}
              type="button"
              className="slot"
              disabled={s.available < 1}
              aria-pressed={value === s.time}
              aria-label={s.time + ", " + (s.available < 1 ? t("full") : tf("{n} places left", { n: s.available }))}
              onClick={() => onPick(s.time)}
            >
              <span>{s.time}</span>
              <small>{s.available < 1 ? t("Full") : tf("{n} left", { n: s.available })}</small>
            </button>
          ))}
        </div>
      ) : null}
      {loading ? <div className="slot-grid slot-skeleton" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <span key={i} />)}</div> : null}
    </div>
  );
}
