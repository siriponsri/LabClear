"use client";
/* Package comparison opened from an answer, beside the conversation (a sheet on narrow screens).
   The highlighted column is the package the user is looking at, never a "popular" pick. */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { useT } from "@/lib/i18n/client";
import { money } from "@/lib/format";

type Compare = {
  catalog_version: string;
  packages: { id: string; name: string; segment: string; staff_review_required: boolean; price_thb: number }[];
  services: { name: string; included: boolean[] }[];
};

export function Canvas({ ids, focus, onClose }: { ids: string[]; focus?: string; onClose: () => void }) {
  const { t, tf } = useT();
  const [d, setD] = useState<Compare | null>(null);
  const [error, setError] = useState("");
  const close = useRef<HTMLButtonElement>(null);
  const key = ids.join(",");

  useEffect(() => {
    let alive = true;
    setD(null);
    setError("");
    api
      .get<Compare>("/catalog/compare?ids=" + ids.map(encodeURIComponent).join(","))
      .then((x) => {
        if (!alive) return;
        setD(x);
        requestAnimationFrame(() => close.current?.focus());
      })
      .catch((e) => alive && setError(t((e as Error).message)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, t]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector("dialog[open]") && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const sel = focus || ids[0];
  return (
    <aside className="canvas" aria-label={t("Package comparison")}>
      <div className="canvas-head">
        <div>
          <h2>{t("Package comparison")}</h2>
          {d ? <p className="small muted">{tf("Included tests and simulated prices from catalog {version}.", { version: d.catalog_version })}</p> : null}
        </div>
        <button ref={close} type="button" className="icon-btn" aria-label={t("Close comparison")} onClick={onClose}>
          ×
        </button>
      </div>
      {error ? <p className="callout bad">{error}</p> : null}
      {!d && !error ? (
        <p className="loading small muted" aria-busy="true">
          {t("Loading comparison")}
        </p>
      ) : null}
      {d ? (
        <div className="table-wrap">
          <table className="compare-grid">
            <thead>
              <tr>
                <th scope="col">{t("Includes")}</th>
                {d.packages.map((p) => (
                  <th key={p.id} scope="col" className={p.id === sel ? "sel" : undefined}>
                    <strong>{p.name}</strong>
                    <span>{p.segment === "organization" ? t("Organizations") : p.staff_review_required ? t("Reviewed first") : t("Book directly")}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.services.map((s) => (
                <tr key={s.name}>
                  <th scope="row">{s.name}</th>
                  {s.included.map((inc, i) => (
                    <td key={i} className={(inc ? "yes" : "no") + (d.packages[i].id === sel ? " sel" : "")} aria-label={inc ? t("Included") : t("Not included")}>
                      {inc ? "✓" : "–"}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="price-row">
                <th scope="row">
                  <span className="sr-only">{t("Price")}</span>
                </th>
                {d.packages.map((p) => (
                  <td key={p.id} className={p.id === sel ? "sel" : undefined}>
                    <strong className="num">{money(p.price_thb)}</strong>
                    <Link href={"/packages/" + p.id}>{t("View details")}</Link>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </aside>
  );
}
