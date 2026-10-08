"use client";
/* What this chat uses besides the conversation: the confirmed report, a previous report to
   compare with, and the organization whose reviewed documents may be cited (CEO requirement 1). */
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { useT } from "@/lib/i18n/client";
import { useSession } from "@/lib/session";
import { Icon } from "./icons";
import type { WorkspaceState } from "./types";

type Membership = { org: { id: string; name: string; kind: string }; role: string };
type Mine = { memberships: Membership[]; chat_org_id: string };

/** Organizations the signed-in user belongs to, and the one this chat uses. */
export function useOrgScope(state: WorkspaceState | null, registered: boolean) {
  const [mine, setMine] = useState<Mine | null>(null);
  const chatId = state?.conversation.chat_id || "";
  const orgId = (state?.conversation.org_id as string) || "";
  useEffect(() => {
    if (!registered || !chatId) {
      setMine(null);
      return;
    }
    let alive = true;
    api
      .get<Mine>("/orgs/mine")
      .then((m) => alive && setMine(m))
      .catch(() => alive && setMine(null));
    return () => {
      alive = false;
    };
  }, [registered, chatId, orgId]);
  return [mine, setMine] as const;
}

function OrgChip({ mine, onChange }: { mine: Mine; onChange: (m: Mine) => void }) {
  const { t, tf } = useT();
  const { fail } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const current = mine.memberships.find((m) => m.org.id === mine.chat_org_id);

  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector<HTMLButtonElement>("[role=menuitemradio][aria-checked=true], [role=menuitemradio]")?.focus();
    const outside = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", outside);
    return () => document.removeEventListener("click", outside);
  }, [open]);

  const pick = async (orgId: string) => {
    setOpen(false);
    setBusy(true);
    try {
      const r = await api.post<{ chat_org_id: string }>("/chat/org-scope", { org_id: orgId });
      onChange({ ...mine, chat_org_id: r.chat_org_id });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
      btn.current?.focus();
    }
  };

  return (
    <div className="org-scope" ref={wrap}>
      <button
        ref={btn}
        type="button"
        className={"chip" + (current ? " active" : "")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={busy || undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="building" />
        <span className="chip-text">{current ? tf("Using documents from: {name}", { name: current.org.name }) : t("Organization documents: off")}</span>
        <Icon name="chevron" className="chev" />
      </button>
      {open ? (
        <div
          className="org-menu"
          role="menu"
          aria-label={t("Organization documents for this chat")}
          onKeyDown={(e) => {
            const items = Array.from(wrap.current?.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]") || []);
            const i = items.indexOf(document.activeElement as HTMLButtonElement);
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
              btn.current?.focus();
            } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
            }
          }}
        >
          <p className="tiny muted org-menu-note">{t("Answers may cite reviewed documents from the organization you choose. Your own reports are never shared with it.")}</p>
          {mine.memberships.map((m) => (
            <button key={m.org.id} type="button" role="menuitemradio" aria-checked={m.org.id === mine.chat_org_id} onClick={() => pick(m.org.id)}>
              {m.org.name}
            </button>
          ))}
          <button type="button" role="menuitemradio" aria-checked={!current} onClick={() => pick("none")}>
            {t("Do not use organization documents")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ContextChips({ state, mine, setMine, onChanged }: { state: WorkspaceState; mine: Mine | null; setMine: (m: Mine) => void; onChanged: () => Promise<unknown> }) {
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

  if (!report && !previous && !mine?.memberships.length) return null;
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
      {mine?.memberships.length ? <OrgChip mine={mine} onChange={setMine} /> : null}
    </div>
  );
}
