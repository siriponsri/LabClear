"use client";
/* Behaviour both chat surfaces share: action previews, page shortcuts and the page context. */
import { api, type ApiError } from "@/lib/api/client";
import type { T, TF } from "@/lib/i18n/shared";
import type { ShortcutView } from "./Turn";
import type { ChatMessage, PageContext, Shortcut } from "./types";

/** Confirm an action preview (book, quote, handoff, pay). Resolves true when it was done here. */
export async function confirmAction(
  m: ChatMessage,
  { t, notice, fail, refresh, requireAccount }: { t: T; notice: (s: string, tone?: "" | "bad" | "ok") => void; fail: (e: unknown) => void; refresh: () => Promise<unknown>; requireAccount: (reason: string) => void },
) {
  const type = m.action?.type;
  try {
    const r = await api.post<{ simulator_url?: string; url?: string; message?: string }>("/confirm", { action_id: m.action_id });
    if (r.simulator_url || r.url) {
      location.assign(r.simulator_url || r.url || "/");
      return true;
    }
    notice(type === "book" ? t("Appointment request sent. Our team will confirm it.") : type === "handoff" ? t("Your request is with our team.") : t(r.message || "Done."), "ok");
    await refresh();
    return true;
  } catch (e) {
    const err = e as ApiError;
    if (err.code === "account_required") requireAccount(t("Create an account or sign in before sending an appointment request, so you can follow it."));
    else if (err.code === "preview_expired" || err.code === "quote_changed") notice(t(err.message) + " " + t("Ask the assistant for a fresh preview."), "bad");
    else fail(e);
    return false;
  }
}

const VIEW_LABEL: Record<string, string> = {
  packages: "Browse packages",
  book: "Request a time",
  bookings: "My appointments",
  reports: "My reports",
  labs: "Lab dashboard",
  plan: "Plan",
  notifications: "Notifications",
  orgs: "My organization",
};

export type ShortcutOps = {
  /** In /app: switch view. Undefined on the website (the shortcut becomes a link to /app). */
  navigate?: (view: string, params?: Record<string, string>) => void;
  compare?: (ids: string[]) => void;
  highlight?: (fieldId: string) => void;
};

/** Whitelisted page shortcuts proposed by the assistant: navigate, prefill or show; never confirm. */
export function shortcutView(cmd: Shortcut, t: T, tf: TF, ops: ShortcutOps): ShortcutView | null {
  const x = (cmd.args || {}) as Record<string, any>;
  const appLink = (view: string, params: Record<string, string> = {}) => "/app?" + new URLSearchParams({ view, ...params });
  const pick = (keys: [string, unknown][]) => Object.fromEntries(keys.filter(([, v]) => v).map(([k, v]) => [k, String(v)]));
  switch (cmd.type) {
    case "open_package":
      if (!x.package_id) return null;
      return { label: tf("Open {name}", { name: x.name || x.package_id }), icon: "open", href: "/packages/" + encodeURIComponent(x.package_id) };
    case "open_compare": {
      const ids: string[] = (x.package_ids || []).filter((i: string) => /^P\d{2}$/.test(i)).slice(0, 3);
      if (ids.length < 2) return null;
      return ops.compare
        ? { label: t("Compare packages"), icon: "compare", run: () => ops.compare!(ids) }
        : { label: t("Compare packages"), icon: "compare", href: "/compare?ids=" + ids.map(encodeURIComponent).join(",") };
    }
    case "filter_catalog": {
      const p = pick([["q", x.q], ["segment", x.segment], ["max_price", x.max_price]]);
      return ops.navigate
        ? { label: t("Show matching packages"), icon: "open", run: () => ops.navigate!("packages", p) }
        : { label: t("Show matching packages"), icon: "open", href: "/packages" + (Object.keys(p).length ? "?" + new URLSearchParams(p) : "") };
    }
    case "prefill_booking": {
      if (!x.package_id) return null;
      const p = pick([["package", x.package_id], ["branch", x.branch_id], ["date", x.date]]);
      const label = x.date ? tf("Book {name} on {date}", { name: x.name || x.package_id, date: x.date }) : tf("Book {name}", { name: x.name || t("a checkup") });
      return ops.navigate ? { label, icon: "calendar", run: () => ops.navigate!("book", p) } : { label, icon: "calendar", href: appLink("book", p) };
    }
    case "open_org_form":
      return { label: t("Organization request form"), icon: "open", href: "/organizations#inq-title" };
    case "highlight_report_field":
      return ops.highlight
        ? { label: t("Show it on my report"), icon: "value", run: () => ops.highlight!(String(x.field_id || "")) }
        : { label: t("Show it on my report"), icon: "value", href: appLink("reports") };
    case "open_view": {
      const view = String(x.view || "");
      if (!VIEW_LABEL[view]) return null;
      const label = t(VIEW_LABEL[view]);
      if (ops.navigate) return { label, icon: "open", run: () => ops.navigate!(view) };
      return { label, icon: "open", href: view === "packages" ? "/packages" : appLink(view) };
    }
  }
  return null;
}

/** The website page the visitor is looking at (PageContext in routers/business.py). */
export function sitePageContext(): PageContext {
  const ctx: PageContext = { path: location.pathname.replace(/[^A-Za-z0-9/_-]/g, "").slice(0, 120) };
  const m = location.pathname.match(/^\/packages\/(P\d{2})$/);
  if (m) ctx.package_id = m[1];
  const ids = new URLSearchParams(location.search).get("ids");
  if (location.pathname === "/compare" && ids) ctx.compare_ids = ids.split(",").filter((x) => /^P\d{2}$/.test(x)).slice(0, 3);
  return ctx;
}
