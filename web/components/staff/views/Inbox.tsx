"use client";
/* Inbox: customer requests from the website and LINE. Take over before replying; the assistant
   pauses while a person replies. The list and the open case refresh every 4 seconds. */
import { useEffect, useId, useRef, useState } from "react";
import { api, type Conversation } from "@/lib/api/client";
import { bangkokDate, money, when } from "@/lib/format";
import { ActionButton, Badge, Empty, Intro, Skeleton } from "@/components/workspace/ui";
import { useStaff } from "../context";
import { BookingRow, Chip, Kv, Loaded, RefreshButton, StateBadge, Turn, errText, quoteStates, ticketStates, useLoad, type Booking } from "../parts";

type Ticket = {
  id: string;
  state: "waiting" | "staff" | "bot" | "closed";
  branch: string;
  owner: string;
  created: number;
  data: { summary: string; assigned_to?: string; topic?: string; inquiry_id?: string };
};
type Quote = { id: string; state: string; data: { version: number; total_thb: number; people: number; date: string; time?: string; package_id?: string; venue?: string; travel_fee_thb?: number; branch_id?: string } };
type Inquiry = { inquiry: null | { data: Record<string, any> }; quotes: Quote[] };
type ThreadData = { ticket: Ticket; conversation: Conversation; bookings: Booking[] };

const memory = { filter: "open" as "open" | "all" };

export function Inbox() {
  const { t, tf, lang, user, params, dialogOpen, branchName } = useStaff();
  const [filter, setFilter] = useState<"open" | "all">(params.filter === "all" ? "all" : memory.filter);
  const [active, setActive] = useState(params.ticket || "");
  const [tick, setTick] = useState(0);
  const threadRef = useRef<HTMLDivElement>(null);
  const state = useLoad(() => Promise.all([api.get<{ tickets: Ticket[]; metrics: { open: number } }>("/staff/inbox"), api.get<{ bookings: Booking[] }>("/staff/operations")]), []);
  const { reload } = state;

  // Poll every 4 s while the inbox is open, the tab is visible and no dialog is in use.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden || dialogOpen) return;
      reload().catch(() => {});
      setTick((n) => n + 1);
    }, 4000);
    return () => clearInterval(id);
  }, [dialogOpen, reload]);

  const open = (id: string) => {
    setActive(id);
    if (matchMedia("(max-width: 860px)").matches) setTimeout(() => threadRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 50);
  };

  return (
    <div>
      <Intro title={t("Inbox")}>{t("Customer requests from the website and LINE. Take over a case before replying; the assistant pauses while you do.")}</Intro>
      <Loaded state={state}>
        {([d, ops]) => {
          const shown = d.tickets.filter((x) => filter === "all" || x.state !== "closed").reverse();
          const states = ticketStates(t);
          return (
            <>
              <div className="metric-grid">
                {(
                  [
                    [t("Open requests"), d.metrics.open],
                    [t("Waiting for a person"), d.tickets.filter((x) => x.state === "waiting").length],
                    [t("My cases"), d.tickets.filter((x) => x.data.assigned_to === user.id && x.state === "staff").length],
                    [t("Appointments to confirm"), ops.bookings.filter((b) => b.state === "requested").length],
                  ] as [string, number][]
                ).map(([name, n]) => (
                  <div key={name} className="metric">
                    <strong>{n}</strong>
                    <span>{name}</span>
                  </div>
                ))}
              </div>
              <div className="toolbar">
                <Chip pressed={filter === "open"} onClick={() => ((memory.filter = "open"), setFilter("open"))}>
                  {t("Open")}
                </Chip>
                <Chip pressed={filter === "all"} onClick={() => ((memory.filter = "all"), setFilter("all"))}>
                  {t("All")}
                </Chip>
                <RefreshButton run={async () => (await reload(), setTick((n) => n + 1))} />
              </div>
              <div className="staff-grid">
                <div className="staff-list" role="list" aria-label={t("Requests")}>
                  {shown.length ? (
                    shown.map((x) => (
                      <div role="listitem" key={x.id} style={{ display: "contents" }}>
                        <button type="button" className={"ticket-btn" + (x.state === "closed" ? " closed" : "")} aria-current={x.id === active} onClick={() => open(x.id)}>
                          <span className="row">
                            <strong>{x.data.summary.slice(0, 90)}</strong>
                          </span>
                          <small>
                            {states[x.state] || x.state} · {x.branch ? t(branchName(x.branch)) : t("Any center")} · {when(x.created, lang)}
                          </small>
                          {x.state === "waiting" ? <Badge tone="warn">{t("Needs a person")}</Badge> : null}
                          {x.data.topic === "organization" ? <Badge tone="neutral">{t("Organization")}</Badge> : null}
                        </button>
                      </div>
                    ))
                  ) : (
                    <Empty title={t("The queue is clear")}>{filter === "open" ? t("No open requests.") : t("No requests yet.")}</Empty>
                  )}
                </div>
                <div className="staff-thread" ref={threadRef}>
                  {active && d.tickets.some((x) => x.id === active) ? (
                    <Thread key={active} id={active} tick={tick} onChanged={reload} />
                  ) : (
                    <Empty title={t("Select a request")}>{t("Its conversation, related appointments and organization details appear here.")}</Empty>
                  )}
                </div>
              </div>
              <p className="tiny muted sd-footnote">{tf("Updates every {n} seconds while this page is open.", { n: 4 })}</p>
            </>
          );
        }}
      </Loaded>
    </div>
  );
}

