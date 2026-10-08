import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getT } from "@/lib/i18n/server";
import { activePackages, getCommon } from "@/lib/site-data";
import { Catalog } from "@/components/public/Catalog";
import { CompareTray } from "@/components/public/CompareTray";
import { Crumbs } from "@/components/public/Crumbs";
import "@/app/styles/public.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return {
    title: t("Health checks"),
    description: t("Search health-check packages by test name in Thai or English, filter by price or center, and compare up to three side by side."),
  };
}

export default async function PackagesPage() {
  const [{ t }, c] = await Promise.all([getT(), getCommon()]);
  const packages = activePackages(c);
  const names = Object.fromEntries(packages.map((p) => [p.id, p.name]));
  return (
    <>
      <div className="wrap page-head">
        <Crumbs label={t("Breadcrumb")} items={[<Link key="home" href="/">{t("Home")}</Link>]} current={t("Health checks")} />
        <h1>{t("Health checks")}</h1>
        <p className="muted">{t("Search by test name in Thai or English, filter by who it is for, price or center, and compare up to three side by side.")}</p>
      </div>
      <Suspense>
        <Catalog packages={packages} branches={c.branches.map((b) => ({ id: b.id, name: b.name }))} catalogVersion={c.catalog.version} />
        <CompareTray names={names} />
      </Suspense>
    </>
  );
}
