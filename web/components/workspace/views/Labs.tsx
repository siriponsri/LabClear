"use client";
/* Lab dashboard: the latest confirmed report at a glance and, on Plus, every test over time with
   the range printed on the latest report as a band. Values are exactly as printed and confirmed. */
import { useState } from "react";
import { longDate } from "@/lib/format";
import type { T } from "@/lib/i18n/shared";
import { useWorkspace } from "../context";
import { Empty } from "../ui";
import { Act, freshState, labStatus, LoadError, Loading, planOf, PlanStrip, shortDate, StatusBadge, useLoad } from "./shared";
import { useReportUpload } from "./Reports";

type Point = { report_id: string; date: string; value: string; number: number | null; reference: string; status: string };
type Series = { key: string; name: string; unit: string; points: Point[]; latest: Point; previous: Point | null; change: number | null; count: number };
type Trends = { reports: { id: string; label: string; date: string }[]; tests: Series[] };
type LabRow = { id: string; name: string; value: string; unit: string; reference: string; printed_flag: string; status: string };
type LabReport = { id: string; label: string; date: string; rows: LabRow[]; counts: Record<string, number> };

/** Reference text printed on the user's own report ("70-99", "< 200", "> 40"); null when it cannot be drawn honestly. */
export function parseRange(ref: string): { lo: number | null; hi: number | null } | null {
  const s = String(ref || "").replace(/,/g, "").trim();
  const num = "(-?\\d+(?:\\.\\d+)?)";
  let m = s.match(new RegExp("^" + num + "\\s*[-\u2013\u2014to]+\\s*" + num));
  if (m) return { lo: +m[1], hi: +m[2] };
  if ((m = s.match(new RegExp("^(?:<|\u2264|less than|up to)\\s*" + num, "i")))) return { lo: null, hi: +m[1] };
  if ((m = s.match(new RegExp("^(?:>|\u2265|more than|at least)\\s*" + num, "i")))) return { lo: +m[1], hi: null };
  return null;
}

/** One test over time: a 2px line, ringed dots (out-of-range dots also get an outer ring), the printed band. */
function Sparkline({ s, t, lang }: { s: Series; t: T; lang: "th" | "en" }) {
  const status = labStatus(t);
  const pts = s.points.filter((p) => p.number !== null && p.number !== undefined) as (Point & { number: number })[];
  const W = 320, H = 104, P = { l: 10, r: 52, t: 14, b: 22 };
  const range = parseRange(s.latest.reference);
  const label = `${s.name}: ` + s.points.map((p) => `${shortDate(p.date, lang)} ${p.value}${s.unit ? " " + s.unit : ""}`).join(", ") + (s.latest.reference ? ` (${t("printed range")} ${s.latest.reference})` : "");
  if (!pts.length) return <p className="small muted">{t("These values are not numbers, so there is no chart. See the table.")}</p>;
  const vals = pts.map((p) => p.number).concat(range ? ([range.lo, range.hi].filter((v) => v !== null) as number[]) : []);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.12;
  lo -= pad;
  hi += pad;
  const x = (i: number) => P.l + (pts.length === 1 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (pts.length - 1));
  const y = (v: number) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  const last = pts[pts.length - 1];
  const bandTop = range ? y(range.hi ?? hi) : 0, bandBottom = range ? y(range.lo ?? lo) : 0;
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {range ? <rect className="spark-band" x={P.l} y={Math.min(bandTop, bandBottom)} width={W - P.l - P.r} height={Math.abs(bandBottom - bandTop)} rx={3} /> : null}
      <line className="spark-axis" x1={P.l} x2={W - P.r} y1={H - P.b + 0.5} y2={H - P.b + 0.5} />
      {pts.length > 1 ? <polyline className="spark-line" points={pts.map((p, i) => `${x(i)},${y(p.number)}`).join(" ")} /> : null}
      {pts.map((p, i) => {
        const out = p.status === "high" || p.status === "low";
        return (
          <g key={p.report_id + i} className="spark-point">
            <title>{`${shortDate(p.date, lang)}: ${p.value} ${s.unit} (${(status[p.status] || status.unknown)[0]})`}</title>
            <circle className="spark-hit" cx={x(i)} cy={y(p.number)} r={11} />
            {out ? <circle className="spark-out" cx={x(i)} cy={y(p.number)} r={7.5} /> : null}
            <circle className={"spark-dot " + p.status} cx={x(i)} cy={y(p.number)} r={4} />
          </g>
        );
      })}
      <text className="spark-label" x={x(pts.length - 1) + 10} y={y(last.number) + 4}>
        {last.value}
      </text>
      <text className="spark-date" x={P.l} y={H - 5}>
        {shortDate(pts[0].date, lang)}
      </text>
      {pts.length > 1 && last.date !== pts[0].date ? (
        <text className="spark-date" x={W - P.r} y={H - 5} textAnchor="end">
          {shortDate(last.date, lang)}
        </text>
      ) : null}
    </svg>
  );
}