function Thread({ id, tick, onChanged }: { id: string; tick: number; onChanged: () => Promise<unknown> }) {
  const { t, tf, user, notice, fail, modal, confirm, branchName } = useStaff();
  const [reply, setReply] = useState("");
  const [replyError, setReplyError] = useState("");
  const messagesRef = useRef<HTMLDivElement>(null);
  const replyId = useId();
  const state = useLoad(() => Promise.all([api.get<ThreadData>("/staff/tickets/" + id), api.get<Inquiry>("/staff/tickets/" + id + "/inquiry")]), [id]);
  const { reload } = state;

  useEffect(() => {
    if (tick) reload().catch(() => {});
  }, [tick, reload]);

  const count = state.data?.[0].conversation.messages.length || 0;
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  if (state.data === null && state.loading) return <Skeleton />;
  if (state.data === null)
    return (
      <Empty title={t("This case cannot be opened")} actions={<ActionButton run={() => reload().catch(() => {})}>{t("Try again")}</ActionButton>}>
        {t(state.error)}
      </Empty>
    );

  const [d, inq] = state.data;
  const x = d.ticket;
  const mine = x.data.assigned_to === user.id;
  const canReply = x.state === "staff" && mine;
  const after = async () => {
    await Promise.all([reload(), onChanged()]);
  };
  const setCase = async (s: "staff" | "bot" | "closed") => {
    await api.post("/staff/tickets/" + id + "/state", { state: s });
    notice(s === "staff" ? t("You took over. The assistant is paused for this customer.") : s === "bot" ? t("Returned to the assistant.") : t("Case closed."));
    await after();
  };
  const send = async () => {
    setReplyError("");
    if (!reply.trim()) {
      setReplyError(t("Write a reply first."));
      return;
    }
    try {
      await api.post("/staff/tickets/" + id + "/messages", { message: reply.trim() });
      setReply("");
      await after();
    } catch (e) {
      setReplyError(errText(e));
    }
  };
  const quotes = inq.quotes.slice().sort((a, b) => b.data.version - a.data.version);
  const i = inq.inquiry?.data;
  const headLabel =
    x.state === "staff" ? (mine ? t("You are replying") : t("With another staff member")) : (ticketStates(t)[x.state] as string) || x.state;

  return (
    <>
      <div className="record-head">
        <h3>{x.data.summary}</h3>
        <Badge tone={x.state === "waiting" ? "warn" : x.state === "staff" && mine ? "accent" : "neutral"}>{headLabel}</Badge>
      </div>
      <div className="record-actions">
        {!(x.state === "staff" && mine) ? (
          <ActionButton className="btn sm primary" run={() => setCase("staff")} onError={fail}>
            {t("Take over")}
          </ActionButton>
        ) : null}
        {x.state !== "bot" ? (
          <ActionButton className="btn sm" run={() => setCase("bot")} onError={fail}>
            {t("Return to assistant")}
          </ActionButton>
        ) : null}
        {x.state !== "closed" ? (
          <button
            type="button"
            className="btn sm ghost"
            onClick={() =>
              confirm({
                title: t("Close this case?"),
                body: <p>{t("The customer is told the request was resolved and the assistant answers again. You can take the case over later if they write back.")}</p>,
                confirmLabel: t("Close case"),
                run: () => setCase("closed"),
              })
            }
          >
            {t("Close case")}
          </button>
        ) : null}
      </div>
      {i ? (
        <section className="card stack-sm">
          <h4>{t("Organization request")}</h4>
          <Kv
            rows={[
              [t("Organization"), i.organization || t("Not given")],
              [t("Contact"), [i.contact_name, i.email].filter(Boolean).join(" · ") || t("Not given")],
              [t("People"), String(i.headcount ?? t("Not given"))],
              [t("Where"), i.service_mode === "onsite" ? t("Onsite at their workplace") : t("At a center")],
              [t("Center"), i.branch_id ? t(branchName(i.branch_id)) : t("Not given")],
              [t("Preferred date"), i.preferred_date || t("Not given")],
              [t("Interested in"), (i.package_ids || []).join(", ") || t("Not given")],
              [t("Notes"), i.notes || t("Not given")],
            ]}
          />
        </section>
      ) : null}
      {quotes.length || i || x.data.topic === "organization" ? (
        <section className="stack-sm">
          <h4>{t("Quotations")}</h4>
          {quotes.map((q) => (
            <div key={q.id} className="row small">
              <strong>v{q.data.version}</strong>
              <span className="num">
                {money(q.data.total_thb)} · {tf("{n} people", { n: q.data.people })} · {q.data.date}
              </span>
              <StateBadge map={quoteStates(t)} value={q.state} />
              <a className="btn ghost sm" href={"/api/business/quotes/" + encodeURIComponent(q.id) + "/document.pdf"} target="_blank" rel="noopener">
                PDF
              </a>
            </div>
          ))}
          {!quotes.some((q) => q.state === "accepted") ? (
            <button
              type="button"
              className={mine ? "btn sm primary" : "btn sm"}
              onClick={() => modal(quotes.length ? t("Revise quotation") : t("Prepare quotation"), <QuoteForm ticketId={id} inq={inq} after={after} />)}
            >
              {quotes.length ? t("Revise quotation (new version)") : t("Prepare quotation")}
            </button>
          ) : null}
        </section>
      ) : null}
      <div className="staff-messages" ref={messagesRef} aria-label={t("Conversation")} aria-live="polite" tabIndex={0}>
        {d.conversation.messages.length ? (
          d.conversation.messages.map((m) => <Turn key={m.id} m={m} />)
        ) : (
          <p className="small muted sd-pad">{t("No chat messages. This case came from a form or appointment change.")}</p>
        )}
      </div>
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label className="sr-only" htmlFor={replyId}>
          {t("Staff reply")}
        </label>
        <textarea
          id={replyId}
          className="input"
          rows={3}
          maxLength={4000}
          autoComplete="off"
          disabled={!canReply}
          placeholder={canReply ? t("Write to the customer…") : t("Take over the case to reply.")}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
        />
        {replyError ? (
          <p className="field-error" role="alert">
            {t(replyError)}
          </p>
        ) : null}
        <div className="form-actions">
          <ActionButton className="btn primary sm" run={send} disabled={!canReply}>
            {t("Send reply")}
          </ActionButton>
          {canReply ? <span className="tiny muted">{t("Ctrl + Enter sends")}</span> : null}
        </div>
      </form>
      {d.bookings.length ? (
        <section className="stack-sm">
          <h4>{t("This customer’s appointments")}</h4>
          <div className="record-list">
            {d.bookings
              .slice()
              .reverse()
              .map((b) => (
                <BookingRow key={b.id} b={b} after={after} />
              ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function QuoteForm({ ticketId, inq, after }: { ticketId: string; inq: Inquiry; after: () => Promise<unknown> }) {
  const { t, tf, user, notice, closeModal, business, biz } = useStaff();
  const latest = inq.quotes.slice().sort((a, b) => b.data.version - a.data.version)[0]?.data;
  const i = inq.inquiry?.data || {};
  const [ready, setReady] = useState(!!biz);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    business().then(
      () => setReady(true),
      (e) => setLoadError(errText(e)),
    );
  }, [business]);
  const packages = (biz?.catalog.packages || []).filter((p) => p.segment === "organization" && p.active !== false);
  const [form, setForm] = useState({
    package_id: latest?.package_id || (i.package_ids || [])[0] || "",
    people: String(latest?.people || i.headcount || 20),
    date: latest?.date || i.preferred_date || "",
    time: latest?.time || "09:00",
    venue: latest?.venue || (i.service_mode === "center" && i.branch_id ? biz?.branches.find((b) => b.id === i.branch_id)?.name || "" : ""),
    travel: String(latest?.travel_fee_thb ?? 0),
    branch: latest?.branch_id || i.branch_id || user.branch || "BKK01",
    note: "",
  });
  const [error, setError] = useState("");
  const ref = useRef<HTMLFormElement>(null);
  const pkg = packages.find((p) => p.id === form.package_id) || packages[0];
  const total = pkg ? pkg.price_thb * Number(form.people || 0) + Number(form.travel || 0) : 0;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const venue = form.venue;

  if (loadError) return <p className="field-error">{t(loadError)}</p>;
  if (!ready) return <Skeleton />;
  return (
    <form
      ref={ref}
      className="form-grid"
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="field">
        <label htmlFor="q-pkg">{t("Organization package")}</label>
        <select id="q-pkg" className="input" value={pkg?.id || ""} onChange={set("package_id")}>
          {packages.map((p) => (
            <option key={p.id} value={p.id}>
              {tf("{name} · {price} per person", { name: p.name, price: money(p.price_thb) })}
            </option>
          ))}
        </select>
      </div>
      <div className="form-grid two">
        <div className="field">
          <label htmlFor="q-people">{t("Number of people")}</label>
          <input id="q-people" className="input" type="number" min={20} max={10000} required value={form.people} onChange={set("people")} />
        </div>
        <div className="field">
          <label htmlFor="q-travel">{t("Travel fee (THB)")}</label>
          <span className="hint">{t("Onsite only")}</span>
          <input id="q-travel" className="input" type="number" min={0} max={20000} value={form.travel} onChange={set("travel")} />
        </div>
        <div className="field">
          <label htmlFor="q-date">{t("Service date")}</label>
          <input id="q-date" className="input" type="date" required min={bangkokDate(1)} value={form.date} onChange={set("date")} />
        </div>
        <div className="field">
          <label htmlFor="q-time">{t("Start time")}</label>
          <input id="q-time" className="input" type="time" required value={form.time} onChange={set("time")} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="q-venue">{t("Venue")}</label>
        <input id="q-venue" className="input" required maxLength={250} value={venue} onChange={set("venue")} />
      </div>
      <div className="field">
        <label htmlFor="q-branch">{t("Coordinating center")}</label>
        <select id="q-branch" className="input" value={form.branch} onChange={set("branch")}>
          {(biz?.branches || []).map((b) => (
            <option key={b.id} value={b.id}>
              {t(b.name)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="q-note">{t("Note to customer")}</label>
        <span className="hint">{t("Optional, shown on the quotation")}</span>
        <textarea id="q-note" className="input" maxLength={500} value={form.note} onChange={set("note")} />
      </div>
      <p className="total" aria-live="polite">
        {tf("Total {amount}", { amount: money(total) })}
      </p>
      {error ? (
        <p className="field-error" role="alert">
          {t(error)}
        </p>
      ) : null}
      <p className="small muted">
        {inq.quotes.length ? t("Issuing creates a new version and supersedes the open one. The customer is notified.") : t("The customer is notified and can download and accept it.")}
      </p>
      <div className="form-actions">
        <ActionButton
          className="btn primary"
          run={async () => {
            setError("");
            if (!ref.current?.reportValidity()) return;
            try {
              await api.post("/staff/quotes", {
                ticket_id: ticketId,
                package_id: pkg?.id,
                people: Number(form.people),
                date: form.date,
                time: form.time,
                venue,
                travel_fee_thb: Number(form.travel || 0),
                branch_id: form.branch,
                note: form.note,
              });
              closeModal();
              notice(t("Quotation issued to the customer."));
              await after();
            } catch (e) {
              setError(errText(e));
            }
          }}
        >
          {t("Issue quotation")}
        </ActionButton>
        <button type="button" className="btn ghost" onClick={closeModal}>
          {t("Cancel")}
        </button>
      </div>
    </form>
  );
}
