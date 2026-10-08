import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { getCommon } from "@/lib/site-data";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SearchDialog } from "@/components/site/SearchDialog";
import { Dock } from "@/components/chat/Dock";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getT();
  const common = await getCommon();
  return (
    <div className="site">
      <a className="skip" href="#main">
        {t("Skip to content")}
      </a>
      <div className="sim-note" role="note">
        <div className="wrap">
          <span>{t("Coursework simulation: packages, prices and centers are simulated, and no real payment or clinical service takes place.")}</span>
          <Link href="/help#simulation">{t("What is simulated")}</Link>
        </div>
      </div>
      <SiteHeader />
      <main id="main" className="rails">
        {children}
      </main>
      <SiteFooter version={common.version} hospitalLinks={!!common.features?.hospital_links} />
      <SearchDialog />
      <Dock />
    </div>
  );
}
