import "server-only";
/*
 * Server-side reads from the FastAPI service while rendering a page.
 * - Render and local development: the request goes to API_ORIGIN (default http://127.0.0.1:8000).
 * - Cloudflare (deferred option): when API_ORIGIN is not set, the "API" service binding is tried.
 * A short timeout keeps pages fast; callers fall back to bundled seed data (lib/site-data.ts)
 * while the API container wakes up.
 */
import { getLang } from "@/lib/i18n/server";

type Binding = { fetch: (request: Request) => Promise<Response> };

async function binding(): Promise<Binding | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const env = getCloudflareContext().env as unknown as { API?: Binding };
    return env.API ?? null;
  } catch {
    return null;
  }
}

export async function apiGet<T>(path: string, timeoutMs = 2500): Promise<T> {
  const lang = await getLang();
  const headers = { Accept: "application/json", "X-LabClear-Language": lang };
  const signal = AbortSignal.timeout(timeoutMs);
  const service = process.env.API_ORIGIN ? null : await binding();
  const response = service
    ? await service.fetch(new Request("https://labclear-api.internal" + path, { headers, signal }))
    : await fetch((process.env.API_ORIGIN || "http://127.0.0.1:8000").replace(/\/$/, "") + path, { headers, signal, cache: "no-store" });
  if (!response.ok) throw Object.assign(new Error(`API ${response.status} for ${path}`), { status: response.status });
  return (await response.json()) as T;
}
