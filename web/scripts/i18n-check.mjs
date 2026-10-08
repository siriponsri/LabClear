// Fails when a literal passed to t("...") / tf("...") has no Thai translation.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const root = new URL("..", import.meta.url).pathname;
const dict = JSON.parse(readFileSync(join(root, "lib/i18n/dict.th.json"), "utf8"));
const missing = new Map();
const re = /\bt[f]?\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g;
function walk(d) {
  for (const f of readdirSync(d)) {
    if (["node_modules", ".next", ".open-next", ".wrangler", "data"].includes(f)) continue;
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|mts)$/.test(f)) {
      const src = readFileSync(p, "utf8");
      for (const m of src.matchAll(re)) {
        if (m[1] === "`" && m[2].includes("${")) continue;
        const key = m[2].replace(/\\(["'`\\])/g, "$1");
        if (!/[A-Za-z]/.test(key) || key in dict) continue;
        missing.set(key, (missing.get(key) || []).concat(p.replace(root, "")));
      }
    }
  }
}
walk(root);
if (missing.size) {
  for (const [k, files] of missing) console.log(`MISSING  ${JSON.stringify(k)}  (${[...new Set(files)].join(", ")})`);
  console.log(`\n${missing.size} strings need a Thai translation in lib/i18n/th/*.json`);
  process.exit(1);
}
console.log("i18n: every t() string has a Thai translation");
