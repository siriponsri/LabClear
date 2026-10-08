/* Publisher types for the "Sources" section. The API reports counts by publisher_type; the keys are
   normalised loosely so new types (government, societies, international agencies) land in the right
   group without a code change. Unknown types are grouped as "Other sources". */
import type { SourceRecord } from "@/lib/types";

export const SOURCE_GROUPS = [
  { key: "gov", label: "Thai government agencies", match: /gov|ministry|moph|department|nhso|public_health/ },
  { key: "society", label: "Professional societies", match: /societ|association|college|professional|council/ },
  { key: "hospital", label: "Hospitals and medical schools", match: /hospital|faculty|medical_school|university|academic|school/ },
  { key: "intl", label: "International agencies", match: /international|global|world|who|agency|foreign|intl/ },
] as const;

export type GroupKey = (typeof SOURCE_GROUPS)[number]["key"] | "other";

export function groupOf(type: string | undefined): GroupKey {
  const t = (type || "thai_hospital").toLowerCase();
  for (const g of SOURCE_GROUPS) if (g.match.test(t)) return g.key;
  return "other";
}

export type SourceGroup = { key: GroupKey; label: string; count: number; publishers: { name: string; count: number }[] };

/** Counts come from common.sources.publisher_types (the same numbers the API serves everywhere);
    publisher names come from the record list. */
export function sourceGroups(types: Record<string, number>, records: SourceRecord[]): SourceGroup[] {
  const counts = new Map<GroupKey, number>();
  for (const [type, n] of Object.entries(types)) counts.set(groupOf(type), (counts.get(groupOf(type)) || 0) + n);
  const names = new Map<GroupKey, Map<string, number>>();
  for (const r of records) {
    const g = groupOf(r.publisher_type);
    const m = names.get(g) ?? new Map<string, number>();
    m.set(r.publisher, (m.get(r.publisher) || 0) + 1);
    names.set(g, m);
  }
  const order: { key: GroupKey; label: string }[] = [...SOURCE_GROUPS.map((g) => ({ key: g.key as GroupKey, label: g.label as string })), { key: "other", label: "Other sources" }];
  return order
    .map(({ key, label }) => ({
      key,
      label,
      count: counts.get(key) || 0,
      publishers: [...(names.get(key) ?? new Map<string, number>()).entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.count > 0);
}
