"use client";
/* Health checks: the same catalog search the assistant uses (GET /catalog/search). */
import { useEffect, useState } from "react";
import { money } from "@/lib/format";
import type { Package } from "@/lib/types";
import { useWorkspace } from "../context";
import { Empty } from "../ui";
import { LoadError, Loading, useLoad } from "./shared";

type Search = { packages: Package[]; total: number; catalog_version: string };

function PackageRow({ p }: { p: Package }) {
  const { t, tf, navigate, ask } = useWorkspace();
  return (
    <article className="pkg-row">
      <div>
        <h3>
          <a href={"/packages/" + encodeURIComponent(p.id)}>{p.name}</a>
        </h3>
        <p className="kind">
          {p.segment === "organization"
            ? t("For organizations of 20 or more")
            : p.staff_review_required
              ? t("Follow-up test, reviewed with our team before booking")
              : t("Book directly")}
        </p>
      </div>
      <ul className="pkg-tests" aria-label={t("Included tests")}>
        {p.services.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <div className="pkg-price">
        <strong>{money(p.price_thb)}</strong>
        <span>{t(p.price_unit)}</span>
      </div>
      <div className="pkg-actions">
        {p.segment === "organization" ? (
          <a className="btn sm" href={"/organizations?package=" + encodeURIComponent(p.id)}>
            {t("Request a quotation")}
          </a>
        ) : !p.staff_review_required ? (
          <button type="button" className="btn sm primary" onClick={() => navigate("book", { package_id: p.id })}>
            {t("Request a time")}
          </button>
        ) : null}
        <button type="button" className="btn sm ghost" onClick={() => ask(tf("Tell me about {name} ({id}). Is it suitable for my goals?", { name: p.name, id: p.id }), true)}>
          {t("Ask")}
        </button>
      </div>
    </article>
  );
}

export function PackagesView() {
  const { api, t, tf, params, ask } = useWorkspace();
  const [q, setQ] = useState(params.q || "");
  const [query, setQuery] = useState(q);
  const [segment, setSegment] = useState(["individual", "organization"].includes(params.segment) ? params.segment : "");
  const [sort, setSort] = useState("featured");

  // Search 300 ms after typing stops.
  useEffect(() => {
    const id = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  const res = useLoad(() => {
    const p = new URLSearchParams({ q: query, segment, sort });
    if (params.max_price && !query) p.set("max_price", params.max_price);
    return api.get<Search>("/catalog/search?" + p);
  }, [query, segment, sort]);

  const clear = () => {
    setQ("");
    setQuery("");
    setSegment("");
    setSort("featured");
  };

  return (
    <div>
      <div className="view-intro">
        <h2>{t("Health checks")}</h2>
        <p>{t("Search and filter the same catalog the assistant uses. Simulated prices.")}</p>
      </div>
      <form className="toolbar" role="search" onSubmit={(e) => (e.preventDefault(), setQuery(q.trim()))}>
        <input className="input" type="search" placeholder={t("Search tests, e.g. lipid")} aria-label={t("Search health checks")} maxLength={80} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        <select className="input" aria-label={t("Who it is for")} value={segment} onChange={(e) => setSegment(e.target.value)}>
          <option value="">{t("Everyone")}</option>
          <option value="individual">{t("Individuals")}</option>
          <option value="organization">{t("Organizations")}</option>
        </select>
        <select className="input" aria-label={t("Sort")} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="featured">{t("Recommended")}</option>
          <option value="price_asc">{t("Price: low to high")}</option>
          <option value="price_desc">{t("Price: high to low")}</option>
          <option value="name">{t("Name")}</option>
        </select>
        <button type="button" className="btn ghost sm" onClick={clear} disabled={!q && !segment && sort === "featured"}>
          {t("Reset")}
        </button>
      </form>
      <p className="small muted views-count" aria-live="polite">
        {res.data ? tf("{n} results · catalog {version}", { n: res.data.total, version: res.data.catalog_version }) : ""}
      </p>
      {res.error ? (
        <LoadError error={res.error} retry={() => res.reload()} title={t("Health checks could not be loaded")} />
      ) : !res.data ? (
        <Loading rows={4} />
      ) : !res.data.total ? (
        <Empty
          title={t("No matches")}
          actions={
            <>
              <button type="button" className="btn sm" onClick={clear}>
                {t("Clear filters")}
              </button>
              <button type="button" className="btn sm primary" onClick={() => ask(tf("I am looking for a health check that includes {tests}.", { tests: query || t("specific tests") }), true)}>
                {t("Ask the assistant")}
              </button>
            </>
          }
        >
          {t("Try another test name or clear the filters.")}
        </Empty>
      ) : (
        <div className="pkg-list" aria-busy={res.loading || undefined}>
          {res.data.packages.map((p) => (
            <PackageRow key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}
