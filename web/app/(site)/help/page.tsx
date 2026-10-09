import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { getCommon, packageGroups } from "@/lib/site-data";
import { money } from "@/lib/format";
import { Crumbs } from "@/components/public/Crumbs";
import "@/app/styles/public.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return {
    title: t("Help and policies"),
    description: t("Answers to common questions about prices, preparation, booking, cancellations, results, LabClear Plus, organizations and privacy."),
  };
}

export default async function HelpPage() {
  const [{ t, tf }, c] = await Promise.all([getT(), getCommon()]);
  const g = packageGroups(c);
  const pol = c.policies;
  const min = (list: { price_thb: number }[]) => (list.length ? money(Math.min(...list.map((p) => p.price_thb))) : "—");
  const max = (list: { price_thb: number }[]) => (list.length ? money(Math.max(...list.map((p) => p.price_thb))) : "—");
  const plus = c.plans.plus;
  const notes = g.core[0]?.notes || "";
  const people = pol.organization_min_people || 20;

  const faq: { id: string; q: string; a: React.ReactNode }[] = [
    {
      id: "prices",
      q: t("How much does a health check cost?"),
      a: (
        <>
          <p>
            {tf("Prices are simulated and shown in Thai baht, per person unless stated. Core health checks cost {coreMin} to {coreMax}, follow-up tests start at {followMin}, and organization packages start at {orgMin} per person for {n} people or more.", {
              coreMin: min(g.core),
              coreMax: max(g.core),
              followMin: min(g.follow),
              orgMin: min(g.org),
              n: people,
            })}
          </p>
          <p>{t(String(pol.discount_policy || ""))}</p>
          <p>
            <Link href="/packages?sort=price_asc">{t("See every price")}</Link>
          </p>
        </>
      ),
    },
    {
      id: "included",
      q: t("What does each package include?"),
      a: (
        <>
          <p>{t("Every package page lists its tests, such as CBC, Fasting glucose or Lipid profile. Tick Compare on up to three packages to see them test by test, and ask the assistant what any test measures; it answers with public sources.")}</p>
          {notes ? <p>{t(notes)}</p> : null}
          <p>
            <Link href="/compare">{t("Compare packages")}</Link>
          </p>
        </>
      ),
    },
    {
      id: "preparation",
      q: t("Do I need to fast or prepare before my visit?"),
      a: (
        <>
          <p>{t(String(pol.results_policy || ""))}</p>
          <p>{t("Our team confirms preparation instructions with your appointment.")}</p>
        </>
      ),
    },
    {
      id: "booking",
      q: t("How do I book, and when is my appointment confirmed?"),
      a: (
        <>
          <p>
            {tf("Send an appointment request from a package page or from the chat. A free account is needed to confirm it. The request holds a half-hour slot until a team member at the center confirms or declines it. You can book up to {days} days ahead, Monday to Saturday.", {
              days: pol.booking_advance_days || 30,
            })}
          </p>
          <p>{t("Your requests and their status are in My appointments.")}</p>
        </>
      ),
    },
    {
      id: "cancel",
      q: t("Can I cancel, reschedule or get a refund?"),
      a: (
        <>
          <p>{t(String(pol.cancellation_policy || ""))}</p>
          <p>{t(String(pol.refund_policy || ""))}</p>
        </>
      ),
    },
    {
      id: "results",
      q: t("When do I get my results, and what is the AI Lab Report?"),
      a: (
        <>
          <p>{t("Result timing comes from our team for your appointment; we do not promise a turnaround time.")}</p>
          <p>{t("The AI Lab Report reads a photo or PDF of a report from any laboratory (JPEG, PNG or PDF up to 3 MB). You check and confirm every value. Whether a value is inside its range is worked out by code against the range printed on your own report, not by the AI. It explains with sources and does not diagnose. The free plan reads one report of one image.")}</p>
          <p>
            <Link href="/lab-reports">{t("About the AI Lab Report")}</Link>
          </p>
        </>
      ),
    },
    {
      id: "plus",
      q: tf("What is {plan}?", { plan: plus?.name || "LabClear Plus" }),
      a: plus ? (
        <>
          <p>{tf("{plan} costs {price} for {days} days and does not renew automatically. In this release it is paid with a test payment only.", { plan: plus.name, price: money(plus.price_thb), days: plus.period_days || 30 })}</p>
          <ul>
            {((plus.features as string[]) || []).map((f) => (
              <li key={f}>{t(f)}</li>
            ))}
          </ul>
          <p>
            <Link href="/app?view=plan">{t("See plans")}</Link>
          </p>
        </>
      ) : (
        <p>{t("Plans are shown in your account.")}</p>
      ),
    },
    {
      id: "organizations",
      q: t("Can my company or hospital use LabClear?"),
      a: (
        <>
          <p>
            {tf("Yes. Organizations of {n} people or more can request a quotation for checks at a center or at the workplace. A coordinator prepares it and it is valid for {days} days.", {
              n: people,
              days: pol.quote_valid_days || 7,
            })}{" "}
            {t("Employers receive coordination information, never an employee's lab results.")}
          </p>
          <p>{t("Hospitals and clinics can also add their own reference documents. An editor of the organization approves each version, and only that organization's members can see it.")}</p>
          <p>
            <Link href="/organizations">{t("For organizations")}</Link>
          </p>
        </>
      ),
    },
    {
      id: "privacy",
      q: t("What happens to my chats and reports?"),
      a: (
        <>
          <p>{t("Without signing in, your chat is temporary. It lives only in the open page and in server memory, and it is deleted when you refresh or close the page.")}</p>
          <p>{t("Signing in deletes the temporary chat of the page; from then on your chats are saved in your account. You can delete a report from My reports at any time; this also clears conversation history that may contain its values.")}</p>
          <p>
            <Link href="/privacy">{t("Privacy")}</Link>
          </p>
        </>
      ),
    },
    {
      id: "simulated",
      q: t("What is simulated on LabClear?"),
      a: (
        <>
          <p>{t("LabClear is a university coursework business. The packages, prices, centers, staff accounts and payments are simulated: no clinic operates at the listed areas and no real money can be paid.")}</p>
          <p>{t("Medical explanations use real public references, listed with their review dates.")}</p>
          <p>
            <Link href="/sources">{t("Medical sources")}</Link>
          </p>
        </>
      ),
    },
  ];

  return (
    <>
      <div className="wrap page-head">
        <Crumbs label={t("Breadcrumb")} items={[<Link key="home" href="/">{t("Home")}</Link>]} current={t("Help")} />
        <h1>{t("Help and policies")}</h1>
        <p className="muted">{t("Short answers first, then the full policies our team and the assistant follow.")}</p>
      </div>
      <div className="wrap prose stack">
        <nav className="toc small" aria-label={t("On this page")}>
          <a href="#faq">{t("Frequently asked questions")}</a>
          <a href="#simulation">{t("Simulation")}</a>
          <a href="#booking">{t("Booking")}</a>
          <a href="#payments">{t("Payments")}</a>
          <a href="#reports">{t("Reports")}</a>
          <a href="#assistant">{t("Assistant")}</a>
          <a href="#team">{t("Our team")}</a>
        </nav>

        <section id="faq" className="pub-faq-wrap" aria-labelledby="faq-title">
          <h2 id="faq-title">{t("Frequently asked questions")}</h2>
          <div className="faq faq-list pub-faq">
            {faq.map((item) => (
              <details key={item.id} id={"faq-" + item.id}>
                <summary>{item.q}</summary>
                <div className="pub-faq-answer">{item.a}</div>
              </details>
            ))}
          </div>
        </section>

        <section id="simulation" className="card stack-sm">
          <h2 className="h3">{t("What is simulated")}</h2>
          <p>
            {t("LabClear is a university coursework business. The packages, prices, centers, staff accounts and payments are simulated. No clinic operates at the listed areas and no real money can be paid. Medical explanations use real public references listed on")} <Link href="/sources">{t("Medical sources")}</Link>.
          </p>
          <ul className="plain small">
            <li>
              <span className="badge sim">{t("Simulated business data")}</span> {t("packages, prices,")} <span className="nowrap">{tf("centers ({version})", { version: String(pol.version || "") })}</span>
            </li>
            <li>
              <span className="badge sim">{t("Simulated integration")}</span> {t("test payments, LINE channel simulator, center calendar")}
            </li>
            <li>
              <span className="badge">{t("Live model")}</span> {t("only when the owner connects an AI provider; otherwise the assistant says it is unavailable")}
            </li>
          </ul>
        </section>
        <section id="booking" className="card stack-sm">
          <h2 className="h3">{t("Booking, changes and cancellations")}</h2>
          <p>{tf("Requests hold a half-hour slot until a team member confirms or declines them. Booking is open up to {days} days ahead, Monday to Saturday.", { days: pol.booking_advance_days || 30 })}</p>
          <p>{t(String(pol.cancellation_policy || ""))}</p>
          <p>{t(String(pol.refund_policy || ""))}</p>
        </section>
        <section id="payments" className="card stack-sm">
          <h2 className="h3">{t("Payments")}</h2>
          <p>{t(String(pol.payment_policy || ""))}</p>
          <p>{t("Payment opens after confirmation. A test payment moves through pending, then paid, failed, expired or cancelled; refunds are approved by a manager. A confirmed appointment and a paid order are separate states.")}</p>
        </section>
        <section id="reports" className="card stack-sm">
          <h2 className="h3">{t("Lab reports")}</h2>
          <p>{t("You review every value read from an image or PDF before it is used. Missing values stay empty; the units and ranges printed on your report come first. Deleting a report also clears conversation history that could contain its values.")}</p>
        </section>
        <section id="assistant" className="card stack-sm">
          <h2 className="h3">{t("The assistant")}</h2>
          <p>{t("It follows your language, asks for missing details and proposes actions you confirm, such as an appointment request. It does not diagnose, prescribe or change treatment, and it does not suggest extra tests just because a value is outside its range. Severe symptoms need urgent care, not this queue.")}</p>
          <p>{t(String(pol.discount_policy || ""))}</p>
        </section>
        <section id="team" className="card stack-sm">
          <h2 className="h3">{t("Talking to our team")}</h2>
          <p>{t(String(pol.handoff_policy || ""))}</p>
          <ul className="plain small">
            {c.branches.map((b) => (
              <li key={b.id}>
                {t(b.name)} · <span className="nowrap">{t(String(b.hours || ""))}</span>
              </li>
            ))}
          </ul>
          <div>
            <Link className="btn primary" href="/app?view=chat&team=1">
              {t("Talk to our team")}
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
