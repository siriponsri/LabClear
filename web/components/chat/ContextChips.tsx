"use client";
/* What this chat uses besides the conversation: the confirmed report, a previous report to
   compare with, and (integration 4.0, Codex contract) whether approved organization references
   can reach the assistant. Membership is assigned by a manager; there is no per-chat choice. */
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { useT } from "@/lib/i18n/client";
import { useSession } from "@/lib/session";
import { Icon } from "./icons";
import type { WorkspaceState } from "./types";

export type Features = { org_documents: boolean; org_reference_inference: boolean; hospital_links: boolean; landing_preview: boolean };
type Listing = { can_edit: boolean; documents: { id: string; state: string }[] };
export type Membership = { enabled: boolean; member: boolean; role: "" | "reader" | "editor" };
export type OrgRefs = { approved: number; canEdit: boolean; inference: boolean };

let featureCache: Promise<Features | null> | null = null;
/** Optional pages and features switched on by the server owner (booleans only). */
export function loadFeatures(): Promise<Features | null> {
  if (!featureCache) featureCache = api.get<Features>("/site/features").catch(() => null);
  return featureCache;
}

/** The signed-in member's organization references, or null (not a member, guest or switched off). */
export function useOrgReferences(state: WorkspaceState | null, registered: boolean) {
  const [refs, setRefs] = useState<OrgRefs | null>(null);
  const chatId = state?.conversation.chat_id || "";
  useEffect(() => {
    if (!registered || !chatId) {
      setRefs(null);
      return;
    }
    let alive = true;
    (async () => {
      const f = await loadFeatures();
      if (!f?.org_documents) return alive && setRefs(null);
      try {
        // Ask for the caller's own membership first, so non-members never trigger a 403.
        const m = await api.get<Membership>("/site/membership");
        if (!m.member) return alive && setRefs(null);
        const l = await api.get<Listing>("/organization-documents");
        if (alive) setRefs({ approved: l.documents.filter((d) => d.state === "approved").length, canEdit: l.can_edit, inference: f.org_reference_inference });
      } catch {
        if (alive) setRefs(null); // 403: no organization membership
      }
    })();
    return () => {
      alive = false;
    };
  }, [registered, chatId]);
  return refs;
}

function OrgChip({ refs, onOpen }: { refs: OrgRefs; onOpen?: () => void }) {
  const { t, tf } = useT();
  const used = refs.inference && refs.approved > 0;
  const text = used
    ? tf("Organization references in use: {n} approved", { n: refs.approved })
    : refs.inference
      ? t("Organization references: none approved yet")
      : t("Organization references: search only, not sent to the assistant");
  return (
    <button type="button" className={"chip" + (used ? " active" : "")} onClick={onOpen} title={t("Approved documents of your organization. Your own reports are never shared with it.")}>
      <Icon name="building" />
      <span className="chip-text">{text}</span>
    </button>
  );
}

export function ContextChips({ state, refs, onOpenOrg, onChanged }: { state: WorkspaceState; refs: OrgRefs | null; onOpenOrg?: () => void; onChanged: () => Promise<unknown> }) {
  const { t, tf } = useT();
  const { notice, fail } = useSession();
  const c = state.conversation;
  const report = state.reports.find((x) => x.id === c.report_id);
  const previous = c.compare_report_id && c.compare_report_id !== c.report_id ? state.reports.find((x) => x.id === c.compare_report_id) : undefined;
  const label = (r: { label: string; date: string }) => t(r.label || "My report") + (r.date ? " · " + r.date : "");

  const clear = async (path: string, message: string) => {
    try {
      await api.post(path, { report_id: "" });
      await onChanged();
      notice(message);
    } catch (e) {
      fail(e);
    }
  };

  if (!report && !previous && !refs) return null;
  return (
    <div className="context-chips" role="group" aria-label={t("Conversation context")}>
      {report ? (
        <button type="button" className="chip active" aria-label={tf("Stop using report {label}", { label: label(report) })} onClick={() => clear("/reports/select", t("The report is no longer used in this conversation."))}>
          <Icon name="source" />
          <span className="chip-text">{tf("Report in use: {label}", { label: label(report) })}</span>
          <span className="x" aria-hidden="true">
            ×
          </span>
        </button>
      ) : null}
      {previous ? (
        <button type="button" className="chip" aria-label={tf("Stop comparing with {label}", { label: label(previous) })} onClick={() => clear("/reports/compare", t("The previous report is no longer compared in this conversation."))}>
          <Icon name="compare" />
          <span className="chip-text">{tf("Previous report: {label}", { label: label(previous) })}</span>
          <span className="x" aria-hidden="true">
            ×
          </span>
        </button>
      ) : null}
      {refs ? <OrgChip refs={refs} onOpen={onOpenOrg} /> : null}
    </div>
  );
}
