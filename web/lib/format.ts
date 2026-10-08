import type { Lang } from "@/lib/i18n/shared";

const locale = (lang: Lang) => (lang === "th" ? "th-TH" : "en-GB");

/** ฿1,690 — the baht sign keeps prices compact in both languages. */
export const money = (n: number) => "฿" + new Intl.NumberFormat("en-US").format(n);

/** "1,690 บาท" / "THB 1,690" for running text. */
export const baht = (n: number, lang: Lang) => (lang === "th" ? `${new Intl.NumberFormat("th-TH").format(n)} บาท` : `THB ${new Intl.NumberFormat("en-US").format(n)}`);

/** 2026-10-08 -> "พฤ. 8 ต.ค. 2569" (Thai shows the Buddhist year) / "Thu 8 Oct 2026". */
export function longDate(iso: string, lang: Lang) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale(lang), { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

/** Unix seconds -> "8 ต.ค. 2569 14:05" / "8 Oct 2026, 14:05". */
export function when(t: number, lang: Lang) {
  return new Date(t * 1000).toLocaleString(locale(lang), { dateStyle: "medium", timeStyle: "short" });
}

export function ago(t: number, lang: Lang) {
  const m = Math.max(0, Math.round((Date.now() / 1000 - t) / 60));
  if (lang === "th") return m < 1 ? "เมื่อสักครู่" : m < 60 ? `${m} นาทีที่แล้ว` : m < 1440 ? `${Math.round(m / 60)} ชม. ที่แล้ว` : `${Math.round(m / 1440)} วันที่แล้ว`;
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}

/** Today's date in Asia/Bangkok, offset by whole days, as YYYY-MM-DD. */
export function bangkokDate(offsetDays = 0) {
  const d = new Date(Date.now() + 7 * 3600e3 + offsetDays * 86400e3);
  return d.toISOString().slice(0, 10);
}
