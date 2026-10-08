"use client";
/* Payments: test payments from the simulator and receipts recorded at the center. */
import { useState } from "react";
import { api } from "@/lib/api/client";
import { money, when } from "@/lib/format";
import { Empty, Intro } from "@/components/workspace/ui";
import { useStaff } from "../context";
import { Chip, Loaded, ReasonForm, RefreshButton, StateBadge, methodLabel, payStates, useLoad } from "../parts";

type Payment = {
  id: string;
  kind: "subscription" | "test_payment" | "center_receipt";
  state: string;
  method: string;
  amount_thb: number;
  reference: string;
  booking_id: string;
  created: number;
  items: string[];
  customer: string;
  events: number;
};
type Data = { payments: Payment[]; totals: Record<string, number>; money: { succeeded_thb: number; center_thb: number; refunded_thb: number; plus_thb?: number } };

const memory = { state: "" };

export function Payments() {
  const { t, tf, lang, manager, modal, notice } = useStaff();
  const [filter, setFilter] = useState(memory.state);
  const state = useLoad(async () => {
    const all = await api.get<Data>("/staff/payments");
    const shown = filter ? await api.get<Data>("/staff/payments?state=" + filter) : all;
    return { all, shown };
  }, [filter]);
  const pick = (k: string) => {
    memory.state = k;
    setFilter(k);
  };
  return (
    <div>
      <Intro title={t("Payments")}>{t("Test payments from the simulator and receipts recorded at the center. No real money moves in this release.")}</Intro>
      <Loaded state={state}>
        {({ all, shown }) => {
          const labels = payStates(t);
          return (
            <>
              <p className="money-line">
                {(
                  [
                    [t("Succeeded"), all.money.succeeded_thb],
                    [t("of which Plus"), all.money.plus_thb || 0],
                    [t("Paid at center"), all.money.center_thb],
                    [t("Refunded"), all.money.refunded_thb],
                  ] as [string, number][]
                ).map(([k, v]) => (
                  <span key={k}>
                    {k} <strong className="num">{money(v)}</strong>
                  </span>
                ))}
              </p>
              <div className="toolbar" role="group" aria-label={t("Show payments")}>
                <Chip pressed={filter === ""} onClick={() => pick("")}>
                  {tf("{label} ({n})", { label: t("All"), n: all.payments.length })}
                </Chip>
                {Object.entries(labels)
                  .filter(([k]) => all.totals[k] || filter === k)
                  .map(([k, [label]]) => (
                    <Chip key={k} pressed={filter === k} onClick={() => pick(k)}>
                      {tf("{label} ({n})", { label, n: all.totals[k] || 0 })}
                    </Chip>
                  ))}
                <RefreshButton run={state.reload} />
              </div>
              {shown.payments.length ? (
                <div className="table-wrap">
                  <table className="data sd-table">
                    <thead>
                      <tr>
                        <th scope="col">{t("Time")}</th>
                        <th scope="col">{t("Customer")}</th>
                        <th scope="col">{t("Order")}</th>
                        <th scope="col">{t("Method")}</th>
                        <th scope="col" className="n">
                          {t("Amount")}
                        </th>
                        <th scope="col">{t("State")}</th>
                        <th scope="col">{t("Reference")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.payments.map((p) => (
                        <tr key={p.id}>
                          <td data-label={t("Time")}>{when(p.created, lang)}</td>
                          <td data-label={t("Customer")} className="sd-cell-title">
                            {t(p.customer)}
                          </td>
                          <td data-label={t("Order")}>
                            {p.items.length ? p.items.map((x) => t(x)).join(" + ") : t("Ref") + " " + p.booking_id.slice(-8)}
                            {p.kind === "subscription" ? <span className="sub">{t("Lab Report subscription")}</span> : null}
                          </td>
                          <td data-label={t("Method")}>{methodLabel(t, p.method)}</td>
                          <td data-label={t("Amount")} className="n">
                            {money(p.amount_thb)}
                          </td>
                          <td data-label={t("State")}>
                            <span className="sd-cell-stack">
                              <StateBadge map={labels} value={p.state} />
                              {p.kind === "subscription" && p.state === "succeeded" && manager ? (
                                <button
                                  type="button"
                                  className="btn sm ghost"
                                  onClick={() =>
                                    modal(
                                      t("Refund LabClear Plus"),
                                      <ReasonForm
                                        label={t("Reason (kept in the audit log)")}
                                        multiline={false}
                                        minLength={3}
                                        intro={t("A simulated refund ends this Plus period now. No real money moves.")}
                                        submitLabel={t("Refund Plus period")}
                                        submit={async (reason) => {
                                          await api.post("/staff/subscriptions/" + p.booking_id + "/refund", { reason });
                                          notice(t("Plus refunded (simulation)."));
                                          await state.reload();
                                        }}
                                      />,
                                    )
                                  }
                                >
                                  {t("Refund")}
                                </button>
                              ) : null}
                            </span>
                          </td>
                          <td data-label={t("Reference")}>
                            <span className="mono">{t(p.reference)}</span>
                            <span className="sub">{p.events ? tf("{n} signed events", { n: p.events }) : t("Recorded by staff")}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title={t("No payments here")}>{filter ? t("Nothing in this group.") : t("Payments appear after a customer pays a confirmed appointment.")}</Empty>
              )}
            </>
          );
        }}
      </Loaded>
    </div>
  );
}
