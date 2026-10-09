"use client";
/* My appointments: requests, confirmed visits, test payments, calendar files and organization
   quotations (accept, PDF, versions). Every action is a server call. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { bangkokDate, longDate, money, when } from "@/lib/format";
import { useWorkspace, type WorkspaceState } from "../context";
import { Badge, Empty } from "../ui";
import { Act, bookingState, dayText, freshState, LoadError, Loading, paymentState, SlotPicker, StatusBadge, useConfirm, useLoad } from "./shared";

type Booking = { id: string; state: string; branch: string; created: number; data: any };
type Quote = { id: string; state: string; created: number; data: any };

function RescheduleDialog({ b, branchName, onDone }: { b: Booking; branchName: string; onDone: () => Promise<unknown> }) {
  const { api, t, notice, closeModal } = useWorkspace();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [err, setErr] = useState("");
  return (
    <div className="form-grid">
      <p className="small muted">
        {t("Changing the time sends the appointment back to our team for confirmation.")}{" "}
        {b.state === "confirmed" ? t("Changes less than 24 hours before the slot go to staff review.") : null}
      </p>
      <dl className="kv">
        <dt>{t("Center")}</dt>
        <dd>{branchName}</dd>
      </dl>
      <div className="field">
        <label htmlFor="resched-date">{t("New date")}</label>
        <span className="hint" id="resched-hint">
          {t("Monday to Saturday, up to 30 days ahead")}
        </span>
        <input
          id="resched-date"
          className="input"
          type="date"
          min={bangkokDate(0)}
          max={bangkokDate(30)}
          aria-describedby="resched-hint"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setTime("");
          }}
        />
      </div>
      <SlotPicker branchId={b.branch} date={date} value={time} onPick={setTime} />
      {err ? (
        <p className="field-error" role="alert">
          {err}
        </p>
      ) : null}
      <Act
        className="btn primary"
        run={async () => {
          if (!date || !time) {
            setErr(t("Choose a date and an available time."));
            return;
          }
          const r = await api.post("/bookings/" + encodeURIComponent(b.id) + "/change", { operation: "reschedule", date, time });
          closeModal();
          notice(r.kind === "ticket" ? t("Within 24 hours, so our team will review the change.") : t("New time requested. Awaiting confirmation."));
          await onDone();
        }}
      >
        {t("Request new time")}
      </Act>
    </div>
  );
}

function QuoteGroup({ versions, reload }: { versions: Quote[]; reload: () => Promise<unknown> }) {
  const { api, t, tf, lang, notice } = useWorkspace();
  const confirm = useConfirm();
  const [latest, ...older] = versions;
  const d = latest.data;
  const tone: Record<string, [string, "warn" | "ok" | "neutral"]> = {
    offered: [t("Ready to review"), "warn"],
    accepted: [t("Accepted"), "ok"],
    superseded: [t("Superseded by a newer version"), "neutral"],
  };
  const pdf = (q: Quote) => "/api/business/quotes/" + encodeURIComponent(q.id) + "/document.pdf";
  const [label, badgeTone] = tone[latest.state] || [latest.state, "neutral"];
  return (
    <article className="record">
      <div className="record-head">
        <h3>{tf("{name} · version {n}", { name: d.items?.[0]?.name || t("Quotation"), n: d.version || 1 })}</h3>
        <Badge tone={badgeTone}>{label}</Badge>
      </div>
      <div className="record-meta">
        <span>{tf("Total {amount}", { amount: money(d.total_thb) })}</span>
        <span>{tf("{n} people", { n: d.people })}</span>
        {d.date ? <span>{longDate(d.date, lang) + (d.time ? ", " + d.time : "")}</span> : null}
        {d.venue ? <span>{d.venue}</span> : null}
        {d.expires ? <span>{tf("Valid until {date}", { date: dayText(d.expires, lang) })}</span> : null}
      </div>
      {d.note ? <p className="small">{tf("Note: {note}", { note: d.note })}</p> : null}
      <div className="record-actions">
        <a className="btn sm" href={pdf(latest)} download>
          {t("Download quotation (PDF)")}
        </a>
        {latest.state === "offered" ? (
          <button
            type="button"
            className="btn sm primary"
            onClick={() =>
              confirm(
                t("Accept organization quotation"),
                tf("Accept version {v}: {people} people, {total} in total. Accepting creates the service appointment; payment is arranged with our team. This is not a tax invoice.", {
                  v: d.version || 1,
                  people: d.people,
                  total: money(d.total_thb),
                }),
                t("Accept quotation"),
                async () => {
                  try {
                    await api.post("/quotes/accept", { quote_id: latest.id });
                    notice(t("Quotation accepted."));
                  } finally {
                    await reload();
                  }
                },
                false,
              )
            }
          >
            {t("Review and accept")}
          </button>
        ) : null}
      </div>
      {older.length ? (
        <details className="quote-versions">
          <summary>{tf("Earlier versions ({n})", { n: older.length })}</summary>
          <ul className="plain">
            {older.map((q) => (
              <li key={q.id}>
                <span>
                  {tf("Version {n}", { n: q.data.version || 1 })} · {money(q.data.total_thb)} · {(tone[q.state] || [q.state])[0]}
                </span>
                <a className="link-btn" href={pdf(q)} download>
                  {t("PDF")}
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}

function BookingRecord({ b, s, branchName, reload }: { b: Booking; s: WorkspaceState; branchName: (id: string) => string; reload: () => Promise<unknown> }) {
  const { api, t, tf, lang, modal, notice } = useWorkspace();
  const router = useRouter();
  const confirm = useConfirm();
  const d = b.data;
  const txn = (s.payments || []).find((x) => x.booking_id === b.id && x.state === "pending");
  const paid = d.payment_status === "paid";
  const pay = async (method: "promptpay" | "card") => {
    const r = await api.post("/payments/checkout", { booking_id: b.id, method });
    if (r.simulator_url) return router.push(r.simulator_url);
    if (r.url) return void location.assign(r.url);
    notice(t(r.message || "Payment method recorded."));
    await reload();
  };
  const reschedule = () => modal(t("Change appointment time"), <RescheduleDialog b={b} branchName={branchName(b.branch)} onDone={reload} />);
  return (
    <article className="record">
      <div className="record-head">
        <h3>{(d.items || []).map((i: { name: string }) => i.name).join(" + ")}</h3>
        <StatusBadge map={bookingState(t)} value={b.state} />
        <StatusBadge map={paymentState(t)} value={d.payment_status} />
      </div>
      <div className="record-meta">
        <span>{tf("{date}, {time} Bangkok time", { date: longDate(d.date, lang), time: d.time })}</span>
        <span>{d.organization ? d.venue || t("Organization service") : branchName(b.branch)}</span>
        <span>{money(d.total_thb)}</span>
        <span>{tf("Ref {ref}", { ref: b.id.slice(-8) })}</span>
      </div>
      {b.state === "declined" && d.decision_note ? <p className="small">{tf("From our team: {note}", { note: d.decision_note })}</p> : null}
      {d.last_payment_outcome && d.payment_status === "pending" && !txn ? (
        <p className="small muted">{tf("Last test payment: {outcome}. You can try again or pay at the center.", { outcome: t(d.last_payment_outcome) })}</p>
      ) : null}
      {b.state === "requested" ? <p className="small muted">{t("Our team will confirm or decline this request. You will get a notification.")}</p> : null}
      {b.state === "confirmed" && d.payment_status === "pending" && !txn && !d.organization ? (
        <p className="small muted">{t("Pay at the center on the day, or now with a test payment that moves no real money.")}</p>
      ) : null}
      {b.state === "requested" || b.state === "confirmed" ? (
        <div className="record-actions">
          {b.state === "confirmed" && !d.organization ? (
            <a className="btn sm" href={"/api/business/bookings/" + encodeURIComponent(b.id) + "/calendar.ics"} download>
              {t("Add to calendar (.ics)")}
            </a>
          ) : null}
          {b.state === "confirmed" && d.payment_status === "pending" ? (
            txn ? (
              <a className="btn sm primary" href={"/pay/sim/" + encodeURIComponent(txn.id)}>
                {t("Continue test payment")}
              </a>
            ) : !d.organization ? (
              <>
                <Act className="btn sm primary" run={() => pay("promptpay")}>
                  {t("Pay with test PromptPay")}
                </Act>
                <Act className="btn sm" run={() => pay("card")}>
                  {t("Pay with test card")}
                </Act>
              </>
            ) : null
          ) : null}
          {!d.organization ? (
            <button type="button" className="btn sm" onClick={reschedule}>
              {t("Change time")}
            </button>
          ) : null}
          {b.state === "requested" ? (
            <button
              type="button"
              className="btn sm danger"
              onClick={() =>
                confirm(t("Withdraw request"), t("Withdraw this appointment request? The time slot is released."), t("Withdraw request"), async () => {
                  await api.post("/bookings/" + encodeURIComponent(b.id) + "/change", { operation: "cancel" });
                  notice(t("Request withdrawn."));
                  await reload();
                })
              }
            >
              {t("Withdraw request")}
            </button>
          ) : (
            <button
              type="button"
              className="btn sm danger"
              onClick={() =>
                confirm(
                  paid ? t("Request a refund") : t("Cancel appointment"),
                  paid ? t("Refunds are reviewed by our team; approval is not guaranteed.") : t("Cancelling 24 hours or more before the slot is immediate. Closer to the time, our team reviews it."),
                  paid ? t("Request refund") : t("Cancel appointment"),
                  async () => {
                    const res = await api.post("/bookings/" + encodeURIComponent(b.id) + "/change", { operation: paid ? "refund_request" : "cancel" });
                    notice(res.kind === "ticket" ? t("Sent to our team for review.") : t("Appointment cancelled."));
                    await reload();
                  },
                )
              }
            >
              {paid ? t("Request refund") : t("Cancel appointment")}
            </button>
          )}
        </div>
      ) : null}
    </article>
  );
}

export function BookingsView() {
  const { t, tf, lang, refresh, business, navigate, ask, user, requireAccount } = useWorkspace();
  const res = useLoad(async () => {
    const [s, biz] = await Promise.all([freshState(refresh), business()]);
    return { s, branches: biz.branches };
  });
  const reload = () => res.reload(true);

  const intro = (
    <div className="view-intro">
      <h2>{t("My appointments")}</h2>
      <p>{t("Requests, confirmed visits, payments and organization quotations. A confirmed appointment and a paid order are separate states.")}</p>
    </div>
  );
  const toolbar = (
    <div className="toolbar">
      <button type="button" className="btn primary sm" onClick={() => navigate("book")}>
        {t("Request an appointment")}
      </button>
      <Act className="btn ghost sm" run={reload} disabled={res.loading}>
        {t("Refresh")}
      </Act>
    </div>
  );
  if (res.error) return (<div>{intro}<LoadError error={res.error} retry={() => res.reload()} /></div>);
  if (!res.data) return (<div>{intro}<Loading rows={3} /></div>);

  const { s, branches } = res.data;
  const branchName = (id: string) => t(branches.find((b) => b.id === id)?.name || id);
  const quotes: Quote[] = (s.quotes || []).slice().sort((a, b) => (b.data.version || 1) - (a.data.version || 1));
  const groups = new Map<string, Quote[]>();
  for (const q of quotes) {
    const k = q.data.ticket_id || q.id;
    groups.set(k, [...(groups.get(k) || []), q]);
  }
  const waiting = (s.inquiries || []).filter((i) => !quotes.some((q) => q.data.ticket_id === i.data.ticket_id));
  const bookings: Booking[] = (s.bookings || []).slice().reverse();

  return (
    <div>
      {intro}
      {toolbar}
      {groups.size || waiting.length ? (
        <>
          <div className="section-title">
            <h2>{t("Organization quotations")}</h2>
          </div>
          <div className="record-list">
            {waiting.map((i) => (
              <article className="record" key={i.id}>
                <div className="record-head">
                  <h3>{i.data.organization}</h3>
                  <Badge tone="warn">{t("Waiting for quotation")}</Badge>
                </div>
                <p className="small muted">
                  {tf("{n} people · {mode} · requested {date}", {
                    n: i.data.headcount,
                    mode: i.data.service_mode === "onsite" ? t("onsite") : t("at center"),
                    date: when(i.data.at, lang),
                  })}
                </p>
              </article>
            ))}
            {[...groups.entries()].map(([k, v]) => (
              <QuoteGroup key={k} versions={v} reload={reload} />
            ))}
          </div>
        </>
      ) : null}
      <div className="section-title">
        <h2>{t("Appointments")}</h2>
      </div>
      {!bookings.length ? (
        <Empty
          title={t("No appointments yet")}
          actions={
            <>
              <button type="button" className="btn primary sm" onClick={() => navigate("book")}>
                {t("Request an appointment")}
              </button>
              <button type="button" className="btn sm" onClick={() => ask(t("Help me choose a package and book a visit."), true)}>
                {t("Ask the assistant")}
              </button>
              {!user?.registered ? (
                <button type="button" className="btn sm ghost" onClick={() => requireAccount(t("Sign in to see the appointments saved in your account."))}>
                  {t("Sign in")}
                </button>
              ) : null}
            </>
          }
        >
          {t("Request a time directly, or ask the assistant to help you choose.")}
        </Empty>
      ) : (
        <div className="record-list" aria-busy={res.loading || undefined}>
          {bookings.map((b) => (
            <BookingRecord key={b.id} b={b} s={s} branchName={branchName} reload={reload} />
          ))}
        </div>
      )}
    </div>
  );
}
