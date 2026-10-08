/*
 * Package and test search shared by /packages and the Ctrl/⌘ K dialog.
 *
 * The catalog is written in English (test names stay as printed on lab reports), but customers
 * type in Thai: "น้ำตาล" should still find Fasting glucose and HbA1c. A query is first scanned
 * for known Thai or everyday English words (longest first, so "ไตรกลีเซอไรด์" is not read as
 * "ไต"); each one becomes a concept that matches any of its catalog words. Remaining words must
 * appear in the package text, the same rule as services/business_ops._matches.
 */
import type { Package } from "@/lib/types";

const ALIASES: [string[], string[]][] = [
  [["น้ำตาลสะสม", "เอวันซี", "a1c"], ["hba1c"]],
  [["น้ำตาล", "เบาหวาน", "กลูโคส", "sugar", "diabetes", "fbs"], ["glucose", "hba1c"]],
  [["ไตรกลีเซอไรด์", "triglyceride"], ["triglycerides"]],
  [["ไขมันเลว", "แอลดีแอล"], ["ldl"]],
  [["ไขมันดี", "เอชดีแอล"], ["hdl"]],
  [["ไขมัน", "คอเลสเตอรอล", "โคเลสเตอรอล", "คลอเรสเตอรอล", "cholesterol", "lipids"], ["lipid", "cholesterol", "ldl", "hdl", "triglycerides"]],
  [["ครีเอตินีน", "ครีเอตินิน"], ["creatinine"]],
  [["ยูเรีย", "urea"], ["bun"]],
  [["ไต", "kidney", "renal"], ["creatinine", "egfr", "bun", "kidney", "urine albumin"]],
  [["บิลิรูบิน", "ดีซ่าน"], ["bilirubin"]],
  [["อัลบูมิน"], ["albumin"]],
  [["ตับ", "liver"], ["liver", "alt", "ast", "alp", "albumin", "bilirubin"]],
  [["ปัสสาวะ", "ฉี่", "urine"], ["urinalysis", "urine"]],
  [["เม็ดเลือด", "ความสมบูรณ์ของเลือด", "โลหิตจาง", "ซีบีซี", "blood count", "anemia", "anaemia", "blood"], ["cbc", "blood count"]],
  [["ไทรอยด์", "ไธรอยด์", "ธัยรอยด์", "คอพอก"], ["thyroid", "tsh", "free t4"]],
  [["โซเดียม"], ["sodium"]],
  [["โพแทสเซียม", "โปแตสเซียม"], ["potassium"]],
  [["เกลือแร่", "อิเล็กโทรไลต์", "electrolytes", "salt"], ["electrolyte", "sodium", "potassium", "chloride", "bicarbonate"]],
  [["ธาตุเหล็ก", "เหล็ก", "เฟอร์ริติน", "iron"], ["ferritin"]],
  [["ครอบครัว", "สองคน", "คู่", "family", "couple"], ["family", "pair"]],
  [["องค์กร", "บริษัท", "พนักงาน", "company", "employees", "organisation", "organization"], ["corporate"]],
  [["ติดตามผล", "ติดตาม", "followup", "follow up"], ["follow-up"]],
  [["พื้นฐาน", "basic"], ["essential"]],
  [["ละเอียด", "ครบถ้วน", "ครบ", "full"], ["comprehensive", "extended"]],
  [["วัยทำงาน", "ทำงาน", "office"], ["workday"]],
];
/* Words that only say "a check" or "a value"; they never narrow the results. */
const STOP = ["ตรวจสุขภาพ", "ตรวจเลือด", "การตรวจ", "ตรวจ", "แพ็กเกจ", "แพคเกจ", "แพ็คเกจ", "โปรแกรม", "ค่า", "ระดับ", "เลือด"];

const KEYS = ALIASES.flatMap(([keys, words]) => keys.map((k) => ({ key: k, words })))
  .concat(STOP.map((k) => ({ key: k, words: [] as string[] })))
  .sort((a, b) => b.key.length - a.key.length);
const THAI = /[฀-๿]/;

export type Query = { concepts: string[][]; terms: string[]; thai: string[]; empty: boolean };

