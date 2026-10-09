"use client";
/*
 * /sources: every public record the assistant may cite, grouped by the kind of publisher,
 * with filter chips (counts follow the text search) and a 2-line preview that expands.
 */
import { useDeferredValue, useId, useState } from "react";
import type { SourceRecord } from "@/lib/types";
import { useT } from "@/lib/i18n/client";
import type { Lang } from "@/lib/i18n/shared";
import { textLang } from "@/lib/format";

/** Display order and names; unknown types are shown after these with a readable label. */
export const PUBLISHER_TYPES: [string, string][] = [
  ["thai_government", "Thai government agencies"],
  ["thai_professional_society", "Thai professional societies"],
  ["thai_hospital", "Thai hospitals"],
  ["thai_university", "Thai universities and medical schools"],
  ["international_agency", "International health agencies"],
  ["international_reference", "International medical references"],
];
const typeOf = (r: SourceRecord) => r.publisher_type || "thai_hospital";
const humanize = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function reviewed(iso: string | undefined, lang: Lang) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function SourceItem({ r, lang }: { r: SourceRecord; lang: Lang }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const id = useId();
  const long = (r.content || "").length > 140;
  return (
    <li className="pub-src">
      <h3 className="pub-src-title">
        <a href={r.url} target="_blank" rel="noopener noreferrer">
          <span lang={r.language || textLang(r.title)}>{r.title}</span>
          <span className="sr-only"> {t("(opens in a new tab)")}</span>
        </a>
      </h3>
      <p className="pub-src-meta tiny">
        <span lang={textLang(r.publisher)}>{r.publisher}</span>
        {r.reviewed_at ? (
          <span>
            {t("Reviewed")} {reviewed(r.reviewed_at, lang)}
          </span>
        ) : null}
        {r.language ? <span className="mono">{r.language.toUpperCase()}</span> : null}
      </p>
      {r.content ? (
        <>
          <p className={"pub-src-text small" + (open ? " open" : "")} id={id} lang={r.language || textLang(r.content)}>
            {r.content}
          </p>
          {long ? (
            <button className="link-btn tiny pub-src-more" type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
              {open ? t("Show less") : t("Read more")}
            </button>
          ) : null}
        </>
      ) : null}
    </li>
  );
}

export function SourcesBrowser({ records }: { records: SourceRecord[] }) {
  const { t, tf, lang } = useT();
  const [type, setType] = useState("");
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query.trim().toLowerCase());

  const matched = q
    ? records.filter((r) => [r.title, r.publisher, ...(r.aliases || []), ...(r.topics || [])].join(" ").toLowerCase().includes(q))
    : records;
  const counts: Record<string, number> = {};
  for (const r of matched) counts[typeOf(r)] = (counts[typeOf(r)] || 0) + 1;
  const known = PUBLISHER_TYPES.map(([k]) => k);
  const order = [...known, ...Object.keys(counts).filter((k) => !known.includes(k)).sort()];
  const label = (k: string) => {
    const hit = PUBLISHER_TYPES.find(([key]) => key === k);
    return hit ? t(hit[1]) : humanize(k);
  };
  const shown = matched.filter((r) => !type || typeOf(r) === type);
  const groups = order.map((k) => ({ k, rows: shown.filter((r) => typeOf(r) === k) })).filter((g) => g.rows.length);
  const chips = order.filter((k) => counts[k] || k === type);

  return (
    <div className="stack pub-sources">
      <div className="pub-src-tools">
        <label className="field pub-src-search">
          <span className="sr-only">{t("Search sources")}</span>
          <input
            className="input"
            type="search"
            value={query}
            maxLength={80}
            autoComplete="off"
            placeholder={t("Search by title, publisher or test, e.g. HbA1c or ไขมัน")}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="row pub-chips" role="group" aria-label={t("Filter by type of publisher")}>
          <button className="chip" type="button" aria-pressed={!type} onClick={() => setType("")}>
            {t("All")} <span className="pub-chip-n">{matched.length}</span>
          </button>
          {chips.map((k) => (
            <button key={k} className="chip" type="button" aria-pressed={type === k} onClick={() => setType(type === k ? "" : k)}>
              {label(k)} <span className="pub-chip-n">{counts[k] || 0}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="small muted" aria-live="polite">
        {shown.length === 1 ? t("1 record shown") : tf("{n} records shown", { n: shown.length })}
      </p>
      {groups.length ? (
        groups.map((g) => (
          <section key={g.k} className="pub-src-group" aria-labelledby={"grp-" + g.k}>
            <h2 className="h3" id={"grp-" + g.k}>
              {label(g.k)} <span className="muted pub-src-count">{g.rows.length}</span>
            </h2>
            <ul className="pub-src-list">
              {g.rows.map((r) => (
                <SourceItem key={r.id} r={r} lang={lang} />
              ))}
            </ul>
          </section>
        ))
      ) : (
        <div className="state-box">
          <h3>{t("No source matches this search")}</h3>
          <p className="small muted">{t("Try a test name such as HbA1c, or clear the search.")}</p>
          <button
            className="btn"
            type="button"
            onClick={() => {
              setQuery("");
              setType("");
            }}
          >
            {t("Clear search")}
          </button>
        </div>
      )}
    </div>
  );
}
