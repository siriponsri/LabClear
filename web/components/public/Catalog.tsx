"use client";
/*
 * /packages: search (Thai or English test words), filters, sort and the comparison tray.
 * Filters live in the address bar so Back/Forward and shared links work; results are computed
 * from the live catalog the server passed in, so typing never waits for the network.
 * Without JavaScript the same form submits as GET and the server renders the results.
 */
import Link from "next/link";
import { useDeferredValue, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import type { Branch, Package } from "@/lib/types";
import { money, textLang } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { filterPackages, PRICE_STEPS, readFilters, SORTS, type Filters } from "./search";
import { queryString } from "./compare";
import { PackageRow } from "./PackageRow";

type Props = { packages: Package[]; branches: Pick<Branch, "id" | "name">[]; catalogVersion: string };

const EXAMPLES = ["น้ำตาล", "ไขมัน", "ไต", "HbA1c", "Lipid"];
const noop = () => () => {};

export function Catalog({ packages, branches, catalogVersion }: Props) {
  const { t, tf } = useT();
  const params = useSearchParams();
  const filters = readFilters((k) => params.get(k));
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  // false while rendering on the server, so the no-JavaScript form keeps its submit button.
  const live = useSyncExternalStore(noop, () => true, () => false);

  // The search box keeps its own state so typing is never interrupted; the URL follows it.
  const [q, setQ] = useState(filters.q);
  const [seen, setSeen] = useState(filters.q);
  if (filters.q !== seen) {
    setSeen(filters.q);
    setQ(filters.q);
  }
  const deferredQ = useDeferredValue(q);
  const results = filterPackages(packages, { ...filters, q: deferredQ });

  function navigate(next: Partial<Filters>, mode: "push" | "replace" = "push") {
    const merged = { ...filters, q, ...next };
    const url = new URLSearchParams();
    if (merged.q.trim()) url.set("q", merged.q.trim());
    if (merged.segment) url.set("segment", merged.segment);
    if (merged.review) url.set("review", merged.review);
    if (merged.max_price) url.set("max_price", merged.max_price);
    if (merged.branch_id) url.set("branch_id", merged.branch_id);
    if (merged.sort && merged.sort !== "featured") url.set("sort", merged.sort);
    const compare = params.get("compare");
    if (compare) url.set("compare", compare);
    const href = "/packages" + queryString(url);
    if (mode === "push") window.history.pushState(null, "", href);
    else window.history.replaceState(null, "", href);
  }
  function typed(value: string) {
    setQ(value);
    setSeen(value.trim());
    navigate({ q: value }, "replace");
  }
  function reset() {
    setQ("");
    setSeen("");
    navigate({ q: "", segment: "", review: "", max_price: "", branch_id: "", sort: "featured" });
  }

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name || id;
  const chips: { key: keyof Filters; label: string }[] = [];
  if (filters.q) chips.push({ key: "q", label: "“" + filters.q + "”" });
  if (filters.segment) chips.push({ key: "segment", label: filters.segment === "organization" ? t("Organizations") : t("Individuals") });
  if (filters.review) chips.push({ key: "review", label: filters.review === "only" ? t("Staff review first") : t("Book directly") });
  if (filters.max_price) chips.push({ key: "max_price", label: tf("Up to {price}", { price: money(Number(filters.max_price)) }) });
  if (filters.branch_id) chips.push({ key: "branch_id", label: branchName(filters.branch_id) });

  const askText = filters.q ? tf("I am looking for a health check that includes {q}.", { q: filters.q }) : t("I am looking for a health check.");
  const count = results.length;

  return (
    <div className="wrap catalog" data-catalog data-live={live ? "" : undefined}>
      <form
        className={"filters card" + (open ? " open" : "")}
        id="filters"
        action="/packages"
        method="get"
        role="search"
        aria-label={t("Filters")}
        ref={form}
        onSubmit={(e) => {
          e.preventDefault();
          setOpen(false);
        }}
      >
        <div className="filters-head">
          <h2 className="h3">{t("Filters")}</h2>
          <a
            className="small"
            href="/packages"
            onClick={(e) => {
              e.preventDefault();
              reset();
            }}
          >
            {t("Reset all")}
          </a>
        </div>
        <label className="field">
          {t("Search by test name")}
          <input
            className="input"
            type="search"
            name="q"
            value={q}
            maxLength={80}
            autoComplete="off"
            placeholder={t("e.g. sugar, cholesterol, HbA1c")}
            onChange={(e) => typed(e.target.value)}
          />
          <span className="hint">
            {t("Thai or English both work, for example {word} finds glucose tests.").split("{word}").map((part, i) => (
              <span key={i}>
                {i ? <span lang="th">น้ำตาล</span> : null}
                {part}
              </span>
            ))}
          </span>
        </label>
        <fieldset>
          <legend>{t("Who it is for")}</legend>
          {[
            ["", t("Everyone")],
            ["individual", t("Individuals and families")],
            ["organization", t("Organizations (20+ people)")],
          ].map(([v, label]) => (
            <label className="check" key={v || "all"}>
              <input type="radio" name="segment" value={v} checked={filters.segment === v} onChange={() => navigate({ segment: v })} /> {label}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>{t("Booking")}</legend>
          {[
            ["", t("Any")],
            ["excluded", t("Book directly")],
            ["only", t("Needs staff review first")],
          ].map(([v, label]) => (
            <label className="check" key={v || "any"}>
              <input type="radio" name="review" value={v} checked={filters.review === v} onChange={() => navigate({ review: v })} /> {label}
            </label>
          ))}
        </fieldset>
        <label className="field">
          {t("Maximum price (THB)")}
          <select className="input" name="max_price" value={filters.max_price} onChange={(e) => navigate({ max_price: e.target.value })}>
            <option value="">{t("No limit")}</option>
            {PRICE_STEPS.map((v) => (
              <option key={v} value={String(v)}>
                {tf("Up to {price}", { price: money(v) })}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {t("Center")}
          <select className="input" name="branch_id" value={filters.branch_id} onChange={(e) => navigate({ branch_id: e.target.value })}>
            <option value="">{t("All centers")}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {t(b.name)}
              </option>
            ))}
          </select>
        </label>
        <button className="btn primary filters-apply" type="submit">
          {t("Show results")}
        </button>
      </form>

      <section className="results" aria-labelledby="results-title">
        <div className="results-bar">
          <h2 className="h3" id="results-title" aria-live="polite">
            {count === 1 ? t("1 health check") : tf("{n} health checks", { n: count })}
          </h2>
          <div className="row">
            <button className="btn sm filters-open" type="button" aria-controls="filters" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {t("Filters")}
              {chips.length ? <span className="pub-count">{chips.length}</span> : null}
            </button>
            <label className="row small" htmlFor="sort">
              {t("Sort")}
              <select className="input sort-select" id="sort" name="sort" form="filters" value={filters.sort} onChange={(e) => navigate({ sort: e.target.value })}>
                {SORTS.map(([v, label]) => (
                  <option key={v} value={v}>
                    {t(label)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {chips.length ? (
          <div className="active-filters row" aria-label={t("Active filters")}>
            {chips.map((c) => (
              <button
                key={c.key}
                className="chip active"
                type="button"
                aria-label={tf("Remove filter: {name}", { name: c.label })}
                onClick={() => {
                  if (c.key === "q") {
                    setQ("");
                    setSeen("");
                  }
                  navigate({ [c.key]: "" });
                }}
              >
                {c.label} <span className="x" aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        ) : null}
        {count ? (
          <div className="pkg-list" data-results>
            {results.map((p) => (
              <PackageRow key={p.id} p={p} />
            ))}
          </div>
        ) : (
          <div className="state-box" data-empty>
            <h3>{t("No health checks match these filters")}</h3>
            <p className="muted small">{t("Try a broader search, remove a filter, or describe what you need to the assistant.")}</p>
            <p className="small">
              {t("Try:")}{" "}
              {EXAMPLES.map((ex, i) => (
                <span key={ex}>
                  {i ? ", " : ""}
                  <button className="link-btn" type="button" lang={textLang(ex)} onClick={() => typed(ex)}>
                    {ex}
                  </button>
                </span>
              ))}
            </p>
            <div className="row">
              <button className="btn" type="button" onClick={reset}>
                {t("Clear filters")}
              </button>
              <Link className="btn primary" href={"/app?q=" + encodeURIComponent(askText)}>
                {t("Ask the assistant")}
              </Link>
            </div>
          </div>
        )}
        <p className="tiny muted">{tf("Catalog {version} · simulated prices in Thai baht · per person unless stated.", { version: catalogVersion })}</p>
      </section>
    </div>
  );
}
