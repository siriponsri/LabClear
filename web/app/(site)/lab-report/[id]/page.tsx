import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { Crumbs } from "@/components/public/Crumbs";
import { LabReportView } from "@/components/public/LabReportView";
import "@/app/styles/public.css";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("Lab Report"), description: t("Your confirmed laboratory values on the ranges printed on your report.") };
}

/* Values load in the browser with the owner's session; this page holds no report data. */
export default async function LabReportPage({ params }: Props) {
  const [{ id }, { t }] = await Promise.all([params, getT()]);
  return (
    <div className="lab-report-page">
      <div className="wrap page-head no-print">
        <Crumbs
          label={t("Breadcrumb")}
          items={[<Link key="labs" href="/app?view=labs">{t("Lab dashboard")}</Link>, <Link key="reports" href="/app?view=reports">{t("My reports")}</Link>]}
          current={t("Lab Report")}
        />
      </div>
      <LabReportView id={id.slice(0, 80)} />
    </div>
  );
}
