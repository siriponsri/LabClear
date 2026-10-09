import "server-only";
import { cache } from "react";
import { apiGet } from "@/lib/api/server";
import type { Common, Package, SourceRecord } from "@/lib/types";
import seedCatalog from "@/data/seed/catalog.json";
import seedBranches from "@/data/seed/branches.json";
import seedPolicies from "@/data/seed/policies.json";
import seedPlans from "@/data/seed/plans.json";
import seedDots from "@/data/seed/dots.json";
import seedEvidence from "@/data/seed/evidence.json";

const SEGMENTS = [
  { id: "core", query: "segment=individual&review=excluded" },
  { id: "follow", query: "segment=individual&review=only" },
  { id: "org", query: "segment=organization" },
  { id: "budget", query: "max_price=1000&sort=price_asc" },
];

/** The reviewed corpus has no publisher_type field; same grouping as routers/public.py. */
const INTERNATIONAL = new Set(["MedlinePlus · U.S. National Library of Medicine"]);
export const publisherType = (r: SourceRecord) => r.publisher_type || (INTERNATIONAL.has(r.publisher) ? "international_reference" : "thai_hospital");

function seed(): Common {
  const records = (seedEvidence as any).records as SourceRecord[];
  const publishers = new Set(records.map((r) => r.publisher));
  const types: Record<string, number> = {};
  for (const r of records) types[publisherType(r)] = (types[publisherType(r)] || 0) + 1;
  return {
    version: "4.0.0-rc2",
    catalog: seedCatalog as any,
    branches: (seedBranches as any).branches,
    policies: seedPolicies as any,
    plans: Object.fromEntries(((seedPlans as any).plans as any[]).map((p) => [p.id, p])),
    dots: ((seedDots as any).dots as any[]).map((d) => ({ id: d.id, name: d.name, role: d.role, summary: d.summary, enabled: d.enabled ?? true })),
    segments: SEGMENTS,
    sources: { count: records.length, publishers: publishers.size, publisher_types: types },
    maps_embed_key: false,
    google_sign_in: false,
    features: { org_documents: false, org_reference_inference: false, hospital_links: false, landing_preview: false },
    offline: true,
  };
}

/** Catalog, centers, policies, plans, roles and source counts — live from the API, seed as fallback. */
export const getCommon = cache(async (): Promise<Common> => {
  try {
    return await apiGet<Common>("/api/business/site/common");
  } catch {
    return seed();
  }
});

export const getSources = cache(async (): Promise<{ version: string; records: SourceRecord[]; publishers: Record<string, number>; publisher_types: Record<string, number> }> => {
  try {
    return await apiGet("/api/business/site/sources");
  } catch {
    const records = [...((seedEvidence as any).records as SourceRecord[])].sort((a, b) => (a.publisher + a.title).localeCompare(b.publisher + b.title));
    const publishers: Record<string, number> = {};
    const publisher_types: Record<string, number> = {};
    for (const r of records) {
      publishers[r.publisher] = (publishers[r.publisher] || 0) + 1;
      publisher_types[publisherType(r)] = (publisher_types[publisherType(r)] || 0) + 1;
    }
    return { version: (seedEvidence as any).version, records: records.map((r) => ({ ...r, publisher_type: publisherType(r) })), publishers, publisher_types };
  }
});

export function activePackages(c: Common): Package[] {
  return c.catalog.packages.filter((p) => p.active !== false);
}

/** The same groups the 3.x home page used (routers/site.py). */
export function packageGroups(c: Common) {
  const packages = activePackages(c);
  const core = packages.filter((p) => p.segment === "individual" && !p.staff_review_required);
  const follow = packages.filter((p) => p.segment === "individual" && p.staff_review_required);
  const org = packages.filter((p) => p.segment === "organization");
  const budget = packages.filter((p) => p.price_thb < 1000).sort((a, b) => a.price_thb - b.price_thb);
  const featured = core.find((p) => p.id === "P02") ?? core[0] ?? null;
  return {
    core, follow, org, budget, featured, total: packages.length,
    ladder: [...core].sort((a, b) => a.price_thb - b.price_thb),
    minPrice: core.length ? Math.min(...core.map((p) => p.price_thb)) : 0,
    capacity: c.branches.reduce((n, b) => n + (b.capacity_per_slot || 0), 0),
  };
}

/** Client-side style search used by /packages (mirrors services/business_ops.catalog_search). */
export function searchPackages(c: Common, q: { q?: string; segment?: string; branch_id?: string; max_price?: number; min_price?: number; review?: string; sort?: string }) {
  const text = (q.q || "").trim().toLowerCase();
  let rows = activePackages(c).filter((p) => {
    if (text && !(p.name.toLowerCase().includes(text) || p.services.some((s) => s.toLowerCase().includes(text)) || p.id.toLowerCase() === text)) return false;
    if (q.segment && p.segment !== q.segment) return false;
    if (q.branch_id && !p.branch_ids.includes(q.branch_id)) return false;
    if (q.max_price != null && p.price_thb > q.max_price) return false;
    if (q.min_price != null && p.price_thb < q.min_price) return false;
    if (q.review === "excluded" && p.staff_review_required) return false;
    if (q.review === "only" && !p.staff_review_required) return false;
    return true;
  });
  if (q.sort === "price_asc") rows = [...rows].sort((a, b) => a.price_thb - b.price_thb);
  if (q.sort === "price_desc") rows = [...rows].sort((a, b) => b.price_thb - a.price_thb);
  return rows;
}
