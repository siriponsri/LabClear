"use client";
/* Shared state of the service desk (/staff): who is signed in, navigation, the dialog and caches. */
import { createContext, useContext } from "react";
import type { User } from "@/lib/api/client";
import type { Lang, T, TF } from "@/lib/i18n/shared";
import type { Branch, Catalog } from "@/lib/types";

export type ViewId =
  | "overview"
  | "staff"
  | "operations"
  | "customers"
  | "payments"
  | "notifications"
  | "catalog-admin"
  | "centers"
  | "roles"
  | "ai"
  | "channels"
  | "audit"
  | "organizations";

export const VIEW_IDS: ViewId[] = [
  "overview",
  "staff",
  "operations",
  "customers",
  "payments",
  "notifications",
  "catalog-admin",
  "centers",
  "roles",
  "ai",
  "channels",
  "audit",
  "organizations",
];
/** Views only a manager may open (the server enforces the same rule). */
export const MANAGER_VIEWS: ViewId[] = ["catalog-admin", "centers", "roles", "ai", "channels", "audit", "organizations"];

export const isViewId = (v: string | null | undefined): v is ViewId => !!v && (VIEW_IDS as string[]).includes(v);

export type Biz = { catalog: Catalog; branches: Branch[] };
export type Counts = { waiting: number; requested: number };

export type ConfirmOptions = {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** Runs when confirmed. A thrown error is shown inside the dialog, which stays open. */
  run: () => Promise<unknown>;
};

export type StaffCtx = {
  t: T;
  tf: TF;
  lang: Lang;
  user: User;
  manager: boolean;
  view: ViewId;
  params: Record<string, string>;
  /** Switch view; params become the query string (?view=...&key=value). */
  navigate: (view: ViewId, params?: Record<string, string>) => void;
  notice: (text: string, tone?: "" | "ok" | "bad") => void;
  fail: (e: unknown) => void;
  modal: (title: string, content: React.ReactNode) => void;
  closeModal: () => void;
  dialogOpen: boolean;
  confirm: (o: ConfirmOptions) => void;
  /** Catalog and centers (loaded once; fresh=true reloads after a manager edit). */
  biz: Biz | null;
  business: (fresh?: boolean) => Promise<Biz>;
  branchName: (id: string) => string;
  counts: Counts;
  refreshCounts: () => void;
  setUnread: (n: number) => void;
};

export const StaffContext = createContext<StaffCtx | null>(null);

export function useStaff(): StaffCtx {
  const ctx = useContext(StaffContext);
  if (!ctx) throw new Error("useStaff() needs <StaffDesk>");
  return ctx;
}
