"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useT } from "@/lib/i18n/client";
import { useCompare } from "./useCompare";

/** Floating tray on /packages and package pages; its contents come from ?compare=. */
export function CompareTray({ names }: { names: Record<string, string> }) {
  const { t, tf } = useT();
  const { ids, toggle, clear } = useCompare();
  const items = ids.filter((id) => names[id]);
  const shown = items.length > 0;

  useEffect(() => {
    document.body.classList.toggle("has-tray", shown);
    return () => document.body.classList.remove("has-tray");
  }, [shown]);

  return (
    <>
      <p className="sr-only" aria-live="polite">
        {shown ? tf("{n} of 3 selected for comparison", { n: items.length }) : ""}
      </p>
      {shown ? (
        <aside className="compare-tray" aria-label={t("Comparison")}>
          <strong className="small">{t("Compare")}</strong>
          <ul>
            {items.map((id) => (
              <li key={id}>
                <button className="chip" type="button" onClick={() => toggle(id, false)} aria-label={tf("Remove {name} from comparison", { name: names[id] })}>
                  {names[id]} <span className="x" aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
          {items.length < 2 ? (
            <a className="btn primary sm" aria-disabled="true" role="link">
              {t("Add one more to compare")}
            </a>
          ) : (
            <Link className="btn primary sm" href={"/compare?ids=" + items.join(",")}>
              {tf("Compare {n}", { n: items.length })}
            </Link>
          )}
          <button className="btn ghost sm" type="button" onClick={clear}>
            {t("Clear")}
          </button>
        </aside>
      ) : null}
    </>
  );
}
