import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { getSources } from "@/lib/site-data";
import { Crumbs } from "@/components/public/Crumbs";
import { SourcesBrowser } from "@/components/public/SourcesBrowser";
import "@/app/styles/public.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return {
    title: t("Medical sources"),
    description: t("The public references the assistant may cite, from Thai government agencies, professional societies, hospitals, universities and international bodies, with review dates."),
  };
}

export default async function SourcesPage() {
  const [{ t, tf }, s] = await Promise.all([getT(), getSources()]);
  const publishers = Object.keys(s.publishers).filter(Boolean).length;
  return (
    <>
      <div className="wrap page-head">
        <Crumbs label={t("Breadcrumb")} items={[<Link key="home" href="/">{t("Home")}</Link>]} current={t("Medical sources")} />
        <h1>{t("Medical sources")}</h1>
        <p className="muted">
          {tf("The assistant may cite only these {n} reviewed public records from {p} publishers (catalog {version}). Business information such as prices comes from our simulated catalog and policies instead.", {
            n: s.records.length,
            p: publishers,
            version: s.version,
          })}
        </p>
      </div>
      <div className="wrap stack pub-sources-page">
        <SourcesBrowser records={s.records} />
        <p className="small muted">{t("Reference intervals in these sources are context, not personal decision limits. Ranges printed on your own report take precedence. Synthetic test reports are never used as medical knowledge.")}</p>

        <section className="pub-orgref" id="org-documents" aria-labelledby="orgref-title">
          <h2 className="h3" id="orgref-title">
            {t("Organization and hospital references")}
          </h2>
          <p>{t("A hospital, clinic group or company that works with LabClear can add its own documents, such as its laboratory's reference ranges or preparation instructions. They are not listed on this public page.")}</p>
          <ul className="pub-orgref-list small">
            <li>{t("LabClear staff review every document before the assistant can cite it.")}</li>
            <li>{t("It is used only for members of that organization, and cited with the organization as publisher.")}</li>
            <li>{t("It is never sent to an AI provider to build embeddings; it is searched on our server only.")}</li>
          </ul>
          <p className="small">
            <Link href="/organizations#orgdocs-title">{t("Use your own hospital's documents")}</Link>
          </p>
        </section>
      </div>
    </>
  );
}
