"use client";
/*
 * Organization quotation request (POST /organizations/inquiries). The request is tied to a
 * signed-in account so the customer can follow and accept the quotation; guests are offered
 * the shared sign-in dialog instead of a second login form.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { bangkokDate, when } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { apiMessage } from "@/lib/i18n/shared";
import { useSession } from "@/lib/session";

type Option = { id: string; name: string };
type Inquiry = { id: string; state: string; data: { organization: string; headcount: number; service_mode: string; at: number; package_ids?: string[] } };

export function InquiryForm({ packages, branches, minPeople, preselect }: { packages: Option[]; branches: Option[]; minPeople: number; preselect: string }) {
  const { t, tf, lang } = useT();
  const { user, openSignIn } = useSession();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  const [history, setHistory] = useState<Inquiry[] | null>(null);
  const [historyError, setHistoryError] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const doneLink = useRef<HTMLAnchorElement>(null);
  const signedIn = !!user?.registered;

  useEffect(() => {
    api.me().catch(() => null).finally(() => setChecked(true));
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    api
      .get<{ inquiries: Inquiry[] }>("/organizations/inquiries")
      .then((r) => live && setHistory([...r.inquiries].sort((a, b) => (b.data.at || 0) - (a.data.at || 0))))
      .catch((e) => live && setHistoryError(apiMessage(lang, (e as Error).message)));
    return () => {
      live = false;
    };
  }, [signedIn, done, lang]);

  useEffect(() => {
    if (done) doneLink.current?.focus();
  }, [done]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!signedIn) {
      setError(t("Sign in or create an account first."));
      openSignIn({ reason: t("Sign in so you can follow and accept the quotation.") });
      return;
    }
    const el = e.currentTarget;
    const fields = ["organization", "contact_name", "headcount", "preferred_date"] as const;
    const bad: Record<string, boolean> = {};
    for (const name of fields) {
      const f = el.elements.namedItem(name) as HTMLInputElement | null;
      if (f && !f.checkValidity()) bad[name] = true;
    }
    setInvalid(bad);
    if (Object.keys(bad).length) {
      setError(tf("Please complete the highlighted fields. Teams start at {n} people.", { n: minPeople }));
      (el.querySelector(`[name="${Object.keys(bad)[0]}"]`) as HTMLElement | null)?.focus();
      return;
    }
    const data = new FormData(el);
    const body = {
      organization: String(data.get("organization") || "").trim(),
      contact_name: String(data.get("contact_name") || "").trim(),
      headcount: Number(data.get("headcount")),
      service_mode: String(data.get("service_mode") || "center"),
      branch_id: String(data.get("branch_id") || ""),
      preferred_date: String(data.get("preferred_date") || ""),
      package_ids: data.getAll("package_ids").map(String),
      notes: String(data.get("notes") || "").trim(),
    };
    setBusy(true);
    try {
      await api.post("/organizations/inquiries", body);
      setDone(true);
    } catch (err) {
      setError(apiMessage(lang, (err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  const status = !checked ? t("Checking your account…") : signedIn ? tf("Signed in as {email}. The quotation will appear in your workspace.", { email: user!.email }) : t("Sign in or create a free account so you can follow and accept the quotation.");

  return (
    <section className="card stack" aria-labelledby="inq-title">
      <h2 className="h3" id="inq-title">
        {t("Request a quotation")}
      </h2>
      <p className="small muted" aria-live="polite">
        {status}
      </p>
      {checked && !signedIn && !done ? (
        <div className="auth-box stack-sm">
          <p className="small">{t("A free account keeps the request, the quotation and its PDF versions together.")}</p>
          <div className="row">
            <button className="btn sm primary" type="button" onClick={() => openSignIn({ reason: t("Sign in so you can follow and accept the quotation.") })}>
              {t("Sign in or create an account")}
            </button>
          </div>
        </div>
      ) : null}
      {done ? (
        <div className="state-box" role="status">
          <h3>{t("Request received")}</h3>
          <p className="small muted">{t("A coordinator will prepare a quotation. It will appear in My appointments with a notification.")}</p>
          <div className="row">
            <Link className="btn primary" href="/app?view=bookings" ref={doneLink}>
              {t("Open My appointments")}
            </Link>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setDone(false);
                form.current?.reset();
              }}
            >
              {t("Send another request")}
            </button>
          </div>
        </div>
      ) : null}
      <form className="form-grid" id="inquiry-form" noValidate onSubmit={submit} ref={form} hidden={done}>
        <label className="field">
          {t("Organization name")}
          <input className="input" name="organization" required minLength={2} maxLength={160} autoComplete="organization" aria-invalid={invalid.organization || undefined} />
        </label>
        <label className="field">
          {t("Your name")}
          <input className="input" name="contact_name" required minLength={2} maxLength={120} autoComplete="name" aria-invalid={invalid.contact_name || undefined} />
        </label>
        <div className="form-grid two">
          <label className="field">
            {t("Number of people")}
            <input className="input" name="headcount" type="number" inputMode="numeric" required min={minPeople} max={10000} defaultValue={minPeople} aria-invalid={invalid.headcount || undefined} />
          </label>
          <label className="field">
            {t("Preferred date")}
            <span className="hint">{t("Optional")}</span>
            <input className="input" name="preferred_date" type="date" min={bangkokDate(1)} aria-invalid={invalid.preferred_date || undefined} />
          </label>
        </div>
        <fieldset>
          <legend>{t("Where")}</legend>
          <label className="check">
            <input type="radio" name="service_mode" value="center" defaultChecked /> {t("At one of our centers")}
          </label>
          <label className="check">
            <input type="radio" name="service_mode" value="onsite" /> {t("At our workplace (travel fee quoted)")}
          </label>
        </fieldset>
        <label className="field">
          {t("Coordinating center")}
          <select className="input" name="branch_id">
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {t(b.name)}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>
            {t("Packages of interest")} <span className="hint small muted">{t("optional")}</span>
          </legend>
          {packages.map((p) => (
            <label className="check" key={p.id}>
              <input type="checkbox" name="package_ids" value={p.id} defaultChecked={preselect === p.id} /> {p.name}
            </label>
          ))}
        </fieldset>
        <label className="field">
          {t("Anything else")}
          <span className="hint">{t("Shifts, languages, accessibility needs. Do not include health information.")}</span>
          <textarea className="input" name="notes" maxLength={1000} autoComplete="off" />
        </label>
        <p className="field-error" role="alert" hidden={!error}>
          {error}
        </p>
        <div className="form-actions">
          <button className="btn primary" type="submit" disabled={busy} aria-busy={busy || undefined}>
            {busy ? t("Sending…") : t("Send request")}
          </button>
          <span className="small muted">{t("You need a free account to follow the quotation.")}</span>
        </div>
      </form>
      {signedIn && history && history.length ? (
        <div className="stack-sm pub-history">
          <h3 className="h4">{t("Your earlier requests")}</h3>
          <ul className="plain small">
            {history.slice(0, 5).map((r) => (
              <li key={r.id}>
                <strong>{r.data.organization}</strong> · {tf("{n} people", { n: r.data.headcount })} · {r.data.service_mode === "onsite" ? t("At your workplace") : t("At a center")} ·{" "}
                <span className="muted">{when(r.data.at, lang)}</span> <span className="badge neutral">{t(stateLabel(r.state))}</span>
              </li>
            ))}
          </ul>
          <Link className="small" href="/app?view=bookings">
            {t("See quotations in My appointments")}
          </Link>
        </div>
      ) : null}
      {signedIn && historyError ? <p className="small muted">{historyError}</p> : null}
    </section>
  );
}

function stateLabel(state: string) {
  return ({ submitted: "Sent to our team", quoted: "Quotation ready", accepted: "Accepted", declined: "Declined", closed: "Closed" } as Record<string, string>)[state] || state;
}
