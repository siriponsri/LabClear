/*
 * Thai-first UI language. Thai is the default for every visitor; English is an explicit choice
 * kept in the "labclear_language" cookie (the same cookie the API reads).
 *
 * Source strings are written in English and looked up in lib/i18n/dict.th.json, which
 * scripts/merge-i18n.mjs builds from th.json (3.x translations) plus lib/i18n/th/*.json.
 * `npm run i18n:check` fails when a t("...") literal has no Thai translation.
 */
import dict from "./dict.th.json";
import apiMessages from "./api-messages.en.json";

export type Lang = "th" | "en";
export const LANG_COOKIE = "labclear_language";
export const LANGS: Lang[] = ["th", "en"];
const TH = dict as Record<string, string>;

export function isLang(value: unknown): value is Lang {
  return value === "th" || value === "en";
}

/*
 * API messages that carry values ("A requested appointment cannot be cancelled.") arrive filled in.
 * api-messages.en.json lists the backend's messages as {placeholder} templates
 * (scripts/i18n_api_messages.py); a filled message is matched to its template and the Thai template
 * is filled with the same values (each value translated when the dictionary has it).
 */
type Template = { re: RegExp; names: string[]; th: string };
let templates: Template[] | null = null;
function apiTemplates(): Template[] {
  if (templates) return templates;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // lib/api/client.ts builds one message itself from a 422 response.
  const client = ["Please check: {fields}."];
  templates = [...((apiMessages as { messages: string[] }).messages || []), ...client]
    .filter((m) => /\{\w+\}/.test(m) && TH[m])
    .map((m) => {
      const names: string[] = [];
      const re = new RegExp("^" + esc(m).replace(/\\\{(\w+)\\\}/g, (_, n: string) => (names.push(n), "([\\s\\S]+?)")) + "$");
      return { re, names, th: TH[m] };
    });
  return templates;
}
function fromTemplate(text: string): string | undefined {
  if (text.length < 8) return undefined;
  for (const tpl of apiTemplates()) {
    const m = text.match(tpl.re);
    if (!m) continue;
    const values: Record<string, string> = {};
    tpl.names.forEach((n, i) => (values[n] = TH[m[i + 1]] ?? m[i + 1]));
    return tpl.th.replace(/\{(\w+)\}/g, (_, k: string) => (k in values ? values[k] : `{${k}}`));
  }
  return undefined;
}

export function translate(lang: Lang, text: string): string {
  return lang === "th" ? TH[text] ?? fromTemplate(text) ?? text : text;
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
