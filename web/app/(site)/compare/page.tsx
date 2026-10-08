import type { Metadata } from "next";
import Link from "next/link";
import { apiGet } from "@/lib/api/server";
import { getT } from "@/lib/i18n/server";
import { activePackages, getCommon } from "@/lib/site-data";
import { money } from "@/lib/format";
import type { Package } from "@/lib/types";
import { parseCompare } from "@/components/public/compare";
import { Crumbs } from "@/components/public/Crumbs";
import "@/app/styles/public.css";

type Comparison = { packages: Package[]; services: { name: string; included: boolean[] }[]; price_difference: number[]; catalog_version: string };
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("Compare health checks"), description: t("Included tests and simulated prices of up to three health checks, side by side.") };
}

/** routers/public.py /compare, with the same rules computed locally when the API is asleep. */
async function load(ids: string[]): Promise<{ comparison: Comparison | null; error: string }> {
  try {
    return await apiGet<{ comparison: Comparison | null; error: string }>("/api/business/site/compare?ids=" + encodeURIComponent(ids.join(",")));
  } catch {
    if (ids.length < 2) return { comparison: null, error: "Choose two or three health checks to compare." };
    const c = await getCommon();
    const index = Object.fromEntries(activePackages(c).map((p) => [p.id, p]));
    if (ids.some((i) => !index[i])) return { comparison: null, error: "A health check in this comparison is unavailable." };
    const selected = ids.map((i) => index[i]);
    const services: string[] = [];
    for (const p of selected) for (const s of p.services) if (!services.includes(s)) services.push(s);
    const cheapest = Math.min(...selected.map((p) => p.price_thb));
    return {
      comparison: {
        packages: selected,
        services: services.map((s) => ({ name: s, included: selected.map((p) => p.services.includes(s)) })),
        price_difference: selected.map((p) => p.price_thb - cheapest),
        catalog_version: c.catalog.version,
      },
      error: "",
    };
  }
}

export default async function ComparePage({ searchParams }: Props) {
  const [sp, { t, tf }] = await Promise.all([searchParams, getT()]);
  const ids = parseCompare(sp.ids ?? sp.compare);
  const { comparison, error } = ids.length >= 2 ? await load(ids) : { comparison: null, error: "" };
  const list = comparison ? comparison.packages.map((p) => p.id) : ids;
  const without = (id: string) => list.filter((x) => x !== id);
  return (
    <>
      <div className="wrap page-head">
        <Crumbs
          label={t("Breadcrumb")}
          items={[<Link key="home" href="/">{t("Home")}</Link>, <Link key="pk" href={ids.length ? "/packages?compare=" + ids.join(",") : "/packages"}>{t("Health checks")}</Link>]}
          current={t("Compare")}
        />
        <h1>{t("Compare health checks")}</h1>
      </div>
      <div className="wrap section-tight pub-compare">
        {comparison ? (
          <>
            <div className="table-wrap">
              <table className="data compare-table">
                <caption className="sr-only">{t("Included tests and simulated prices")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t("Test")}</th>
                    {comparison.packages.map((p) => (
                      <th scope="col" key={p.id}>
                        <Link href={"/packages/" + encodeURIComponent(p.id) + "?compare=" + list.join(",")}>{p.name}</Link>
                        <Link
                          className="pub-remove tiny"
                          href={without(p.id).length >= 2 ? "/compare?ids=" + without(p.id).join(",") : "/packages?compare=" + without(p.id).join(",")}
                          aria-label={tf("Remove {name} from comparison", { name: p.name })}
                        >
                          {t("Remove")}
                        </Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">{t("Price")}</th>
                    {comparison.packages.map((p, i) => (
                      <td key={p.id}>
                        <strong>{money(p.price_thb)}</strong> <span className="tiny muted nowrap">{t(p.price_unit)}</span>
                        {comparison.price_difference[i] ? (
                          <>
                            <br />
                            <span className="tiny muted">{tf("+{amount} vs the lowest", { amount: money(comparison.price_difference[i]) })}</span>
                          </>
                        ) : null}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">{t("Booking")}</th>
                    {comparison.packages.map((p) => (
                      <td key={p.id}>{p.segment === "organization" ? t("Organization quotation") : p.staff_review_required ? t("Staff review first") : t("Book directly")}</td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">{t("Number of tests")}</th>
                    {comparison.packages.map((p) => (
                      <td key={p.id}>{p.services.length}</td>
                    ))}
                  </tr>
                  {comparison.services.map((s) => (
                    <tr key={s.name}>
                      <th scope="row">{s.name}</th>
                      {s.included.map((inc, i) => (
                        <td key={i} className={inc ? "yes" : "no"}>
                          {inc ? t("Included") : t("Not included")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row compare-actions">
              <Link className="btn primary" href={"/app?compare=" + list.join(",")}>
                {t("Ask the assistant to compare for me")}
              </Link>
              <Link className="btn" href={"/packages?compare=" + list.join(",")}>
                {t("Change selection")}
              </Link>
              <Link className="btn ghost" href="/packages">
                {t("Clear comparison")}
              </Link>
            </div>
            <p className="tiny muted pub-note">
              {tf("Prices from catalog {version} (simulated). More tests is not automatically better; the assistant can explain the differences with sources.", { version: comparison.catalog_version })}
            </p>
          </>
        ) : (
          <div className="state-box">
            <h3>{t("Choose two or three health checks")}</h3>
            <p className="muted small">{error ? t(error) : ids.length === 1 ? t("One is selected. Add one more from the catalog to compare.") : t("Tick “Compare” on any package to add it here.")}</p>
            <Link className="btn primary" href={ids.length ? "/packages?compare=" + ids.join(",") : "/packages"}>
              {t("Browse health checks")}
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
