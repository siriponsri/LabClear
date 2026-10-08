"use client";
/* Customers in the staff member's scope. Report values and chat text stay private; staff read a
   conversation only through its case. */
import { useState } from "react";
import { api } from "@/lib/api/client";
import { ago, longDate, money } from "@/lib/format";
import { Badge, Empty, Intro, Skeleton } from "@/components/workspace/ui";
import { useStaff } from "../context";
import { Loaded, StateBadge, bookingStates, methodLabel, paymentStates, payStates, quoteStates, ticketStates, useLoad } from "../parts";

type Row = { id: string; label: string; channel: string; bookings: number; requested: number; open_cases: number; paid_thb: number; last_activity: number };
type Detail = {
  customer: { id: string; label: string; channel: string };
  bookings: { id: string; state: string; branch: string; items: { name: string }[]; date: string; time: string; total_thb: number; payment_status: string }[];
  tickets: { id: string; state: string; summary: string }[];
  quotes: { id: string; state: string; version: number; total_thb: number; people: number; date: string }[];
  payments: { id: string; reference: string; amount_thb: number; method: string; state: string }[];
  reports: { count: number; confirmed: number };
  plan: { plan: string; plan_name: string; active: boolean; period_end: number; ai_reads_used: number } | null;
};

const memory = { q: "" };

