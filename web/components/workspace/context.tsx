"use client";
import { createContext, useContext } from "react";
import type { api as Api, Conversation, User } from "@/lib/api/client";
import type { T, TF, Lang } from "@/lib/i18n/shared";
import type { Branch, Catalog } from "@/lib/types";

/** GET /api/business/workspace */
export type WorkspaceState = {
  conversation: Conversation;
  bookings: any[];
  tickets: any[];
  quotes: any[];
  reports: { id: string; label: string; date: string; confirmed: boolean; pages: number; sample: boolean }[];
  user: User;
  payments: any[];
  unread_notifications: number;
  inquiries: any[];
  plan: { plan: string; can_read: boolean; images_per_read?: number; period_end?: string; [k: string]: any };
  chats: { active: string; active_project: string; chats: any[]; projects: any[] };
  line_linked: boolean;
};

export type ViewId = "chat" | "packages" | "book" | "bookings" | "labs" | "reports" | "plan" | "notifications" | "orgs";

export type WorkspaceCtx = {
  api: typeof Api;
  t: T;
  tf: TF;
  lang: Lang;
  user: User | null;
  /** Latest /workspace payload (null until the first load). */
  state: WorkspaceState | null;
  /** Reload /workspace; returns the fresh state. */
  refresh: () => Promise<WorkspaceState | null>;
  view: ViewId;
  params: Record<string, string>;
  /** Switch view (updates the URL; params become query string). */
  navigate: (view: ViewId, params?: Record<string, string>, push?: boolean) => void;
  notice: (text: string, tone?: "" | "bad" | "ok") => void;
  fail: (e: unknown) => void;
  /** Open the shared dialog. */
  modal: (title: string, content: React.ReactNode) => void;
  closeModal: () => void;
  /** Ask a guest to sign in before an account-only action. */
  requireAccount: (reason: string) => void;
  /** Catalog and centers, loaded once. */
  business: () => Promise<{ catalog: Catalog; branches: Branch[]; maps_embed_key: string }>;
  /** Prefill the chat composer and switch to the chat (used by shortcuts and deep links). */
  ask: (text: string, send?: boolean) => void;
  /** Set by the chat view: lets other views put text into the composer. */
  registerComposer: (fn: (text: string, send?: boolean) => void) => void;
  setUnread: (n: number) => void;
};

export const WorkspaceContext = createContext<WorkspaceCtx | null>(null);

export function useWorkspace(): WorkspaceCtx {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace() needs <Workspace>");
  return ctx;
}
