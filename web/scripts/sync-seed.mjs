// Copies the business seed files and the public evidence catalog next to the website, so pages
// still render (with the seed catalog) while the API container is starting.
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
const root = new URL("../../", import.meta.url);
const out = new URL("../data/seed/", import.meta.url);
mkdirSync(out, { recursive: true });
const files = {
  "business_data/catalog.json": "catalog.json",
  "business_data/branches.json": "branches.json",
  "business_data/policies.json": "policies.json",
  "business_data/plans.json": "plans.json",
  "business_data/dots.json": "dots.json",
  "knowledge/evidence/catalog.json": "evidence.json",
};
for (const [from, to] of Object.entries(files)) {
  const src = new URL(from, root);
  if (!existsSync(src)) { console.error("missing " + from); process.exit(1); }
  copyFileSync(src, new URL(to, out));
}
console.log("seed data synced");
