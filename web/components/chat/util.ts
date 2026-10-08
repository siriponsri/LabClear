"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { Lang } from "@/lib/i18n/shared";
import type { Branch, Catalog } from "@/lib/types";

/** http(s) only; same-origin paths stay relative so they can use client navigation. */
export function safeUrl(url: string | undefined): { href: string; internal: boolean } | null {
  if (!url || typeof window === "undefined") return null;
  try {
    const u = new URL(url, location.origin);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    const internal = u.origin === location.origin;
    return { href: internal ? u.pathname + u.search + u.hash : u.href, internal };
  } catch {
    return null;
  }
}

export const clock = (at: number, lang: Lang) =>
  at ? new Date(at * 1000).toLocaleTimeString(lang === "th" ? "th-TH" : "en-GB", { hour: "2-digit", minute: "2-digit" }) : "";

/** Report page images need the guest header, so they are fetched as blobs (memory only). */
export function useObjectUrl(src: string | undefined) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!src) return;
    if (!src.startsWith("/api/business/")) {
      setUrl(src);
      return;
    }
    let alive = true;
    let made = "";
    api
      .objectUrl(src)
      .then((u) => {
        made = u;
        if (alive) setUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [src]);
  return { url, failed };
}

export const reportImage = (reportId: string, page = 1) => "/api/business/reports/" + encodeURIComponent(reportId) + "/source?page=" + page;

/* Catalog and centers, loaded once per page (public data, kept in memory). */
let business: Promise<{ catalog: Catalog; branches: Branch[] }> | null = null;
export function loadBusiness() {
  if (!business)
    business = Promise.all([api.get<Catalog>("/catalog"), api.get<{ branches: Branch[] }>("/branches")])
      .then(([catalog, b]) => ({ catalog, branches: b.branches }))
      .catch((e) => {
        business = null;
        throw e;
      });
  return business;
}

export function useBranchName(id: string | undefined) {
  const [name, setName] = useState(id || "");
  useEffect(() => {
    if (!id) return;
    let alive = true;
    loadBusiness()
      .then((b) => alive && setName(b.branches.find((x) => x.id === id)?.name || id))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);
  return name;
}

/** Same-person check for a turn's "last" flag and stable lists. */
export const shallowSame = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((x, i) => x === b[i]);
