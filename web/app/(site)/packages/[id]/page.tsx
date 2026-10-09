import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { apiGet } from "@/lib/api/server";
import { getT } from "@/lib/i18n/server";
import { activePackages, getCommon } from "@/lib/site-data";
import { money } from "@/lib/format";
import type { Branch, Package, Policies } from "@/lib/types";
import { CompareTray } from "@/components/public/CompareTray";
import { CompareLink, CompareToggle, PackageRow } from "@/components/public/PackageRow";
import { Crumbs } from "@/components/public/Crumbs";
import "@/app/styles/public.css";

type Detail = { package: Package; branches: Branch[]; catalog_version: string; policy: Policies; related: Package[] };
type Props = { params: Promise<{ id: string }> };

/** Live from the API (routers/public.py), or computed from the catalog when the API sleeps. */
const loadDetail = cache(async (id: string): Promise<Detail | null> => {
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(id)) return null;
  try {
    return await apiGet<Detail>("/api/business/site/packages/" + encodeURIComponent(id));
  } catch (e) {
    if ((e as { status?: number }).status === 404) return null;
    const c = await getCommon();
    const all = activePackages(c);
    const p = all.find((x) => x.id === id);
    if (!p) return null;
    return {
      package: p,
      branches: c.branches.filter((b) => p.branch_ids.includes(b.id)),
      catalog_version: c.catalog.version,
      policy: c.policies,
      related: all.filter((x) => x.id !== id && x.segment === p.segment).slice(0, 3),
    };
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ id }, { t, tf }] = await Promise.all([params, getT()]);
  const d = await loadDetail(id);
  if (!d) return { title: t("Health check not found") };
  return {
    title: d.package.name,
    description: tf("What {name} includes, its simulated price of {price} and how to request it.", { name: d.package.name, price: money(d.package.price_thb) }),
  };
}

export default async function PackageDetailPage({ params }: Props) {
  const [{ id }, { t, tf }, c] = await Promise.all([params, getT(), getCommon()]);
  const d = await loadDetail(id);
  if (!d) notFound();
  const p = d.package;
  const names = Object.fromEntries(activePackages(c).map((x) => [x.id, x.name]));
  const tone = p.segment === "organization" ? " org" : p.staff_review_required ? " follow" : "";
  const n = p.services.length;
  const m = d.branches.length;
  return (
    <Suspense>
      <div className="wrap page-head">
        <Crumbs
          label={t("Breadcrumb")}
          items={[
            <Link key="home" href="/">{t("Home")}</Link>,
            <CompareLink key="packages" href="/packages">{t("Health checks")}</CompareLink>,
          ]}
          current={p.name}
        />
      </div>
      <div className="wrap detail-grid">
        <article className="stack detail-main">
          <div className="stack-sm">
            <div className="row">
              {p.segment === "organization" ? (
                <span className="badge org">{t("Organizations · 20+ people")}</span>
              ) : p.staff_review_required ? (
                <span className="badge follow">{t("Staff review before booking")}</span>
              ) : (
                <span className="badge">{t("Book directly")}</span>
              )}
              <span className="badge sim">{t("Simulated package")}</span>
            </div>
            <h1>{p.name}</h1>
            <p className="muted">
              {n === 1 ? t("1 included test") : tf("{n} included tests", { n })} · {m === 1 ? t("offered at 1 center") : tf("offered at {n} centers", { n: m })}
            </p>
          </div>
          <section className="card stack-sm" aria-labelledby="inc">
            <h2 className="h3" id="inc">{t("What is included")}</h2>
            <ul className="included">
              {p.services.map((s) => (
                <li key={s}>{t(s)}</li>
              ))}
            </ul>
            <p className="small muted">{t("Ask the assistant what any test measures. It answers from cited public references.")}</p>
          </section>
          <section className="card stack-sm" aria-labelledby="fit">
            <h2 className="h3" id="fit">{t("Is it right for me?")}</h2>
            {p.notes ? <p>{t(p.notes)}</p> : null}
            {p.staff_review_required ? (
              <p className="small">{t("Follow-up tests are reviewed with you first, to check overlap with recent results and whether a clinician should be involved. We do not recommend add-on tests automatically from an abnormal result.")}</p>
            ) : null}
          </section>
          <section className="card stack-sm" aria-labelledby="prep">
            <h2 className="h3" id="prep">{t("Before your visit")}</h2>
            <p>{t(d.policy.results_policy)}</p>
            <p className="small muted">{t("Our team confirms preparation instructions with your appointment.")}</p>
          </section>
          <section className="card stack-sm" aria-labelledby="where">
            <h2 className="h3" id="where">{t("Where it is offered")}</h2>
            <ul className="plain">
              {d.branches.map((b) => (
                <li key={b.id}>
                  <strong>{t(b.name)}</strong>{" "}
                  <span className="muted small">
                    · {t(String(b.area || ""))} · {t(String(b.hours || ""))}
                  </span>
                </li>
              ))}
            </ul>
            <p className="small">
              <Link href="/centers">{t("About our centers")}</Link>
            </p>
          </section>
          <section className="card stack-sm" aria-labelledby="policy">
            <h2 className="h3" id="policy">{t("Changes and payment")}</h2>
            <p className="small">{t(d.policy.cancellation_policy)}</p>
            <p className="small">{t(d.policy.payment_policy)}</p>
          </section>
        </article>
        <aside className={"buy-box card" + tone} aria-label={t("Price and next steps")}>
          <div className="pkg-price">
            <strong>{money(p.price_thb)}</strong>
            <span>{t(p.price_unit)}</span>
          </div>
          <p className="tiny muted">{tf("Simulated price · catalog {version}", { version: d.catalog_version })}</p>
          {p.segment === "organization" ? (
            <Link className="btn primary block" href={"/organizations?package=" + encodeURIComponent(p.id)}>
              {t("Request a quotation")}
            </Link>
          ) : p.staff_review_required ? (
            <Link className="btn primary block" href={"/app?ask=" + encodeURIComponent(p.id)}>
              {t("Ask our team to review")}
            </Link>
          ) : (
            <Link className="btn primary block" href={"/app?view=book&package=" + encodeURIComponent(p.id)}>
              {t("Request an appointment")}
            </Link>
          )}
          <Link className="btn block" href={"/app?package=" + encodeURIComponent(p.id)}>
            {t("Ask the assistant about it")}
          </Link>
          <CompareToggle id={p.id} name={p.name} label={t("Add to comparison")} />
        </aside>
      </div>
      {d.related.length ? (
        <section className="wrap section-tight pub-related" aria-labelledby="related-title">
          <div className="section-head">
            <h2 id="related-title">{t("Similar options")}</h2>
            <CompareLink href={"/packages?segment=" + p.segment}>{t("See all")}</CompareLink>
          </div>
          <div className="pkg-list">
            {d.related.map((r) => (
              <PackageRow key={r.id} p={r} />
            ))}
          </div>
        </section>
      ) : null}
      <CompareTray names={names} />
    </Suspense>
  );
}
