/*
 * The comparison tray lives in the URL (?compare=P01,P02), never in browser storage, so it
 * survives moving between /packages and package pages and can be shared as a link.
 */
export const MAX_COMPARE = 3;

export function parseCompare(value: string | string[] | null | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(",") : value || "";
  const ids = raw.split(",").map((s) => s.trim()).filter((s) => /^[A-Za-z0-9_-]{1,12}$/.test(s));
  return [...new Set(ids)].slice(0, MAX_COMPARE);
}

/** Keeps commas readable in the address bar (?compare=P01,P02). */
export function queryString(params: URLSearchParams): string {
  const s = params.toString().replace(/%2C/gi, ",");
  return s ? "?" + s : "";
}

/** Adds the current comparison to an internal link. */
export function withCompare(href: string, ids: string[]): string {
  if (!ids.length) return href;
  const [path, qs = ""] = href.split("?");
  const params = new URLSearchParams(qs);
  params.set("compare", ids.join(","));
  return path + queryString(params);
}
