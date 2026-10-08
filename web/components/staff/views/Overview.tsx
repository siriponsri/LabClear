"use client";
/* Overview: the decision of the day (requests only a person can confirm), KPIs, funnel, capacity. */
import { useState } from "react";
import { api } from "@/lib/api/client";
import { money } from "@/lib/format";
import { Badge, Intro } from "@/components/workspace/ui";
import { useStaff } from "../context";
import { BookingRow, Loaded, RefreshButton, Tile, clock, payStates, quoteStates, dayLabel, useLoad, type Booking } from "../parts";

// Remembered while the page is open, like the 3.x desk.
const memory = { branch: "", days: 7 };
const rampStep = (u: number) => (u <= 0 ? 0 : u < 0.25 ? 1 : u < 0.5 ? 2 : u < 0.75 ? 3 : 4);

type Dashboard = {
  generated_at: number;
  scope: string[];
  bookings: { by_state: Record<string, number>; awaiting_oldest_minutes: number; upcoming_confirmed: number };
  funnel: { requested: number; confirmed: number; paid: number };
  money: { paid_thb: number; unpaid_confirmed_thb: number; refunded_thb: number; test_payments: Record<string, number> };
  capacity: { branch_id: string; name: string; days: { date: string; used: number; capacity: number }[]; utilization: number }[];
  tickets: { open: number; waiting: number; with_staff: number; median_first_response_minutes: number | null };
  quotes: { offered: number; accepted: number; superseded: number; accepted_thb: number };
  assistant: Record<string, number>;
  lab_reports: null | { plus_active: number; plus_revenue_thb: number; plus_refunded_thb: number; ai_reads: number; reports_confirmed: number; price_thb: number };
};

