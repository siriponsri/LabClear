/* Shapes returned by the LabClear API (see routers/public.py and routers/business_ops.py). */
export type Package = {
  id: string;
  name: string;
  price_thb: number;
  price_unit: string;
  is_demo: boolean;
  clinical_approval?: string;
  services: string[];
  branch_ids: string[];
  segment: "individual" | "organization";
  staff_review_required: boolean;
  source_id?: string;
  notes?: string;
  active?: boolean;
};
export type Catalog = { version: string; is_demo: boolean; currency: string; tax_display?: string; packages: Package[] };
export type Branch = {
  id: string;
  name: string;
  address?: string;
  hours?: string;
  capacity_per_slot: number;
  lat?: number;
  lng?: number;
  [key: string]: unknown;
};
export type Policies = Record<string, any> & { organization_min_people: number; privacy_policy: string };
export type Plan = { id: string; name: string; price_thb: number; period_days?: number; [key: string]: any };
export type Dot = { id: string; name: string; role: string; summary: string; enabled: boolean };
export type SourceRecord = {
  id: string;
  title: string;
  url: string;
  publisher: string;
  publisher_type?: string;
  aliases?: string[];
  content?: string;
  data_class: string;
  reviewed_at?: string;
  page?: number | null;
  language?: string;
  topics?: string[];
  rights?: string;
};
export type Common = {
  version: string;
  catalog: Catalog;
  branches: Branch[];
  policies: Policies;
  plans: Record<string, Plan>;
  dots: Dot[];
  segments: { id: string; query: string }[];
  sources: { count: number; publishers: number; publisher_types: Record<string, number> };
  maps_embed_key: boolean;
  google_sign_in: boolean;
  /** Optional pages switched on by the server owner (Codex feature flags, booleans only). */
  features?: { org_documents: boolean; org_reference_inference: boolean; hospital_links: boolean; landing_preview: boolean };
  /** true when the API was not reachable and seed data was used */
  offline?: boolean;
};
