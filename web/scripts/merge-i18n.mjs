// Merges lib/i18n/th.json (carried over from 3.x) with every lib/i18n/th/*.json feature file into
// lib/i18n/dict.th.json, which the app imports. Later files win; duplicates are reported.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { compile, protectThai, strip } from "./thai-keep.mjs";
const dir = new URL("../lib/i18n/", import.meta.url);
const merged = JSON.parse(readFileSync(new URL("th.json", dir), "utf8"));
const seen = new Map(Object.keys(merged).map((k) => [k, "th.json"]));
for (const name of readdirSync(new URL("th/", dir)).filter((f) => f.endsWith(".json")).sort()) {
  const data = JSON.parse(readFileSync(new URL("th/" + name, dir), "utf8"));
  for (const [k, v] of Object.entries(data)) {
    if (typeof v !== "string") throw new Error(`${name}: value for "${k}" must be a string`);
    if (seen.has(k) && merged[k] !== v && process.env.I18N_VERBOSE) console.warn(`override "${k}" (${seen.get(k)} -> ${name})`);
    merged[k] = v;
    seen.set(k, name);
  }
}
// Thai line breaking (ICU) splits words it does not know mid-word ("แพ็ก|เกจ", "แช|ตนั้|นพ|ร้|อม").
// scripts/thai-keep.mjs keeps the reviewed words in th-keep-together.json on one line (U+2060) and
// separates them from neighbouring Thai letters (U+200B) so the following words segment correctly.
const keep = compile(JSON.parse(readFileSync(new URL("th-keep-together.json", dir), "utf8")).words);
let protectedCount = 0;
for (const [k, v] of Object.entries(merged)) {
  const out = protectThai(v, keep);
  if (out !== strip(v)) protectedCount++;
  merged[k] = out;
}
writeFileSync(new URL("dict.th.json", dir), JSON.stringify(merged, null, 0) + "\n");
console.log(`i18n: ${Object.keys(merged).length} Thai strings (${protectedCount} with words kept together)`);
