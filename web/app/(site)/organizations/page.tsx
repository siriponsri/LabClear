import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { activePackages, getCommon } from "@/lib/site-data";
import { money } from "@/lib/format";
import { Crumbs } from "@/components/public/Crumbs";
import { InquiryForm } from "@/components/public/InquiryForm";
import "@/app/styles/public.css";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return {
    title: t("Health checks for organizations"),
    description: t("Request a quotation for team health checks at a center or at your workplace, and let the assistant cite your hospital's own reviewed documents."),
  };
}

export default async function OrganizationsPage({ searchParams }: Props) {
  const [sp, { t, tf }, c] = await Promise.all([searchParams, getT(), getCommon()]);
  const org = activePackages(c).filter((p) => p.segment === "organization");
  const min = c.policies.organization_min_people || 20;
  const preselect = typeof sp.package === "string" ? sp.package : "";
  return (
    <>
      <div className="wrap page-head">
        <Crumbs label={t("Breadcrumb")} items={[<Link key="home" href="/">{t("Home")}</Link>]} current={t("For organizations")} />
        <h1>{t("Health checks for organizations")}</h1>
        <p className="muted">{tf("For teams of {n} or more, at one of our centers or at your workplace.", { n: min })}</p>
      </div>
      <div className="wrap org-grid">
        <section className="stack" aria-labelledby="org-packages">
          <h2 className="h3" id="org-packages">
            {t("Organization packages")}
          </h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">{t("Package")}</th>
                  <th scope="col">{t("Includes")}</th>
                  <th scope="col" className="n">
                    {t("Per person")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {org.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={"/packages/" + encodeURIComponent(p.id)}>{p.name}</Link>
                    </td>
                    <td className="small">{p.services.join(", ")}</td>
                    <td className="n">
                      <strong>{money(p.price_thb)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ol className="steps compact">
            <li>
              <strong>{t("Send your request")}</strong>
              <span>{t("Headcount, dates and whether you need onsite service.")}</span>
            </li>
            <li>
              <strong>{t("Receive a quotation")}</strong>
              <span>{tf("A coordinator prepares it, valid for {n} days. Revisions create a new version; you can download each as a PDF.", { n: c.policies.quote_valid_days || 7 })}</span>
            </li>
            <li>
              <strong>{t("Accept and plan")}</strong>
              <span>{t("Accepting creates the service appointment. Payment is arranged with our team.")}</span>
            </li>
          </ol>
          <div className="callout small">
            <strong>{t("Privacy:")}</strong> {t(c.policies.privacy_policy)}
          </div>
          <p className="small muted">
            {t(String(c.policies.onsite_service || ""))} {t(String(c.policies.discount_policy || ""))}
          </p>
        </section>
        <InquiryForm packages={org.map((p) => ({ id: p.id, name: p.name }))} branches={c.branches.map((b) => ({ id: b.id, name: b.name }))} minPeople={min} preselect={preselect} />
      </div>

      <section className="wrap pub-orgdocs" aria-labelledby="orgdocs-title">
        <div className="pub-orgdocs-head">
          <h2 id="orgdocs-title">{t("Use your own hospital's documents")}</h2>
          <p className="muted">
            {t("Hospitals, clinic groups and companies can add their own references, such as the laboratory's printed reference ranges or preparation instructions. The assistant then cites them for your members, next to the public sources.")}
          </p>
        </div>
        <ol className="pub-steps">
          <li>
            <span className="pub-step-num num" aria-hidden="true">
              1
            </span>
            <h3>{t("LabClear creates your organization and a join code")}</h3>
            <p className="small muted">{t("Our team sets up the organization. Your staff join with the code from their own LabClear accounts.")}</p>
          </li>
          <li>
            <span className="pub-step-num num" aria-hidden="true">
              2
            </span>
            <h3>{t("Your organization admin uploads documents")}</h3>
            <p className="small muted">{t("PDF with selectable text, Word (.docx) or TXT, up to 5 MB each. The text is kept encrypted; the original file is not stored.")}</p>
          </li>
          <li>
            <span className="pub-step-num num" aria-hidden="true">
              3
            </span>
            <h3>{t("Our staff review it, then the chat cites it for your members")}</h3>
            <p className="small muted">{t("Nothing is used until a LabClear manager approves it. Only members of your organization see these citations.")}</p>
          </li>
        </ol>
        <div className="pub-orgdocs-foot">
          <p className="small muted">{t("Organization documents are searched on our server only and are never sent to an AI provider to build embeddings.")}</p>
          <div className="row">
            <Link className="btn primary" href="/app?view=orgs">
              {t("Open organization settings")}
            </Link>
            <Link className="btn" href="/sources#org-documents">
              {t("How references are reviewed")}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
