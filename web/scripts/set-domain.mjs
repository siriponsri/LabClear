// Usage: npm run cf:domain -- labclear.example.com
// Attaches the website worker to a hostname on a zone in the same Cloudflare account.
import { readFileSync, writeFileSync } from "node:fs";
const domain = (process.argv[2] || "").trim().toLowerCase();
if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
  console.error("Give a hostname, e.g. npm run cf:domain -- labclear.example.com");
  process.exit(1);
}
const file = new URL("../wrangler.jsonc", import.meta.url);
const text = readFileSync(file, "utf8");
const next = text.replace(/"routes":\s*\[[^\]]*\]/, `"routes": [{ "pattern": "${domain}", "custom_domain": true }]`);
writeFileSync(file, next);
console.log(`wrangler.jsonc now routes https://${domain} to labclear-web. Set BUSINESS_PUBLIC_URL=https://${domain} on the API worker too.`);
