"use client";
import Link from "next/link";
import type { Package } from "@/lib/types";
import { money } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import type { T } from "@/lib/i18n/shared";
import { useCompare } from "./useCompare";

export function kindLabel(p: Pick<Package, "segment" | "staff_review_required">, t: T) {
  if (p.segment === "organization") return t("For organizations of 20 or more");
  if (p.staff_review_required) return t("Follow-up test, reviewed with our team before booking");
  return t("Book directly");
}

/** "Compare" checkbox bound to ?compare= in the address bar. */
export function CompareToggle({ id, name, label }: { id: string; name: string; label?: string }) {
  const { t, tf } = useT();
  const { ids, toggle } = useCompare();
  const on = ids.includes(id);
  return (
    <label className="compare-toggle">
      <input type="checkbox" checked={on} onChange={(e) => toggle(id, e.target.checked)} aria-label={tf(on ? "Remove {name} from comparison" : "Add {name} to comparison", { name })} />
      {label || t("Compare")}
    </label>
  );
}

/** A link that carries the current comparison along (?compare=...). */
export function CompareLink({ href, className, children, ...rest }: { href: string; className?: string; children: React.ReactNode } & Omit<React.ComponentProps<typeof Link>, "href">) {
  const { link } = useCompare();
  return (
    <Link href={link(href)} className={className} {...rest}>
      {children}
    </Link>
  );
}

/** One catalog row, the same markup as the 3.x package_card macro. */
export function PackageRow({ p }: { p: Package }) {
  const { t } = useT();
  const { link } = useCompare();
  return (
    <article className="pkg-row" data-package={p.id}>
      <div>
        <h3>
          <Link href={link("/packages/" + encodeURIComponent(p.id))}>{p.name}</Link>
        </h3>
        <p className="kind">{kindLabel(p, t)}</p>
      </div>
      <ul className="pkg-tests" aria-label={t("Included tests")}>
        {p.services.map((s) => (
          <li key={s}>{t(s)}</li>
        ))}
      </ul>
      <div className="pkg-price">
        <strong>{money(p.price_thb)}</strong>
        <span>{t(p.price_unit)}</span>
      </div>
      <div className="pkg-actions">
        <CompareToggle id={p.id} name={p.name} />
      </div>
    </article>
  );
}
