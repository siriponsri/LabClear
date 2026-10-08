/*
 * Landing page sections (server components). Every number comes from the live API data passed in:
 * catalog prices, plans, centers, policy values and source counts. Demo values are synthetic and
 * labelled as such on the page.
 */
import Link from "next/link";
import type { Common, Package, SourceRecord } from "@/lib/types";
import type { T, TF } from "@/lib/i18n/shared";
import { money } from "@/lib/format";
import { HelixSvg } from "@/components/three/HelixSvg";
import { HeroBackdrop } from "./HeroBackdrop";
import { SearchPill } from "./SearchPill";
import { LabReportDemo } from "./LabReportDemo";
import { CheckStream, type StreamStep } from "./CheckStream";
import { InView } from "./InView";
import { demoRows } from "./demo-data";
import { sourceGroups } from "./sources";

type Tx = { t: T; tf: TF; lang: "th" | "en" };
const n = (v: number) => new Intl.NumberFormat("en-US").format(v);

function Arrow() {
  return (
    <svg className="lc-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

/* ------------------------------------------------------------------ hero */
export function Hero({ t, tf, lang, total, sourceCount }: Tx & { total: number; sourceCount: number }) {
  return (
    <section className="lc-hero" aria-labelledby="hero-title">
      <HeroBackdrop>
        <HelixSvg />
      </HeroBackdrop>
      <div className="lc-hero-copy">
        <h1 id="hero-title" className="lc-hero-title" lang={lang}>
          <span>{t("Book the check.")}</span> <span>{t("Understand the result.")}</span>
        </h1>
        <p className="lc-hero-lede">
          {tf("Compare {n} health-check packages, request a time our team confirms, and let the AI explain every value on your lab report against its printed range, with sources.", { n: total })}
        </p>
        <div className="lc-hero-ctas">
          <Link className="btn primary lg" href="/app?attach=1">
            {t("Read my lab report")}
          </Link>
          <Link className="btn lg" href="/app?view=book">
            {t("Request a time")}
          </Link>
        </div>
        <SearchPill placeholder={t("Search a test, for example HbA1c")} label={t("Search health checks and pages")} />
        <p className="lc-hero-credit">
          {t("Answers cite")}{" "}
          <Link href="/sources">
            <span className="num">{n(sourceCount)}</span> {t("reviewed public records")}
          </Link>
          {t(". Coursework simulation, not a clinic.")}
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ signature: the sample report */
export function DemoSection({ t, tf, records }: Tx & { records: SourceRecord[] }) {
  const rows = demoRows(records, t, tf);
  return (
    <section className="section lc-demo" aria-labelledby="demo-title">
      <div className="lc-head">
        <h2 id="demo-title">{t("Try it on a sample report.")}</h2>
        <p className="lc-sub">{t("Choose a row. LabClear confirms the value, places it on the range printed on the report, then explains it in plain words with its source.")}</p>
      </div>
      <LabReportDemo
        rows={rows}
        copy={{
          listLabel: t("Rows of the sample report"),
          test: t("Test"),
          result: t("Result"),
          range: t("Printed range"),
          status: t("Status"),
          confirmed: t("Value confirmed:"),
          explained: t("Explained with sources"),
          compares: t("Code compares the number with the range on the report; the AI only explains it."),
          sourcesTitle: t("Sources"),
          newTab: t("opens in a new tab"),
        }}
      >
        <div className="lc-paper-head">
          <div>
            <p className="lc-paper-title">{t("Laboratory report")}</p>
            <p className="lc-paper-meta">{t("Sample data, not a real person")}</p>
          </div>
          <span className="badge sim">{t("Simulated example")}</span>
        </div>
      </LabReportDemo>
      <div className="lc-demo-foot">
        <Link className="btn primary" href="/app?attach=1">
          {t("Try it with my report")}
        </Link>
        <p className="lc-fine">{t("Simulated values. A single value is not a diagnosis; talk to a doctor about your own results.")}</p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ five checks */
export function ChecksSection({ t, tf, records }: Tx & { records: SourceRecord[] }) {
  const title = (id: string, fallback: string) => records.find((r) => r.id === id)?.title || fallback;
  const steps: StreamStep[] = [
    { id: "safety_in", running: t("Checking your message for safety"), done: t("Your message passed the safety check"), detail: t("Every question is screened before any work starts"), layer: tf("Check {n}", { n: 1 }) },
    { id: "plan", running: t("Understanding your request"), done: t("Plan: answer as the Report Explainer"), detail: t("Each role may use only its own data: packages and prices, or your confirmed report"), layer: null },
    {
      id: "search",
      running: t("Searching the medical knowledge base"),
      done: tf("Found {n} medical sources", { n: 2 }),
      detail: `${title("nlm-a1c", "Hemoglobin A1c test")}; ${title("nlm-reading-results", "How to understand your lab results")}`,
      layer: tf("Check {n}", { n: 2 }),
    },
    { id: "draft", running: t("Writing the answer"), done: t("Draft written and checked"), detail: t("2 cited sources · report values matched exactly · prices only from the catalog"), layer: tf("Check {n}", { n: 3 }) },
    { id: "review", running: t("Second review of the draft"), done: t("Second review passed"), detail: t("supported by the sources, values unchanged, within scope"), layer: tf("Check {n}", { n: 4 }) },
    { id: "safety_out", running: t("Checking the answer for safety"), done: t("The answer passed the safety check"), detail: t("No diagnosis, no treatment advice"), layer: tf("Check {n}", { n: 5 }) },
  ];
  return (
    <section className="section lc-checks" aria-labelledby="checks-title">
      <div className="lc-checks-grid">
        <div className="lc-checks-copy">
          <h2 id="checks-title">{t("Five checks before every answer.")}</h2>
          <p className="lc-sub">{t("These are the steps you see live in the chat. If a check fails, the answer is rewritten, or LabClear tells you plainly that it cannot answer.")}</p>
          <p className="lc-sub">{t("You can ask for a person on our team at any point, in the same conversation.")}</p>
          <Link className="text-link" href="/app">
            {t("Open the chat")}
          </Link>
        </div>
        <CheckStream steps={steps} copy={{ question: t("My HbA1c is 5.4%. What does that mean?"), answer: tf("Answer shown with {n} sources", { n: 2 }), replay: t("Play again") }} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ sources and trust */
export function SourcesSection({ t, tf, common, records }: Tx & { common: Common; records: SourceRecord[] }) {
  const groups = sourceGroups(common.sources.publisher_types || {}, records);
  const max = Math.max(1, ...groups.map((g) => g.count));
  return (
    <section className="section lc-sources" aria-labelledby="sources-title">
      <div className="lc-sources-grid">
        <div className="lc-head lc-head-left">
          <h2 id="sources-title">{t("Sources you can open and check.")}</h2>
          <p className="lc-sub">{tf("{count} reviewed public records from {publishers} publishers. Every explanation names its source.", { count: n(common.sources.count), publishers: n(common.sources.publishers) })}</p>
          <Link className="text-link" href="/sources">
            {t("See every source")}
          </Link>
        </div>
        <InView as="ul" className="lc-ledger" aria-label={t("Sources by type of publisher")}>
          {groups.map((g) => (
            <li key={g.key} className="lc-ledger-row" style={{ "--share": (g.count / max).toFixed(3) } as React.CSSProperties}>
              <div className="lc-ledger-top">
                <h3>{t(g.label)}</h3>
                <span className="num">{tf("{n} records", { n: n(g.count) })}</span>
              </div>
              <span className="lc-ledger-bar" aria-hidden="true">
                <span />
              </span>
              {g.publishers.length ? (
                <p className="lc-ledger-names">
                  {g.publishers
                    .slice(0, 4)
                    .map((p) => p.name)
                    .join(" · ")}
                  {g.publishers.length > 4 ? ` · ${tf("and {n} more", { n: g.publishers.length - 4 })}` : ""}
                </p>
              ) : null}
            </li>
          ))}
        </InView>
      </div>
      <p className="lc-b2b">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 20V8l8-4 8 4v12" />
          <path d="M9 20v-5h6v5M12 8v4M10 10h4" />
        </svg>
        <span>
          {t("Hospitals among our business customers can add their own reference documents, reviewed by our staff before use.")}{" "}
          <Link href="/organizations">{t("For organizations")}</Link>
        </span>
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ packages ladder and centers */
function unit(t: T, p: Package) {
  return p.price_unit === "per pair" ? t("per pair") : p.price_unit === "per person" ? t("per person") : t(p.price_unit);
}

export function PackagesSection({ t, tf, common, ladder, follow, minPrice }: Tx & { common: Common; ladder: Package[]; follow: Package[]; minPrice: number }) {
  const lo = ladder.length ? ladder[0].price_thb : 0;
  const hi = ladder.length ? ladder[ladder.length - 1].price_thb : 1;
  const span = hi - lo || 1;
  const followFrom = follow.length ? Math.min(...follow.map((p) => p.price_thb)) : 0;
  return (
    <section className="section lc-packages" aria-labelledby="packages-title">
      <div className="lc-packages-head">
        <div className="lc-head lc-head-left">
          <h2 id="packages-title">{tf("Health checks from {price}", { price: money(minPrice) })}</h2>
          <p className="lc-sub">{tf("{n} core packages to book directly. Request a half-hour slot and our team confirms it before any payment.", { n: ladder.length })}</p>
        </div>
        <div className="lc-packages-links">
          <Link className="btn" href="/packages">
            {t("Browse health checks")}
          </Link>
          <Link className="btn ghost" href="/compare">
            {t("Compare packages")}
          </Link>
        </div>
      </div>

      {ladder.length ? (
        <figure className="lc-ladder-wrap">
          <InView as="ol" className="lc-ladder" aria-label={t("Core packages, lowest to highest price")}>
            {ladder.map((p, i) => (
              <li key={p.id} style={{ "--h": (0.34 + (0.66 * (p.price_thb - lo)) / span).toFixed(3), "--i": i } as React.CSSProperties}>
                <Link href={`/packages/${p.id}`} className="lc-rung">
                  <span className="lc-rung-price num">{money(p.price_thb)}</span>
                  <span className="lc-rung-bar" aria-hidden="true" />
                  <span className="lc-rung-name">{p.name}</span>
                  <span className="lc-rung-meta">
                    {tf("{n} tests", { n: p.services.length })} · {unit(t, p)}
                  </span>
                </Link>
              </li>
            ))}
          </InView>
          <figcaption className="lc-fine">
            {t("Core packages, lowest to highest price")} · {t("simulated catalog")} {common.catalog.version}
          </figcaption>
        </figure>
      ) : null}

      <div className="lc-packages-foot">
        <ol className="lc-flow" aria-label={t("How booking works")}>
          <li>{t("Request a time")}</li>
          <li>{t("Our team confirms")}</li>
          <li>{t("Pay at the center or by test payment")}</li>
        </ol>
        {follow.length ? <p className="lc-fine">{tf("Plus {n} follow-up tests from {price}, reviewed with our team first.", { n: follow.length, price: money(followFrom) })}</p> : null}
      </div>

      {common.branches.length ? (
        <div className="lc-centers">
          <h3>{tf("{n} centers", { n: common.branches.length })}</h3>
          <ul>
            {common.branches.map((b) => (
              <li key={b.id}>
                <strong>{t(b.name)}</strong>
                {b.hours ? <span className="num">{t(String(b.hours))}</span> : null}
              </li>
            ))}
          </ul>
          <Link className="text-link" href="/centers">
            {t("All centers")}
          </Link>
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ AI Lab Report + Plus, organizations */
export function PlansSection({ t, tf, common, org }: Tx & { common: Common; org: Package[] }) {
  const plus = common.plans.plus;
  const free = common.plans.free;
  const minPeople = common.policies.organization_min_people;
  const pages = plus?.limits?.images_per_read ?? 3;
  return (
    <section className="section lc-pair" aria-label={t("Plans and organizations")}>
      <article className="lc-plan" aria-labelledby="plan-title">
        <h2 id="plan-title">{t("One report free. Plus to follow your results.")}</h2>
        <p className="lc-sub">{t("Send a photo or PDF of a report from any laboratory. You confirm every value before it is used.")}</p>
        <div className="lc-plan-cols">
          <div className="lc-plan-col">
            <p className="lc-plan-name">{t("Free")}</p>
            <p className="lc-plan-price">
              <strong className="num">{money(free?.price_thb ?? 0)}</strong>
              <span>{t("always")}</span>
            </p>
            <ul>
              <li>{t("AI reads one report image")}</li>
              <li>{t("Lab Report with each value on its printed range")}</li>
              <li>{t("Questions with sources")}</li>
            </ul>
            <Link className="btn" href="/app?view=labs">
              {t("Start free")}
            </Link>
          </div>
          {plus ? (
            <div className="lc-plan-col is-plus">
              <p className="lc-plan-name">{plus.name}</p>
              <p className="lc-plan-price">
                <strong className="num">{money(plus.price_thb)}</strong>
                <span>{tf("for {days} days, no auto-renewal", { days: plus.period_days ?? 30 })}</span>
              </p>
              <ul>
                <li>{tf("Readings without the one-report limit, up to {n} pages each", { n: pages })}</li>
                <li>{t("Every test over time on your dashboard")}</li>
                <li>{t("Change since your previous report")}</li>
              </ul>
              <Link className="btn primary" href="/app?view=plan">
                {t("Get Plus")}
              </Link>
            </div>
          ) : null}
        </div>
        <Link className="text-link" href="/lab-reports">
          {t("About the AI Lab Report")}
        </Link>
      </article>

      <article className="lc-org" aria-labelledby="org-title">
        <h2 id="org-title">{tf("Health checks for teams of {n} or more", { n: minPeople })}</h2>
        <p className="lc-sub">{tf("Request a quotation online. Our team checks the details and replies with a price per person; a quotation is valid for {days} days.", { days: common.policies.quote_valid_days ?? 7 })}</p>
        <ul className="lc-org-list">
          {org.map((p) => (
            <li key={p.id}>
              <Link href={`/packages/${p.id}`}>{p.name}</Link>
              <span className="lc-org-tests">{tf("{n} tests", { n: p.services.length })}</span>
              <span className="lc-org-price num">
                {money(p.price_thb)} <small>{unit(t, p)}</small>
              </span>
            </li>
          ))}
        </ul>
        <p className="lc-fine">{t("Employers receive coordination details, never an employee's lab results.")}</p>
        <Link className="btn" href="/organizations">
          {t("Request a quotation")}
          <Arrow />
        </Link>
      </article>
    </section>
  );
}

/* ------------------------------------------------------------------ privacy promise and closing */
export function PrivacySection({ t }: Tx) {
  return (
    <section className="lc-privacy" aria-labelledby="privacy-title">
      <svg className="lc-privacy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
        <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5M12 14.5v2" />
      </svg>
      <h2 id="privacy-title">{t("Guest chats are deleted when you refresh.")}</h2>
      <p className="lc-sub">{t("Sign in to keep your chat history and reports. Only you can see your report values.")}</p>
      <Link className="text-link" href="/privacy">
        {t("Read the privacy policy")}
      </Link>
    </section>
  );
}

export function Closing({ t }: Tx) {
  return (
    <section className="closing lc-closing" aria-labelledby="closing-title">
      <div className="closing-inner">
        <h2 id="closing-title">{t("Book the check. Understand the result.")}</h2>
        <p className="muted">{t("Start with what you know. Our team confirms every appointment before any payment.")}</p>
        <div className="row">
          <Link className="btn primary lg" href="/app?attach=1">
            {t("Read my lab report")}
          </Link>
          <Link className="btn lg" href="/app?view=book">
            {t("Request a time")}
          </Link>
        </div>
      </div>
    </section>
  );
}
