"use client";
/* Plan: Free vs LabClear Plus (GET /plans, GET /subscription) and the simulated Plus checkout
   (POST /subscriptions/checkout -> /pay/sim/{id}). No real money moves; Plus never renews by itself. */
import { useRouter } from "next/navigation";
import { money } from "@/lib/format";
import { useWorkspace } from "../context";
import { Badge } from "../ui";
import { Act, dayText, LoadError, Loading, useLoad } from "./shared";

type PlanDef = { id: string; name: string; price_thb: number; period_days: number; summary: string; limits: { ai_reads: number | null; images_per_read: number; trends: boolean }; features: string[] };
type Ent = {
  plan: string;
  plan_name: string;
  active: boolean;
  period_end: number | null;
  ai_reads_used: number;
  ai_reads_limit: number | null;
  images_per_read: number;
  trends: boolean;
  can_read: boolean;
  subscription: { id: string; state: string; payment_status: string; active_txn: string; period_end?: number } | null;
};

export function PlanView() {
  const { api, t, tf, lang, user, refresh, requireAccount } = useWorkspace();
  const router = useRouter();
  const res = useLoad(() => Promise.all([api.get<{ plans: PlanDef[] }>("/plans"), api.get<Ent>("/subscription")]));

  const intro = (
    <div className="view-intro">
      <h2>{t("Plan")}</h2>
      <p>{t("Health-check packages are paid per visit. The AI Lab Report service has a free plan and LabClear Plus. Payments here use the test simulator; no real money moves.")}</p>
    </div>
  );
  if (res.error) return (<div>{intro}<LoadError error={res.error} retry={() => res.reload()} /></div>);
  if (!res.data) return (<div>{intro}<Loading rows={2} /></div>);
  const [{ plans }, ent] = res.data;
  const renewable = !ent.active || (ent.period_end || 0) - Date.now() / 1000 <= 7 * 86400;
  const checkout = (method: "promptpay" | "card") => async () => {
    const r = await api.post<{ simulator_url: string }>("/subscriptions/checkout", { method });
    refresh().catch(() => null);
    router.push(r.simulator_url);
  };
  const free = plans.find((p) => p.id === "free");
  const plus = plans.find((p) => p.id === "plus");
  const cell = (v: number | boolean | null, kind: "reads" | "images" | "trends") =>
    kind === "reads" ? (v === null ? t("No limit") : tf("{n} report", { n: v as number })) : kind === "images" ? tf("{n} per reading", { n: v as number }) : v ? t("Included") : t("Not included");

  return (
    <div>
      {intro}
      <div className="plan-grid">
        {plans.map((pl) => {
          const current = ent.plan === pl.id;
          return (
            <article key={pl.id} className={"plan-card" + (pl.id === "plus" ? " featured" : "")} aria-labelledby={"plan-" + pl.id}>
              <div className="plan-head">
                <h3 id={"plan-" + pl.id}>{t(pl.name)}</h3>
                {current ? <Badge tone="ok">{t("Current plan")}</Badge> : null}
              </div>
              <p className="small muted">{t(pl.summary)}</p>
              <p className="plan-price">
                <strong className="num">{pl.price_thb ? money(pl.price_thb) : "฿0"}</strong>
                <span className="small muted"> {pl.price_thb ? tf("for {n} days", { n: pl.period_days }) : t("always")}</span>
              </p>
              <ul className="plan-features">
                {pl.features.map((f) => (
                  <li key={f}>{t(f)}</li>
                ))}
              </ul>
              {pl.id === "plus" ? (
                <div className="record-actions">
                  {!user?.registered ? (
                    <button type="button" className="btn primary sm" onClick={() => requireAccount(t("Create an account or sign in before subscribing."))}>
                      {t("Create an account to subscribe")}
                    </button>
                  ) : renewable ? (
                    <>
                      <Act className="btn primary sm" run={checkout("promptpay")}>
                        {ent.active ? t("Renew with test PromptPay") : t("Subscribe with test PromptPay")}
                      </Act>
                      <Act className="btn sm" run={checkout("card")}>
                        {t("Test card")}
                      </Act>
                    </>
                  ) : (
                    <span className="small muted">{t("Renewal opens in the last 7 days of your period.")}</span>
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      {free && plus ? (
        <div className="table-wrap views-compare">
          <table className="data">
            <caption className="sr-only">{t("Compare Free and LabClear Plus")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("What you get")}</th>
                <th scope="col">{t(free.name)}</th>
                <th scope="col">{t(plus.name)}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">{t("AI report readings")}</th>
                <td>{cell(free.limits.ai_reads, "reads")}</td>
                <td>{cell(plus.limits.ai_reads, "reads")}</td>
              </tr>
              <tr>
                <th scope="row">{t("Pages or images per reading")}</th>
                <td>{cell(free.limits.images_per_read, "images")}</td>
                <td>{cell(plus.limits.images_per_read, "images")}</td>
              </tr>
              <tr>
                <th scope="row">{t("Results over time")}</th>
                <td>{cell(free.limits.trends, "trends")}</td>
                <td>{cell(plus.limits.trends, "trends")}</td>
              </tr>
              <tr>
                <th scope="row">{t("Price")}</th>
                <td>฿0</td>
                <td>{tf("{price} for {n} days", { price: money(plus.price_thb), n: plus.period_days })}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
      <section className="card stack-sm" aria-labelledby="plan-yours">
        <h3 id="plan-yours">{t("Your plan")}</h3>
        <dl className="kv">
          <dt>{t("Plan")}</dt>
          <dd>{t(ent.plan_name)}</dd>
          <dt>{t("AI report readings used")}</dt>
          <dd>{ent.ai_reads_limit ? tf("{used} of {limit}", { used: ent.ai_reads_used, limit: ent.ai_reads_limit }) : tf("{used} (no limit on Plus)", { used: ent.ai_reads_used })}</dd>
          <dt>{t("Pages or images per reading")}</dt>
          <dd>{ent.images_per_read}</dd>
          {ent.active ? (
            <>
              <dt>{t("Plus active until")}</dt>
              <dd>{dayText(ent.period_end, lang)}</dd>
            </>
          ) : null}
          {ent.subscription?.payment_status === "refunded" ? (
            <>
              <dt>{t("Last Plus period")}</dt>
              <dd>{t("Refunded (simulation)")}</dd>
            </>
          ) : null}
        </dl>
        <p className="small muted">{t("Plus does not renew by itself. Synthetic sample reports never use a reading.")}</p>
      </section>
    </div>
  );
}
