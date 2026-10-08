"use client";
/*
 * Test payment simulator. GET /payments/simulator/{txn} shows the transaction; each button
 * sends POST /payments/simulator/{txn}/events, which the server signs and applies like a
 * provider webhook. No card or bank details are ever asked for.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, type ApiError } from "@/lib/api/client";
import { money, when } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { apiMessage } from "@/lib/i18n/shared";
import { useSession } from "@/lib/session";

type Txn = {
  id: string;
  state: string;
  booking_id: string;
  order_kind: string;
  amount_thb: number;
  currency: string;
  method: string;
  expires_at: number;
  reference: string;
  events: { at: number; type: string }[];
};

const LABEL: Record<string, [string, string]> = {
  pending: ["Waiting for payment", "warn"],
  succeeded: ["Paid (simulation)", "ok"],
  failed: ["Payment failed", "bad"],
  expired: ["Expired", "neutral"],
  cancelled: ["Cancelled", "neutral"],
  refunded: ["Refunded (simulation)", "neutral"],
};
const OUTCOMES = [
  ["success", "Simulate successful payment", "btn primary"],
  ["failure", "Simulate a failure", "btn"],
  ["expire", "Let it expire", "btn"],
  ["cancel", "Cancel payment", "btn ghost"],
] as const;

export function PaySim({ id }: { id: string }) {
  const { t, tf, lang } = useT();
  const { openSignIn } = useSession();
  const [txn, setTxn] = useState<Txn | null>(null);
  const [error, setError] = useState<{ message: string; retry: boolean; status?: number } | null>(null);
  const [busy, setBusy] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      await api.session();
      setTxn(await api.get<Txn>("/payments/simulator/" + encodeURIComponent(id)));
      setError(null);
    } catch (e) {
      const err = e as ApiError;
      setError({
        status: err.status,
        retry: err.status !== 404,
        message: err.status === 404 ? t("It does not exist or belongs to another account. Sign in with the account that started it.") : apiMessage(lang, err.message),
      });
    }
  }, [id, lang, t]);

  useEffect(() => {
    load();
  }, [load]);

  const pending = txn?.state === "pending";
  // While waiting: a one-second clock, and a fresh read every 15 s (the server expires it lazily).
  useEffect(() => {
    if (!pending) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(load, 15000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [pending, load]);

  async function act(outcome: string) {
    setBusy(outcome);
    try {
      const r = await api.post<{ txn: Txn }>("/payments/simulator/" + encodeURIComponent(id) + "/events", { outcome });
      setTxn(r.txn);
      setError(null);
    } catch (e) {
      setError({ retry: true, message: apiMessage(lang, (e as Error).message) });
    } finally {
      setBusy("");
    }
  }

  if (error) {
    return (
      <div className="state-box" role="alert">
        <h3>{t("This test payment cannot be shown")}</h3>
        <p className="small muted">{error.message}</p>
        <div className="row">
          {error.retry ? (
            <button className="btn" type="button" onClick={load}>
              {t("Try again")}
            </button>
          ) : (
            <button className="btn" type="button" onClick={() => openSignIn({ onDone: () => load() })}>
              {t("Sign in")}
            </button>
          )}
          <Link className="btn primary" href="/app?view=bookings">
            {t("My appointments")}
          </Link>
        </div>
      </div>
    );
  }
  if (!txn) {
    return (
      <>
        <p className="sr-only" role="status">
          {t("Loading the test payment…")}
        </p>
        <div className="skeleton" />
      </>
    );
  }

  const [label, tone] = LABEL[txn.state] || [txn.state, "neutral"];
  const plus = txn.order_kind === "subscription";
  const left = Math.max(0, Math.round(txn.expires_at - now / 1000));
  const method = txn.method === "promptpay" ? t("PromptPay test QR") : t("Test card");
  const note = plus
    ? txn.state === "succeeded"
      ? t("LabClear Plus is active for 30 days. No real money moved.")
      : txn.state === "refunded"
        ? t("A simulated refund ended Plus.")
        : t("Your plan did not change. You can start a new test payment.")
    : txn.state === "succeeded"
      ? t("The appointment is marked as paid. No real money moved.")
      : txn.state === "refunded"
        ? t("A manager approved a simulated refund.")
        : t("The appointment remains unpaid. You can start a new test payment or pay at the center.");

  return (
    <>
      <div className="row" role="status">
        <span className={"badge " + tone}>{t(label)}</span>
        <span className="badge sim">{t("Simulated integration")}</span>
      </div>
      <p className="amount num">{money(txn.amount_thb)}</p>
      <p className="small muted">
        {plus ? t("LabClear Plus, 30 days") + " · " : ""}
        {tf("Reference {ref}", { ref: txn.reference })} · {method} · THB
      </p>
      {pending ? (
        <>
          <div className="qr-sim" role="img" aria-label={t("Placeholder for a simulated payment code; it cannot be used to pay")}>
            {txn.method === "promptpay" ? t("Simulated QR code. It cannot be scanned or paid.") : t("Test card step. No card details are collected.")}
          </div>
          <p className="small">{tf("Expires in {m} min {s} s", { m: Math.floor(left / 60), s: left % 60 })}</p>
          <div className="form-actions">
            {OUTCOMES.map(([outcome, text, cls]) => (
              <button key={outcome} className={cls} type="button" disabled={!!busy} aria-busy={busy === outcome || undefined} onClick={() => act(outcome)}>
                {t(text)}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="small">{note}</p>
          <div>
            <Link className="btn primary" href={plus ? "/app?view=plan" : "/app?view=bookings"}>
              {plus ? t("Back to my plan") : t("Back to My appointments")}
            </Link>
          </div>
        </>
      )}
      <details>
        <summary>{tf("Signed events received ({n})", { n: txn.events.length })}</summary>
        <ul className="plain small">
          {txn.events.map((e, i) => (
            <li key={i}>
              {when(e.at, lang)} · <span className="mono">{e.type}</span>
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
