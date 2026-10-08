import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { getCommon } from "@/lib/site-data";
import { Crumbs } from "@/components/public/Crumbs";
import "@/app/styles/public.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("Our centers"), description: t("Three simulated service centers with opening hours, booking slots and the packages each one offers.") };
}

export default async function CentersPage() {
  const [{ t, tf }, c] = await Promise.all([getT(), getCommon()]);
  return (
    <>
      <div className="wrap page-head">
        <Crumbs label={t("Breadcrumb")} items={[<Link key="home" href="/">{t("Home")}</Link>]} current={t("Centers")} />
        <h1>{t("Our centers")}</h1>
        <p className="muted">{t("Three simulated service areas. Every appointment request is confirmed by the team at that center.")}</p>
      </div>
      <div className="wrap center-list">
        {c.branches.map((b) => {
          const zone = String(b.timezone || "Asia/Bangkok").split("/").pop()!.replace(/_/g, " ");
          const closed = ((b.closed_days as string[]) || []).map((d) => t(d)).join(", ");
          return (
            <article className="card center-row" id={b.id} key={b.id}>
              <div className="stack-sm">
                <h2 className="h3">{b.name}</h2>
                <p className="muted">{t(String(b.area || ""))}</p>
                <dl className="facts small">
                  <div>
                    <dt>{t("Hours")}</dt>
                    <dd>
                      {t(String(b.hours || ""))}, <span className="nowrap">{tf("{zone} time", { zone: t(zone) })}</span>
                    </dd>
                  </div>
                  <div>
                    <dt>{t("Slots")}</dt>
                    <dd>{tf("Every {minutes} minutes, up to {n} visits each", { minutes: Number(b.booking_slot_minutes || 30), n: b.capacity_per_slot })}</dd>
                  </div>
                  {closed ? (
                    <div>
                      <dt>{t("Closed")}</dt>
                      <dd>{closed}</dd>
                    </div>
                  ) : null}
                </dl>
                {b.address_disclaimer ? <p className="callout warn small">{t(String(b.address_disclaimer))}</p> : null}
              </div>
              <div className="stack-sm center-actions">
                <Link className="btn primary" href={"/app?view=book&branch=" + encodeURIComponent(b.id)}>
                  {t("Request a time here")}
                </Link>
                <Link className="btn" href={"/packages?branch_id=" + encodeURIComponent(b.id)}>
                  {t("Packages offered")}
                </Link>
                {b.lat != null && b.lng != null ? (
                  <a className="btn ghost" href={`https://www.google.com/maps/search/?api=1&query=${b.lat},${b.lng}`} target="_blank" rel="noopener noreferrer">
                    {t("Open area in Google Maps")}
                    <span className="sr-only"> {t("(opens in a new tab)")}</span>
                  </a>
                ) : null}
              </div>
            </article>
          );
        })}
        <p className="small muted">
          {c.maps_embed_key ? t("Embedded maps are enabled.") : t("Embedded maps are not configured; links open Google Maps.")} {t(String(c.policies.handoff_policy || ""))}
        </p>
      </div>
    </>
  );
}
