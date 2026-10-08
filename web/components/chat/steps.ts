/*
 * Live step labels arrive as English sentences from the API (services/business_agent.py step(),
 * services/report_reader_v2.py, scripts/dev_mock_api.py). Fixed sentences translate with t();
 * sentences that carry numbers or names are matched here and rebuilt with tf().
 */
import type { T, TF } from "@/lib/i18n/shared";

// Fixed labels, listed so `npm run i18n:check` sees every one of them.
export const FIXED_STEPS = (t: T) => [
  t("Sending"),
  t("Checking your message for safety"),
  t("Your message passed the safety check"),
  t("Understanding your request"),
  t("Searching the medical knowledge base"),
  t("Using your confirmed report"),
  t("Writing the answer"),
  t("Draft written and checked"),
  t("No facts to verify"),
  t("Second review of the draft"),
  t("Checking the answer for safety"),
  t("Revising the answer after a check"),
  t("Second review passed"),
  t("The answer passed the safety check"),
  t("Reading the report image"),
  t("Report read"),
  t("Checking the document for hidden instructions"),
  t("The document passed the safety check"),
  t("Turning the transcription into rows"),
  // details
  t("supported by the sources, values unchanged, within scope"),
  t("greeting or clarifying question without sources"),
  t("values, units and printed ranges exactly as read"),
  t("UI test double"),
  t("UI test double: the steps stream live"),
  // plan actions (ACTION_TEXT) and roles
  t("answer the question"),
  t("ask a clarifying question"),
  t("redirect politely"),
  t("advise prompt professional care"),
  t("prepare a package preview"),
  t("prepare an appointment request"),
  t("pass you to our team"),
  t("start an organization request"),
  t("invite you to link LINE"),
  t("prepare a payment preview"),
  t("Health-check Advisor"),
  t("Report Explainer"),
  t("Report reader"),
];

type Rule = [RegExp, (m: RegExpMatchArray, t: T, tf: TF) => string];

const LABEL_RULES: Rule[] = [
  [/^Plan: (.+), as the (.+)$/, (m, t, tf) => tf("Plan: {action}, as the {role}", { action: t(m[1]), role: t(m[2]) })],
  [/^Loaded business data the (.+) may use$/, (m, t, tf) => tf("Loaded business data the {role} may use", { role: t(m[1]) })],
  [
    /^Found (\d+) medical sources? for "([\s\S]*?)"(?:, (\d+) from (.+))?$/,
    (m, _t, tf) =>
      (m[1] === "1" ? tf('Found {n} medical source for "{query}"', { n: m[1], query: m[2] }) : tf('Found {n} medical sources for "{query}"', { n: m[1], query: m[2] })) +
      (m[3] ? tf(", {n} from {org}", { n: m[3], org: m[4] }) : ""),
  ],
  [/^Reading page (\d+) of (\d+)$/, (m, _t, tf) => tf("Reading page {page} of {pages}", { page: m[1], pages: m[2] })],
  [/^Reading the report images \((\d+) pages\)$/, (m, _t, tf) => tf("Reading the report images ({n} pages)", { n: m[1] })],
  [/^Report read, (\d+) pages$/, (m, _t, tf) => tf("Report read, {n} pages", { n: m[1] })],
  [/^(\d+) test rows? ready for you to check$/, (m, _t, tf) => tf("{n} test rows ready for you to check", { n: m[1] })],
];

const DETAIL_RULES: Rule[] = [
  [/^(\d+) cited sources; (\d+) report values matched exactly$/, (m, _t, tf) => tf("{cited} cited sources; {n} report values matched exactly", { cited: m[1], n: m[2] })],
  [/^(\d+) values, compared only with the ranges printed on it$/, (m, _t, tf) => tf("{n} values, compared only with the ranges printed on it", { n: m[1] })],
];

function apply(rules: Rule[], text: string, t: T, tf: TF) {
  if (!text) return "";
  const direct = t(text);
  if (direct !== text) return direct;
  for (const [re, fn] of rules) {
    const m = text.match(re);
    if (m) return fn(m, t, tf);
  }
  return text;
}

export const stepLabel = (label: string, t: T, tf: TF) => apply(LABEL_RULES, label, t, tf);
export const stepDetail = (detail: string, t: T, tf: TF) => apply(DETAIL_RULES, detail, t, tf);