function changeText(s: Series, t: T, tf: (k: string, v: Record<string, string | number>) => string, lang: "th" | "en") {
  const head = `${s.latest.value} ${s.unit}`.trim();
  if (s.change === null || s.change === undefined) return head + " · " + (s.count > 1 ? t("change not numeric") : t("one report so far"));
  const since = shortDate(s.previous?.date || "", lang);
  if (s.change === 0) return head + " · " + tf("no change since {date}", { date: since });
  return head + " · " + tf("{change} since {date}", { change: (s.change > 0 ? "+" : "") + s.change, date: since });
}

function TrendTable({ tr }: { tr: Trends }) {
  const { t, lang } = useWorkspace();
  return (
    <div className="table-wrap">
      <table className="data">
        <caption className="sr-only">{t("Results over time")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("Test")}</th>
            {tr.reports.map((r) => (
              <th scope="col" key={r.id} className="n">
                {shortDate(r.date, lang)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tr.tests.map((s) => (
            <tr key={s.key}>
              <th scope="row">{s.name + (s.unit ? ` (${s.unit})` : "")}</th>
              {tr.reports.map((r) => {
                const p = s.points.find((x) => x.report_id === r.id);
                return (
                  <td key={r.id} className={"n" + (p ? "" : " muted")}>
                    {p ? p.value : t("Not in report")}
                    {p && (p.status === "high" || p.status === "low") ? <span className="sr-only"> ({labStatus(t)[p.status][0]})</span> : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LabsView() {
  const { api, t, tf, lang, user, refresh, navigate, ask } = useWorkspace();
  const upload = useReportUpload();
  const [table, setTable] = useState(false);
  const res = useLoad(async () => {
    const s = await freshState(refresh);
    const confirmed = s.reports.filter((r) => r.confirmed);
    if (!confirmed.length) return { s, lab: null, trends: null };
    const latest = confirmed.slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""))[confirmed.length - 1];
    const plus = planOf(s).plan === "plus";
    const [lab, trends] = await Promise.all([
      api.get<LabReport>("/reports/" + encodeURIComponent(latest.id) + "/lab-report"),
      plus ? api.get<Trends>("/reports/trends") : Promise.resolve(null),
    ]);
    return { s, lab, trends };
  });

  const intro = (
    <div className="view-intro">
      <h2>{t("Lab dashboard")}</h2>
      <p>{t("Your confirmed reports in one place. Values are exactly as printed and confirmed by you; each status compares a value with the range printed on the same report. This is not a diagnosis.")}</p>
    </div>
  );
  if (res.error) return (<div>{intro}<LoadError error={res.error} retry={() => res.reload()} /></div>);
  if (!res.data) return (<div>{intro}<Loading rows={3} /></div>);
  const { s, lab, trends } = res.data;
  const plus = planOf(s).plan === "plus";
  const status = labStatus(t);

  const toolbar = (
    <>
      {upload.element}
      <div className="toolbar">
        <button type="button" className="btn primary sm" onClick={upload.open} disabled={!!upload.busy}>
          {t("Add a report")}
        </button>
        <button type="button" className="btn sm" onClick={upload.demos}>
          {t("Try a synthetic sample")}
        </button>
      </div>
      <p className="small views-busy" role="status" aria-live="polite">
        {upload.busy}
      </p>
    </>
  );

  if (!lab)
    return (
      <div>
        {intro}
        <PlanStrip />
        {toolbar}
        <Empty title={t("No confirmed reports yet")}>{t("Add a report or read a synthetic sample, check the values and confirm them. Your Lab Report and dashboard appear here.")}</Empty>
      </div>
    );

  const flagged = lab.rows.filter((r) => r.status === "high" || r.status === "low");
  const tiles: [string, string][] = [
    ["within", t("Within range")],
    ["high", t("Above range")],
    ["low", t("Below range")],
    ["unknown", t("No printed range")],
  ];

  return (
    <div>
      {intro}
      <PlanStrip />
      {toolbar}
      <section className="card stack-sm lab-latest" aria-labelledby="lab-latest-title">
        <div className="record-head">
          <h3 id="lab-latest-title">{tf("Latest: {label}", { label: lab.label })}</h3>
          <span className="small muted">{lab.date ? longDate(lab.date, lang) : ""}</span>
          {user?.registered ? (
            <a className="btn sm primary" href={"/lab-report/" + encodeURIComponent(lab.id)}>
              {t("Open Lab Report")}
            </a>
          ) : null}
        </div>
        <div className="kpi-grid four">
          {tiles.map(([k, label]) => (
            <div className="kpi" key={k}>
              <span className="kpi-label">{label}</span>
              <strong className="kpi-value">{lab.counts[k] || 0}</strong>
              {k === "within" ? <span className="kpi-sub">{tf("of {n} tests", { n: lab.rows.length })}</span> : null}
            </div>
          ))}
        </div>
        {flagged.length ? (
          <ul className="plain flag-list" aria-label={t("Values outside the printed range")}>
            {flagged.map((r) => (
              <li key={r.id}>
                <strong>{r.name}</strong>
                <span>{` ${r.value} ${r.unit}`.trimEnd()}</span>
                <span className="muted small">{tf("· printed range {range}", { range: r.reference || t("none") })}</span>
                <StatusBadge map={status} value={r.status} />
              </li>
            ))}
          </ul>
        ) : null}
        <div className="row">
          <Act
            className="btn sm"
            run={async () => {
              await api.post("/reports/select", { report_id: lab.id });
              await refresh().catch(() => null);
              ask(t("Please explain my latest results in plain language."), false);
            }}
          >
            {t("Ask about this report")}
          </Act>
        </div>
      </section>
      <section className="stack-sm" aria-labelledby="lab-trends-title">
        <h3 id="lab-trends-title">{t("Results over time")}</h3>
        {!plus || !trends ? (
          <div className="locked">
            <p className="small">{t("See every test across your reports, with the change since your previous report. This is part of LabClear Plus.")}</p>
            <button type="button" className="btn primary sm" onClick={() => navigate("plan")}>
              {t("Get Plus, ฿355 for 30 days")}
            </button>
          </div>
        ) : (
          <>
            {trends.reports.length < 2 ? <p className="small muted">{t("Confirm a second report to see changes over time. Each chart below shows one test.")}</p> : null}
            <div className="row">
              <button type="button" className="btn ghost sm" aria-expanded={table} aria-controls="lab-trend-table" onClick={() => setTable((v) => !v)}>
                {table ? t("Show as charts") : t("Show as a table")}
              </button>
              {trends.tests.length > 24 ? <span className="small muted">{tf("Charts show the first 24 of {n} tests. The table shows all.", { n: trends.tests.length })}</span> : null}
            </div>
            <div id="lab-trend-table">
              {table ? (
                <TrendTable tr={trends} />
              ) : (
                <div className="trend-grid">
                  {trends.tests.slice(0, 24).map((x) => (
                    <article className="trend-card" key={x.key}>
                      <div className="trend-head">
                        <strong>{x.name}</strong>
                        <StatusBadge map={status} value={x.latest.status} />
                      </div>
                      <p className="small muted">{changeText(x, t, tf, lang)}</p>
                      <Sparkline s={x} t={t} lang={lang} />
                      <p className="tiny muted">
                        {x.latest.reference ? tf("Band: range printed on the latest report ({range})", { range: x.latest.reference }) : t("No printed range on the latest report")}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
