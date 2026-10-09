import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { getCommon } from "@/lib/site-data";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

// Unknown addresses keep the website header, so the TH/EN switch and the navigation stay available.
export default async function NotFound() {
  const [{ t }, common] = await Promise.all([getT(), getCommon()]);
  return (
    <div className="site">
      <a className="skip" href="#main">
        {t("Skip to content")}
      </a>
      <SiteHeader />
      <main id="main" className="wrap page-head" style={{ minHeight: "60vh" }}>
        <h1>{t("Page not found")}</h1>
        <p className="muted">{t("This page does not exist.")}</p>
        <p>
          <Link className="btn primary" href="/">
            {t("Home")}
          </Link>
        </p>
      </main>
      <SiteFooter version={common.version} hospitalLinks={!!common.features?.hospital_links} />
    </div>
  );
}
