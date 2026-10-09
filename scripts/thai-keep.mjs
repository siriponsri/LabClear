/*
 * Thai line breaking help for the dictionary (used by scripts/build_i18n.mjs and scripts/thai_keep_words.py).
 *
 * Browsers wrap Thai with ICU's word dictionary. A word ICU does not know ("แชต", "แพ็กเกจ") is cut into
 * fragments and can also throw off the words after it ("แชตนั้นพร้อม" -> แช|ตนั้|นพ|ร้|อม), so a
 * narrow screen may break a line inside a syllable. For each reviewed word in th-keep-together.json:
 *   - its letters are joined with WORD JOINER (U+2060): no line break inside the word;
 *   - a ZERO WIDTH SPACE (U+200B) separates it from a neighbouring Thai letter, so ICU starts the
 *     next word cleanly (only between Thai letters, never next to punctuation or spaces).
 * Both characters are invisible. `protectThai(text)` is idempotent.
 *
 *   node scripts/thai-keep.mjs --segment < {"values": [...], "words": [...]}   (for the generator)
 */
import { readFileSync } from "node:fs";

export const WJ = "⁠";
export const ZWSP = "​";
const THAI_LETTER = /[ก-ฺเ-๎]/;
const graphemes = new Intl.Segmenter("th", { granularity: "grapheme" });

export function strip(text) {
  return text.replaceAll(WJ, "").replaceAll(ZWSP, "");
}

export function compile(words) {
  const sorted = [...new Set(words)].filter(Boolean).sort((a, b) => b.length - a.length);
  if (!sorted.length) return null;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return { re: new RegExp(sorted.map(esc).join("|"), "g"), joined: new Map(sorted.map((w) => [w, [...graphemes.segment(w)].map((g) => g.segment).join(WJ)])) };
}

/** Thai punctuation rules: "ๆ" never starts a line, nor does the time suffix "น." after a number. */
function glue(text) {
  return text.replace(/ (ๆ)/g, "\u00A0$1").replace(/(\d) (น\.)/g, "$1\u00A0$2");
}

export function protectThai(text, compiled) {
  const clean = glue(strip(text));
  if (!compiled) return clean;
  return clean.replace(compiled.re, (w, at) => {
    const before = at > 0 && THAI_LETTER.test(clean[at - 1]) ? ZWSP : "";
    const after = at + w.length < clean.length && THAI_LETTER.test(clean[at + w.length]) ? ZWSP : "";
    return before + compiled.joined.get(w) + after;
  });
}

/** ICU word-segment starts of the protected text, as offsets in the clean text. */
export function boundaries(protectedText) {
  const seg = new Intl.Segmenter("th", { granularity: "word" });
  const map = [];
  let n = 0;
  for (const ch of protectedText) {
    map.push(n);
    if (ch !== WJ && ch !== ZWSP) n += ch.length;
  }
  map.push(n);
  const out = new Set();
  // A break is possible only between segments; WJ forbids it, ZWSP allows it.
  const units = [...protectedText];
  const starts = [];
  for (const s of seg.segment(protectedText)) starts.push(s.index);
  // Convert UTF-16 indices to code point positions.
  const cpIndex = new Map();
  let u = 0;
  units.forEach((ch, k) => {
    cpIndex.set(u, k);
    u += ch.length;
  });
  for (const st of starts) {
    const k = cpIndex.get(st);
    if (k === undefined || k === 0) continue;
    const prev = units[k - 1];
    const cur = units[k];
    if (prev === WJ || cur === WJ) continue;
    out.add(map[k]);
  }
  return [...out].sort((a, b) => a - b);
}

if (process.argv.includes("--segment")) {
  const { values, words } = JSON.parse(readFileSync(0, "utf8"));
  const c = compile(words);
  const res = values.map((v) => {
    const p = protectThai(v, c);
    return { clean: strip(p), boundaries: boundaries(p) };
  });
  process.stdout.write(JSON.stringify(res));
}