export function Customers() {
  const { t, tf, lang, manager, modal } = useStaff();
  const [draft, setDraft] = useState(memory.q);
  const [q, setQ] = useState(memory.q);
  const state = useLoad(() => api.get<{ customers: Row[]; total: number }>("/staff/customers?" + new URLSearchParams({ q })), [q]);
  const openDetail = (c: Row) => modal(c.label, <CustomerDetail id={c.id} />);
  const channel = (c: string) => t(c);
  return (
    <div>
      <Intro title={t("Customers")}>
        {manager
          ? t("People with an appointment, case, quotation or payment at your centers. Report values and chat text stay private; read a conversation through its case.")
          : t("People with an appointment, case, quotation or payment at your center. Report values and chat text stay private; read a conversation through its case.")}
      </Intro>
      <form
        className="toolbar"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          memory.q = draft.trim();
          setQ(draft.trim());
        }}
      >
        <input className="input" type="search" placeholder={t("Search by email")} maxLength={80} value={draft} aria-label={t("Search customers")} onChange={(e) => setDraft(e.target.value)} />
        <button type="submit" className="btn sm">
          {t("Search")}
        </button>
        <span className="small muted" aria-live="polite">
          {state.data ? tf("{n} customers", { n: state.data.total }) : ""}
        </span>
      </form>
      <Loaded state={state} title={t("Customers could not be loaded")}>
        {(d) =>
          d.customers.length ? (
            <div className="table-wrap" aria-busy={state.loading || undefined}>
              <table className="data sd-table">
                <thead>
                  <tr>
                    <th scope="col">{t("Customer")}</th>
                    <th scope="col" className="n">
                      {t("Appointments")}
                    </th>
                    <th scope="col" className="n">
                      {t("Awaiting")}
                    </th>
                    <th scope="col" className="n">
                      {t("Open cases")}
                    </th>
                    <th scope="col" className="n">
                      {t("Paid (simulated)")}
                    </th>
                    <th scope="col">{t("Last activity")}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.customers.map((c) => (
                    <tr key={c.id} className="clickable" onClick={(e) => (e.target as HTMLElement).closest("button") || openDetail(c)}>
                      <td data-label={t("Customer")} className="sd-cell-title">
                        <button type="button" className="link-btn" onClick={() => openDetail(c)}>
                          {c.label}
                        </button>
                        <span className="sub">{channel(c.channel)}</span>
                      </td>
                      <td data-label={t("Appointments")} className="n">
                        {c.bookings}
                      </td>
                      <td data-label={t("Awaiting")} className="n">
                        {c.requested ? <Badge tone="warn">{c.requested}</Badge> : 0}
                      </td>
                      <td data-label={t("Open cases")} className="n">
                        {c.open_cases}
                      </td>
                      <td data-label={t("Paid (simulated)")} className="n">
                        {money(c.paid_thb)}
                      </td>
                      <td data-label={t("Last activity")}>{c.last_activity ? ago(c.last_activity, lang) : t("Not yet")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title={q ? t("No customer matches") : t("No customers yet")}>{q ? t("Try part of the email address.") : t("Customers appear after their first request or case.")}</Empty>
          )
        }
      </Loaded>
    </div>
  );
}

function CustomerDetail({ id }: { id: string }) {
  const { t, tf, lang, closeModal, navigate, branchName } = useStaff();
  const state = useLoad(() => api.get<Detail>("/staff/customers/" + encodeURIComponent(id)), [id]);
  if (state.data === null && state.loading) return <Skeleton />;
  if (state.data === null) return <p className="field-error">{t(state.error)}</p>;
  const d = state.data;
  const block = (title: string, rows: React.ReactNode[], empty: string) => (
    <section className="history-block">
      <h4>{title}</h4>
      {rows.length ? rows : <p className="small muted">{empty}</p>}
    </section>
  );
  return (
    <div className="stack">
      <p className="small muted">
        {t(d.customer.channel)} · {t("reference")} {d.customer.id.slice(-8)}
      </p>
      {block(
        t("Appointments"),
        d.bookings
          .slice()
          .reverse()
          .map((b) => (
            <div key={b.id} className="history-row">
              <strong>{(b.items || []).map((i) => i.name).join(" + ")}</strong>
              <span>
                {longDate(b.date, lang)}, {b.time}
              </span>
              <span>{t(branchName(b.branch))}</span>
              <span className="num">{money(b.total_thb)}</span>
              <StateBadge map={bookingStates(t)} value={b.state} />
              <StateBadge map={paymentStates(t)} value={b.payment_status} />
            </div>
          )),
        t("No appointments."),
      )}
      {block(
        t("Cases"),
        d.tickets
          .slice()
          .reverse()
          .map((x) => (
            <div key={x.id} className="history-row">
              <span>{x.summary.slice(0, 80)}</span>
              <Badge tone={x.state === "waiting" ? "warn" : "neutral"}>{ticketStates(t)[x.state] || x.state}</Badge>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => {
                  closeModal();
                  navigate("staff", { ticket: x.id, filter: "all" });
                }}
              >
                {t("Open case")}
              </button>
            </div>
          )),
        t("No cases."),
      )}
      {block(
        t("Quotations"),
        d.quotes.map((q) => (
          <div key={q.id} className="history-row">
            <strong>{tf("Version {n}", { n: q.version })}</strong>
            <span>
              {tf("{n} people", { n: q.people })}, {q.date}
            </span>
            <span className="num">{money(q.total_thb)}</span>
            <StateBadge map={quoteStates(t)} value={q.state} />
            <a className="btn ghost sm" href={"/api/business/quotes/" + encodeURIComponent(q.id) + "/document.pdf"} target="_blank" rel="noopener">
              PDF
            </a>
          </div>
        )),
        t("No quotations."),
      )}
      {block(
        t("Test payments"),
        d.payments
          .slice()
          .reverse()
          .map((p) => (
            <div key={p.id} className="history-row">
              <span>{p.reference}</span>
              <span className="num">{money(p.amount_thb)}</span>
              <span>{methodLabel(t, p.method)}</span>
              <StateBadge map={payStates(t)} value={p.state} />
            </div>
          )),
        t("No test payments."),
      )}
      <p className="small muted">
        {d.reports.count ? tf("{n} reports uploaded, {c} confirmed. Values stay private to the customer.", { n: d.reports.count, c: d.reports.confirmed }) : t("No reports uploaded.")}
      </p>
      {d.plan ? (
        <p className="small muted">
          {tf("Lab Report plan: {plan}", { plan: t(d.plan.plan_name) })}
          {d.plan.active && d.plan.period_end ? " · " + tf("until {date}", { date: new Date(d.plan.period_end * 1000).toLocaleDateString(lang === "th" ? "th-TH" : "en-GB") }) : ""}
          {" · "}
          {tf("AI readings used: {n}", { n: d.plan.ai_reads_used })}
        </p>
      ) : null}
    </div>
  );
}
