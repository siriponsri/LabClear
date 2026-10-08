import type { NextConfig } from "next";

/*
 * Pages render here; every /api request goes to the FastAPI service.
 * - Local development: Next.js proxies /api and /health to API_ORIGIN (default http://127.0.0.1:8000).
 * - Cloudflare: worker.ts sends /api and /health to the API worker through a service binding
 *   before Next.js sees the request, so this rewrite is only a development convenience.
 */
const api = (process.env.API_ORIGIN || "http://127.0.0.1:8000").replace(/\/$/, "");

const csp = [
  "default-src 'self'",
  // Next.js streams its bootstrap as inline scripts; no third-party script is loaded.
  process.env.NODE_ENV === "development" ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-src 'self' https://www.google.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/api/:path*", destination: `${api}/api/:path*` },
        { source: "/health", destination: `${api}/health` },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Coursework simulation: never ask search engines to index simulated clinics or prices.
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default config;

if (process.env.NODE_ENV === "development" && process.env.CF_DEV_BINDINGS === "1") {
  // Optional: expose wrangler.jsonc bindings to `next dev`.
  import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
}