export function Overview() {
  const { t, tf, lang, manager, navigate, biz, branchName } = useStaff();
  const [branch, setBranch] = useState(memory.branch);
  const [days, setDays] = useState(memory.days);
  const state = useLoad(
    () =>
      Promise.all([
        api.get<Dashboard>("/staff/dashboard?" + new URLSearchParams({ branch, days: String(days) })),
        api.get<{ bookings: Booking[] }>("/staff/operations"),
      ]),
    [branch, days],
  );

  return (
    <div>
      <Intro title={t("Overview")}>{t("Every number is computed from stored appointments, cases, quotations and payments. Money values are simulated.")}</Intro>
      <div className="toolbar">
        {manager ? (
          <select
            className="input"
            aria-label={t("Center")}
            value={branch}
            onChange={(e) => {
              memory.branch = e.target.value;
              setBranch(e.target.value);
            }}
          >
            <option value="">{t("All centers")}</option>
            {(biz?.branches || []).map((b) => (
              <option key={b.id} value={b.id}>
                {t(b.name)}
              </option>
            ))}
          </select>
        ) : state.data ? (
          <Badge tone="neutral">{tf("Your center: {name}", { name: t(branchName(state.data[0].scope[0])) })}</Badge>
        ) : null}
        <select
          className="input"
          aria-label={t("Days ahead")}
          value={days}
          onChange={(e) => {
            memory.days = Number(e.target.value);
            setDays(Number(e.target.value));
          }}
        >
          <option value={7}>{t("Next 7 open days")}</option>
          <option value={14}>{t("Next 14 open days")}</option>
        </select>
        {state.data ? <span className="small muted">{tf("Updated {time}", { time: clock(state.data[0].generated_at, lang) })}</span> : null}
        <RefreshButton run={state.reload} />
      </div>
      <Loaded state={state}>
        {([d, ops]) => {
          const waiting = ops.bookings
            .filter((b) => b.state === "requested" && (!branch || b.branch === branch))
            .sort((a, b) => (a.data.requested_at || 0) - (b.data.requested_at || 0));
          const max = Math.max(1, d.funnel.requested);
          const assistant = Object.entries(d.assistant);
          return (
            <>
              <section className="decide" aria-labelledby="sd-decide">
                <div className="decide-head">
                  <h3 id="sd-decide">{waiting.length ? tf("{n} requests wait for you", { n: waiting.length }) : t("No requests are waiting")}</h3>
                  <span className="small muted">
                    {waiting.length ? t("Oldest first. The customer is notified of either decision.") : t("New appointment requests appear here first.")}
                  </span>
                </div>
                {waiting.length ? (
                  <div className="record-list">
                    {waiting.slice(0, 4).map((b) => (
                      <BookingRow key={b.id} b={b} after={state.reload} />
                    ))}
                  </div>
                ) : null}
                {waiting.length > 4 ? (
                  <p className="small">
                    <button type="button" className="link-btn" onClick={() => navigate("operations", { filter: "requested" })}>
                      {tf("See all {n} requests", { n: waiting.length })}
                    </button>
                  </p>
                ) : null}
              </section>
              <div className="kpi-grid">
                <Tile
                  label={t("Awaiting confirmation")}
                  value={String(d.bookings.by_state.requested)}
                  sub={
                    d.bookings.by_state.requested
                      ? d.bookings.awaiting_oldest_minutes < 1
                        ? t("Oldest just now")
                        : tf("Oldest {n} min", { n: d.bookings.awaiting_oldest_minutes })
                      : t("Nothing waiting")
                  }
                  onClick={() => navigate("operations", { filter: "requested" })}
                />
                <Tile label={t("Upcoming confirmed")} value={String(d.bookings.upcoming_confirmed)} sub={t("From today")} />
                <Tile label={t("Open cases")} value={String(d.tickets.open)} sub={tf("{n} waiting for a person", { n: d.tickets.waiting })} onClick={() => navigate("staff")} />
                <Tile
                  label={t("Median first reply")}
                  value={d.tickets.median_first_response_minutes === null ? t("None yet") : tf("{n} min", { n: d.tickets.median_first_response_minutes })}
                  sub={t("From case creation to a staff reply")}
                />
                <Tile label={t("Paid (simulated)")} value={money(d.money.paid_thb)} sub={tf("Refunded {amount}", { amount: money(d.money.refunded_thb) })} onClick={() => navigate("payments")} />
                <Tile label={t("Confirmed, unpaid")} value={money(d.money.unpaid_confirmed_thb)} sub={t("Pay at center or test payment")} />
              </div>
              <div className="dash-grid">
                <section className="stack-sm" aria-labelledby="sd-funnel">
                  <h3 id="sd-funnel">{t("Individual appointments")}</h3>
                  <p className="small muted">{t("Requests that reached confirmation and payment.")}</p>
                  {(
                    [
                      [t("Requested"), d.funnel.requested],
                      [t("Confirmed"), d.funnel.confirmed],
                      [t("Paid"), d.funnel.paid],
                    ] as [string, number][]
                  ).map(([label, n]) => (
                    <div key={label} className="bar-row">
                      <span className="small">{label}</span>
                      <div className="bar-track" aria-hidden="true">
                        <span className="bar-fill" style={{ width: (n / max) * 100 + "%" }} />
                      </div>
                      <strong className="num">{n}</strong>
                    </div>
                  ))}
                </section>
                <section className="stack-sm" aria-labelledby="sd-capacity">
                  <h3 id="sd-capacity">{t("Capacity used")}</h3>
                  <p className="small muted">{t("Requested and confirmed visits against slots (18 half-hours × visits per slot), Monday to Saturday.")}</p>
                  <div className="heat-wrap">
                    <table className="heat" aria-label={t("Capacity used per center and day")}>
                      <thead>
                        <tr>
                          <th scope="col">{t("Center")}</th>
                          {(d.capacity[0]?.days || []).map((x) => (
                            <th key={x.date} scope="col">
                              {dayLabel(x.date, lang)}
                            </th>
                          ))}
                          <th scope="col">{t("Used")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.capacity.map((b) => (
                          <tr key={b.branch_id}>
                            <th scope="row">{t(b.name).replace(/ Demo Center$/, "")}</th>
                            {b.days.map((x) => {
                              const u = x.capacity ? x.used / x.capacity : 0;
                              return (
                                <td key={x.date} className={"num heat-" + rampStep(u)} title={tf("{center}, {date}: {used} of {capacity} visits", { center: t(b.name), date: x.date, used: x.used, capacity: x.capacity })}>
                                  {x.used}/{x.capacity}
                                </td>
                              );
                            })}
                            <td className="num strong">{Math.round(b.utilization * 100)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="legend small" aria-hidden="true">
                    <span>{t("Less")}</span>
                    {[0, 1, 2, 3, 4].map((n) => (
                      <span key={n} className={"swatch heat-" + n} />
                    ))}
                    <span>{t("More used")}</span>
                  </div>
                </section>
                <section className="stack-sm" aria-labelledby="sd-pay">
                  <h3 id="sd-pay">{t("Test payments")}</h3>
                  <p className="small muted">{t("Simulator transactions by outcome. No real money.")}</p>
                  <table className="data compact">
                    <tbody>
                      {Object.entries(d.money.test_payments).map(([k, v]) => (
                        <tr key={k}>
                          <td>{(payStates(t)[k] || [k])[0]}</td>
                          <td className="n">{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button type="button" className="btn sm" onClick={() => navigate("payments")}>
                    {t("Open payments")}
                  </button>
                </section>
                <section className="stack-sm" aria-labelledby="sd-quotes">
                  <h3 id="sd-quotes">{t("Organization quotations")}</h3>
                  <table className="data compact">
                    <tbody>
                      {(
                        [
                          [quoteStates(t).offered[0], d.quotes.offered],
                          [quoteStates(t).accepted[0], d.quotes.accepted],
                          [quoteStates(t).superseded[0], d.quotes.superseded],
                          [t("Accepted value"), money(d.quotes.accepted_thb)],
                        ] as [string, string | number][]
                      ).map(([k, v]) => (
                        <tr key={k}>
                          <td>{k}</td>
                          <td className="n">{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
                {manager ? (
                  <section className="stack-sm" aria-labelledby="sd-assistant">
                    <h3 id="sd-assistant">{t("Assistant")}</h3>
                    <p className="small muted">{t("Answers by role, and turns that could not be answered.")}</p>
                    {assistant.length ? (
                      <table className="data compact">
                        <tbody>
                          {assistant.map(([k, v]) => (
                            <tr key={k}>
                              <td>{t(k)}</td>
                              <td className="n">{v}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="small muted">{t("No assistant answers yet.")}</p>
                    )}
                    <button type="button" className="btn sm" onClick={() => navigate("roles")}>
                      {t("Manage assistant roles")}
                    </button>
                  </section>
                ) : null}
                {d.lab_reports ? (
                  <section className="stack-sm" aria-labelledby="sd-lab">
                    <h3 id="sd-lab">{t("AI Lab Report")}</h3>
                    <p className="small muted">{tf("Company-wide. Plus is {price} for 30 days (test payments).", { price: money(d.lab_reports.price_thb) })}</p>
                    <table className="data compact">
                      <tbody>
                        {(
                          [
                            [t("Plus active now"), d.lab_reports.plus_active],
                            [t("Plus revenue (simulated)"), money(d.lab_reports.plus_revenue_thb)],
                            [t("Plus refunded"), money(d.lab_reports.plus_refunded_thb)],
                            [t("AI readings used"), d.lab_reports.ai_reads],
                            [t("Reports confirmed"), d.lab_reports.reports_confirmed],
                          ] as [string, string | number][]
                        ).map(([k, v]) => (
                          <tr key={k}>
                            <td>{k}</td>
                            <td className="n">{v}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                ) : null}
              </div>
            </>
          );
        }}
      </Loaded>
    </div>
  );
}
