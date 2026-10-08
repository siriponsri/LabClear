/*
 * Thai-first UI language. Thai is the default for every visitor; English is an explicit choice
 * kept in the "labclear_language" cookie (the same cookie the API reads).
 *
 * Source strings are written in English and looked up in lib/i18n/dict.th.json, which
 * scripts/merge-i18n.mjs builds from th.json (3.x translations) plus lib/i18n/th/*.json.
 * `npm run i18n:check` fails when a t("...") literal has no Thai translation.
 */
import dict from "./dict.th.json";

export type Lang = "th" | "en";
export const LANG_COOKIE = "labclear_language";
export const LANGS: Lang[] = ["th", "en"];
const TH = dict as Record<string, string>;

export function isLang(value: unknown): value is Lang {
  return value === "th" || value === "en";
}

export function translate(lang: Lang, text: string): string {
  return lang === "th" ? TH[text] ?? text : text;
}

/** Translate, then fill {name} placeholders. */
export function translateFormat(lang: Lang, text: string, values: Record<string, string | number>): string {
  return translate(lang, text).replace(/\{(\w+)\}/g, (_, k: string) => (k in values ? String(values[k]) : `{${k}}`));
}

export type T = (text: string) => string;
export type TF = (text: string, values: Record<string, string | number>) => string;

export function makeT(lang: Lang): { t: T; tf: TF; lang: Lang } {
  return { lang, t: (text) => translate(lang, text), tf: (text, values) => translateFormat(lang, text, values) };
}

/** API error messages are English sentences; show the Thai translation when one exists. */
export function apiMessage(lang: Lang, message: string): string {
  return translate(lang, message);
}
