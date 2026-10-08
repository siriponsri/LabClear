import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { getCommon, packageGroups } from "@/lib/site-data";
import { money } from "@/lib/format";
import "@/app/styles/public.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t, tf } = await getT();
  const c = await getCommon();
  return {
    title: t("AI Lab Report"),
    description: tf("The AI reads your lab report, you confirm every value, and you get a Lab Report with sources. Free for one report; Plus is {price} for {days} days.", {
      price: money(c.plans.plus?.price_thb ?? 355),
      days: c.plans.plus?.period_days ?? 30,
    }),
  };
}

export default async function LabReportsPage() {
  const [{ t, tf }, c] = await Promise.all([getT(), getCommon()]);
  const plus = c.plans.plus;
  const free = c.plans.free;
  const follow = packageGroups(c).follow;
  const images = plus?.limits?.images_per_read ?? 3;
  return (
    <div className="product-page">
      <section className="hero hero-compact" aria-labelledby="lr-title">
        <div className="hero-inner">
          <h1 id="lr-title" className="hero-title">
            {t("Your lab report, read and explained.")}
          </h1>
          <p className="hero-lede">{t("Upload a photo or PDF. The AI reads each test row, you confirm every value, and you get a Lab Report with each value on the range printed on your report and an explanation with sources.")}</p>
          <div className="hero-ctas">
            <Link className="btn primary lg" href="/app?view=labs">
              {t("Read my report free")}
            </Link>
            {plus ? (
              <Link className="btn lg" href="/app?view=plan">
                {tf("Get Plus, {price}", { price: money(plus.price_thb) })}
              </Link>
            ) : null}
          </div>
          {plus ? <p className="hero-credit tiny">{tf("Free: one report of one image. Plus: {days} days, no auto-renewal. Test payments only in this release.", { days: plus.period_days ?? 30 })}</p> : null}
        </div>
      </section>

      <section className="section features" aria-labelledby="lr-steps">
        <div className="section-intro">
          <h2 id="lr-steps">{t("From a photo to a report you can keep.")}</h2>
        </div>
        <ol className="step-cols">
          <li>
            <span className="feature-num num">01</span>
            <h3>{t("Upload")}</h3>
            <p className="muted small">{tf("JPEG, PNG or PDF up to 3 MB. Plus reads up to {n} pages or images together.", { n: images })}</p>
          </li>
          <li>
            <span className="feature-num num">02</span>
            <h3>{t("The AI reads")}</h3>
            <p className="muted small">{t("Test name, value, unit, printed range and flag, as written. Names, IDs and addresses are not read.")}</p>
          </li>
          <li>
            <span className="feature-num num">03</span>
            <h3>{t("You confirm")}</h3>
            <p className="muted small">{t("Correct anything next to the source image, then confirm the report is about the right person.")}</p>
          </li>
          <li>
            <span className="feature-num num">04</span>
            <h3>{t("Lab Report")}</h3>
            <p className="muted small">{tf("Each value on its printed range, a printable report, and questions answered with {n} public sources.", { n: c.sources.count })}</p>
          </li>
        </ol>
      </section>

      <section className="section" aria-labelledby="lr-safety">
        <div className="numbers-grid">
          <div className="numbers-copy stack">
            <h2 id="lr-safety">{t("It explains. It does not diagnose.")}</h2>
            <p className="muted">{t("Status comes from code that compares your value with the range printed on the same report, never from the AI. Missing ranges stay unknown. Urgent symptoms are referred to a clinician, and our team can take over the conversation at any time.")}</p>
          </div>
          <ul className="safety-list">
            <li>
              <strong>{t("Values exactly as printed")}</strong>
              <span className="muted small">{t("Nothing is filled in, converted or guessed.")}</span>
            </li>
            <li>
              <strong>{t("Your laboratory's own ranges")}</strong>
              <span className="muted small">{t("No invented reference ranges.")}</span>
            </li>
            <li>
              <strong>{t("Sources beside each explanation")}</strong>
              <span className="muted small">{tf("{n} reviewed public records.", { n: c.sources.count })}</span>
            </li>
            <li>
              <strong>{t("Private to you")}</strong>
              <span className="muted small">{t("Staff never see values. Deleting a report clears its history.")}</span>
            </li>
          </ul>
        </div>
      </section>

      <section className="section pricing" aria-labelledby="lr-plans">
        <div className="section-intro">
          <h2 id="lr-plans">{t("Start free. Follow your results with Plus.")}</h2>
        </div>
        <div className="plan-pair">
          {[free, plus].filter(Boolean).map((pl) => (
            <article className={"plan-col" + (pl.id === "plus" ? " featured" : "")} key={pl.id}>
              <h3>{t(pl.name)}</h3>
              <p className="plan-amount">
                <strong className="num display">{pl.price_thb ? money(pl.price_thb) : "฿0"}</strong>{" "}
                <span className="muted small">{pl.price_thb ? tf("for {days} days", { days: pl.period_days ?? 30 }) : t("always")}</span>
              </p>
              <p className="muted small">{t(String(pl.summary || ""))}</p>
              <ul className="plan-features">
                {((pl.features as string[]) || []).map((f) => (
                  <li key={f}>{t(f)}</li>
                ))}
              </ul>
              <Link className={"btn" + (pl.id === "plus" ? " primary" : "")} href={pl.id === "plus" ? "/app?view=plan" : "/app?view=labs"}>
                {pl.id === "plus" ? t("Get Plus") : t("Start free")}
              </Link>
            </article>
          ))}
        </div>
        {follow.length ? (
          <p className="small muted pair-note">
            {t("The Report Explainer never offers a package after a value outside its range. If you want a follow-up test, ask for one and our team reviews it with you first.")}{" "}
            <Link href="/packages?segment=individual&review=only">{t("Follow-up tests")}</Link>
          </p>
        ) : null}
      </section>

      <section className="closing" aria-labelledby="lr-close">
        <div className="closing-inner">
          <h2 id="lr-close">{t("Read your first report free.")}</h2>
          <p className="muted">{t("No account is needed to try a synthetic sample. Create one to keep your reports.")}</p>
          <div className="row">
            <Link className="btn primary lg" href="/app?view=labs">
              {t("Open the Lab dashboard")}
            </Link>
            <Link className="btn lg" href="/help#reports">
              {t("How reports are handled")}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