export function parseQuery(raw: string): Query {
  let rest = " " + raw.toLowerCase().slice(0, 80) + " ";
  const concepts: string[][] = [];
  for (const { key, words } of KEYS) {
    if (!rest.includes(key)) continue;
    // English words must stand alone ("salt" should not fire inside "consult").
    if (!THAI.test(key) && !new RegExp(`(^|[^a-z])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(rest)) continue;
    if (words.length) concepts.push([key, ...words]);
    rest = rest.split(key).join(" ");
  }
  const words = rest.replace(/[\/,;]+/g, " ").split(/\s+/).filter(Boolean);
  const thai = words.filter((w) => THAI.test(w));
  const terms = words.filter((w) => !THAI.test(w));
  return { concepts, terms, thai, empty: !raw.trim() };
}

function haystack(p: Package) {
  return [p.name, p.services.join(" "), p.notes || "", p.id].join(" ").toLowerCase();
}

/** 0 = no match; higher = better (a hit in the package name counts three times). */
export function scorePackage(p: Package, q: Query): number {
  if (q.empty) return 1;
  const hay = haystack(p);
  const name = p.name.toLowerCase();
  let score = 0;
  for (const words of q.concepts) {
    if (!words.some((w) => hay.includes(w))) return 0;
    score += words.some((w) => name.includes(w)) ? 3 : 1;
  }
  for (const term of q.terms) {
    if (!hay.includes(term)) return 0;
    score += name.includes(term) ? 3 : 1;
  }
  // Leftover Thai words ("ใน", "หน่อย") are ignored once a known word was found; on their own
  // they must appear in the text, so "หัวใจ" honestly finds nothing.
  if (!q.concepts.length) {
    for (const term of q.thai) {
      if (!hay.includes(term)) return 0;
      score += 1;
    }
  }
  return score || (q.concepts.length + q.terms.length + q.thai.length === 0 ? 1 : 0);
}

/** Test names (services) that match the query, for the search dialog. */
export function matchTests(tests: string[], q: Query): string[] {
  if (q.empty) return [];
  return tests.filter((test) => {
    const hay = test.toLowerCase();
    const concepts = q.concepts.every((words) => words.some((w) => hay.includes(w)));
    const terms = q.terms.every((term) => hay.includes(term));
    const thai = q.concepts.length ? true : q.thai.every((term) => hay.includes(term));
    return concepts && terms && thai && q.concepts.length + q.terms.length + q.thai.length > 0;
  });
}

export function uniqueTests(packages: Package[]): string[] {
  const out: string[] = [];
  for (const p of packages) for (const s of p.services) if (!out.includes(s)) out.push(s);
  return out;
}

export type Filters = { q: string; segment: string; review: string; max_price: string; branch_id: string; sort: string };

export const SORTS = [
  ["featured", "Recommended order"],
  ["price_asc", "Price: low to high"],
  ["price_desc", "Price: high to low"],
  ["name", "Name A–Z"],
  ["relevance", "Best match"],
] as const;
export const PRICE_STEPS = [500, 1000, 1500, 2000, 3000];

export function readFilters(get: (k: string) => string | null | undefined): Filters {
  const segment = get("segment") || "";
  const review = get("review") || "";
  const max = get("max_price") || "";
  const sort = get("sort") || "featured";
  return {
    q: (get("q") || "").slice(0, 80),
    segment: ["individual", "organization"].includes(segment) ? segment : "",
    review: ["excluded", "only"].includes(review) ? review : "",
    max_price: /^\d{1,6}$/.test(max) ? max : "",
    branch_id: /^[A-Za-z0-9_-]{1,12}$/.test(get("branch_id") || "") ? (get("branch_id") as string) : "",
    sort: SORTS.some(([v]) => v === sort) ? sort : "featured",
  };
}

/** Mirrors services/business_ops.catalog_search, with the Thai-aware matcher above. */
export function filterPackages(packages: Package[], f: Filters): Package[] {
  const q = parseQuery(f.q);
  const max = f.max_price ? Number(f.max_price) : null;
  const rows: { p: Package; score: number; order: number }[] = [];
  packages.forEach((p, order) => {
    if (p.active === false) return;
    const score = scorePackage(p, q);
    if (!score) return;
    if (f.segment && p.segment !== f.segment) return;
    if (f.branch_id && !p.branch_ids.includes(f.branch_id)) return;
    if (max != null && p.price_thb > max) return;
    if (f.review === "excluded" && p.staff_review_required) return;
    if (f.review === "only" && !p.staff_review_required) return;
    rows.push({ p, score, order });
  });
  const by: Record<string, (a: (typeof rows)[0], b: (typeof rows)[0]) => number> = {
    price_asc: (a, b) => a.p.price_thb - b.p.price_thb || a.order - b.order,
    price_desc: (a, b) => b.p.price_thb - a.p.price_thb || a.order - b.order,
    name: (a, b) => a.p.name.toLowerCase().localeCompare(b.p.name.toLowerCase()) || a.order - b.order,
    relevance: (a, b) => b.score - a.score || a.order - b.order,
    featured: (a, b) => a.order - b.order,
  };
  return rows.sort(by[f.sort] || by.featured).map((r) => r.p);
}
