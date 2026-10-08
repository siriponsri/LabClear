"use client";
/*
 * Printable Lab Report. Data loads with the owner's session (GET /reports/{id}/lab-report);
 * nothing is embedded in the page. Status labels come from the server's code comparison,
 * never from a model.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, type ApiError } from "@/lib/api/client";
import { longDate, when } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { apiMessage } from "@/lib/i18n/shared";
import { useSession } from "@/lib/session";

type Row = { id: string; name: string; value: string; unit: string; reference: string; status: string; previous?: { value: string; status: string; change: number | null } };
type Report = {
  id: string;
  label: string;
  date: string;
  generated_at: number;
  rows: Row[];
  counts: Record<string, number>;
  previous: { report_id: string; label: string; date: string } | null;
  trends: boolean;
  note: string;
};

const STATUS: Record<string, [string, string]> = {
  within: ["Within printed range", "ok"],
  high: ["Above printed range", "warn"],
  low: ["Below printed range", "warn"],
  unknown: ["No range to compare", "neutral"],
};

export function LabReportView({ id }: { id: string }) {
  const { t, tf, lang } = useT();
  const { openSignIn } = useSession();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      await api.session();
      const r = await api.get<Report>("/reports/" + encodeURIComponent(id) + "/lab-report");
      setReport(r);
    } catch (e) {
      const err = e as ApiError;
      setError({
        status: err.status,
        message: err.status === 404 ? t("It does not exist or belongs to another account. Sign in with the account that added it.") : apiMessage(lang, err.message),
      });
    }
  }, [id, lang, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (report) document.title = tf("{label} · Lab Report | LabClear", { label: report.label });
  }, [report, tf]);

  if (error) {
    return (
      <article className="wrap lab-doc">
        <div className="state-box" role="alert">
          <h1 className="h3">{t("This Lab Report cannot be shown")}</h1>
          <p className="small muted">{error.message}</p>
          <div className="row">
            <Link className="btn primary" href="/app?view=reports">
              {t("My reports")}
            </Link>
            {error.status === 404 || error.status === 401 ? (
              <button className="btn" type="button" onClick={() => openSignIn({ onDone: () => load() })}>
                {t("Sign in")}
              </button>
            ) : (
              <button className="btn" type="button" onClick={load}>
                {t("Try again")}
              </button>
            )}
          </div>
        </div>
      </article>
    );
  }
  if (!report) {
    return (
      <article className="wrap lab-doc" aria-busy="true">
        <p className="sr-only" role="status">
          {t("Loading your Lab Report…")}
        </p>
        <div className="skeleton" />
      </article>
    );
  }

  const short = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d || "") ? new Date(d + "T00:00:00").toLocaleDateString(lang === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", year: "numeric" }) : d);
  const cols = [t("Test"), t("Result"), t("Unit"), t("Printed range"), t("Status")].concat(report.previous ? [tf("Previous, {date}", { date: short(report.previous.date) }), t("Change")] : []);
  return (
    <article className="wrap lab-doc">
      <header className="lab-head">
        <div className="stack-sm">
          <p className="small muted">{t("Lab Report")}</p>
          <h1>{report.label}</h1>
          <p className="muted">{report.date ? longDate(report.date, lang) : t("Collection date not entered")}</p>
        </div>
        <div className="row no-print">
          <button className="btn primary" type="button" onClick={() => window.print()}>
            {t("Print or save as PDF")}
          </button>
          <Link className="btn" href="/app?view=reports">
            {t("Ask about this report")}
          </Link>
        </div>
      </header>
      <div className="lab-summary">
        {(
          [
            ["within", "Within range"],
            ["high", "Above range"],
            ["low", "Below range"],
            ["unknown", "No printed range"],
          ] as const
        ).map(([k, label]) => (
          <div className="lab-stat" key={k}>
            <strong className="num">{report.counts[k] || 0}</strong>
            <span className="small muted">{t(label)}</span>
          </div>
        ))}
      </div>
      <div className="table-wrap">
        <table className="data lab-table">
          <caption className="sr-only">{t("Your confirmed values and the ranges printed on your report")}</caption>
          <thead>
            <tr>
              {cols.map((c, i) => (
                <th scope="col" key={c} className={i === 1 || i >= 5 ? "n" : ""}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.rows.map((x) => {
              const [label, tone] = STATUS[x.status] || STATUS.unknown;
              const p = x.previous;
              const hasChange = p && p.change !== null && p.change !== undefined;
              return (
                <tr key={x.id} className={x.status === "high" || x.status === "low" ? "flagged" : ""}>
                  <th scope="row">{x.name}</th>
                  <td className="n num">{x.value}</td>
                  <td className={x.unit ? "" : "muted"}>{x.unit || t("None")}</td>
                  <td className={x.reference ? "num" : "muted"}>{x.reference || t("Not printed")}</td>
                  <td>
                    <span className={"badge " + tone}>{t(label)}</span>
                  </td>
                  {report.previous ? (
                    <>
                      <td className={p ? "n num" : "n muted"}>{p ? p.value : t("Not in previous")}</td>
                      <td className={hasChange ? "n num" : "n muted"}>{!p ? "" : hasChange ? (p.change! > 0 ? "+" : "") + p.change : t("Not numeric")}</td>
                    </>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <section className="lab-notes small" aria-label={t("Notes")}>
        <p>{t(report.note)}</p>
        {!report.trends ? (
          <p className="no-print">
            {t("Change since your previous report is part of LabClear Plus.")} <Link href="/app?view=plan">{t("See Plus")}</Link>
          </p>
        ) : null}
        <p className="muted tiny">{tf("Generated by LabClear on {when}. Coursework simulation; not a medical document.", { when: when(report.generated_at, lang) })}</p>
      </section>
    </article>
  );
}
