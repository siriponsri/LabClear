import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { apiGet } from "@/lib/api/server";
import { Crumbs } from "@/components/public/Crumbs";
import "@/app/styles/public.css";

/*
 * Official hospital pages (integration 4.0). Codex data and rules (services/hospital_links.py):
 * external, reviewed URLs only; a price is shown only for a VERIFIED, current offer; no booking,
 * partnership or clinical recommendation is implied. Hidden unless HOSPITAL_LINKS_ENABLED is true.
 */
type Offer = {
  id: string;
  hospital: string;
  branch: string;
  variant: string;
  url: string;
  price_thb: number | null;
  current_offer: boolean;
  state: string;
  eligibility: string;
  fees: string;
  sale_until: string | null;
  service_until: string | null;
  checked_at: string;
  source_locator: string;
};
type Links = { version: string; affiliation: string; offers: Offer[] };

export const dynamic = "force-dynamic";

async function load(): Promise<Links | null> {
  try {
    return await apiGet<Links>("/api/business/site/hospital-links");
  } catch {
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("Packages on hospital websites"), description: t("Links to official hospital pages, separate from LabClear's simulated packages. No partnership or booking is implied.") };
}

export default async function HospitalLinksPage() {
  const [{ t, tf, lang }, data] = await Promise.all([getT(), load()]);
  if (!data) notFound();
  const states: Record<string, string> = {
    STALE: t("The information needs a new review"),
    UNVERIFIED: t("Check the exact programme and conditions with the hospital"),
    EXPIRED_SALE: t("The sale period has ended"),
    EXPIRED_SERVICE: t("The service period has ended"),
    NOT_YET_ON_SALE: t("Not on sale yet"),
  };
  const money = (n: number) => n.toLocaleString(lang === "th" ? "th-TH" : "en-US", { maximumFractionDigits: 0 });
  return (
    <>
      <div className="wrap page-head">
        <Crumbs label={t("Breadcrumb")} items={[<Link key="home" href="/">{t("Home")}</Link>]} current={t("Hospital websites")} />
        <h1>{t("See the details on the hospital's own website")}</h1>
        <p className="muted">{t("These external links are separate from LabClear's simulated packages. No partnership or booking is confirmed. Choose a check with a health professional; more tests do not mean a better check.")}</p>
      </div>
      <div className="wrap center-list">
        {data.offers.map((o) => (
          <article className="card center-row" id={o.id} key={o.id}>
            <div className="stack-sm">
              <h2 className="h3">{o.hospital}</h2>
              <p className="muted">{o.branch}</p>
              <p>
                <strong>{o.variant}</strong>
              </p>
              {o.current_offer && o.price_thb !== null ? (
                <p>
                  <strong className="num">{tf("{price} THB", { price: money(o.price_thb) })}</strong> · <span className="small muted">{t("Price as shown on the reviewed source page")}</span>
                </p>
              ) : (
                <p className="callout warn small">
                  <strong>{t("Current price not confirmed")}</strong> · {states[o.state] || t("Check with the hospital")}
                </p>
              )}
              <dl className="facts small">
                <div>
                  <dt>{t("Eligibility")}</dt>
                  <dd>{o.eligibility}</dd>
                </div>
                <div>
                  <dt>{t("Fees")}</dt>
                  <dd>{o.fees}</dd>
                </div>
                <div>
                  <dt>{t("Sale until")}</dt>
                  <dd>{o.sale_until || t("Not confirmed")}</dd>
                </div>
                <div>
                  <dt>{t("Service until")}</dt>
                  <dd>{o.service_until || t("Not confirmed (not automatically the same as the sale date)")}</dd>
                </div>
                <div>
                  <dt>{t("Tests included and excluded")}</dt>
                  <dd>{t("Not fully confirmed; read the programme details on the hospital website.")}</dd>
                </div>
              </dl>
              <p className="tiny muted">{tf("Checked {date} · {where}", { date: o.checked_at, where: o.source_locator })}</p>
            </div>
            <div className="stack-sm center-actions">
              <a className="btn primary" href={o.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
                {t("View on the hospital website")}
                <span className="sr-only"> {t("(opens in a new tab)")}</span>
              </a>
            </div>
          </article>
        ))}
        <p className="small muted">{t("LabClear does not send your results or account details with these links. Anything you do next follows the hospital's own terms and privacy policy.")}</p>
      </div>
    </>
  );
}
