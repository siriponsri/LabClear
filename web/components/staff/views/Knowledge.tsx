"use client";
/* Reference document review (manager, 4.0.0). Organizations upload reference documents; a manager
   reads every passage and approves or rejects. Passages that look like instructions to an AI are
   flagged by the server and never used, even after approval. Backend: routers/org.py. */
import { useId, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { ago, when } from "@/lib/format";
import { ActionButton, Badge, Empty, Intro, Skeleton } from "@/components/workspace/ui";
import { useStaff } from "../context";
import { Chip, Icon, Kv, Loaded, RefreshButton, StateBadge, errText, useLoad } from "../parts";
import type { T } from "@/lib/i18n/shared";

type DocState = "pending" | "approved" | "rejected";
type Doc = {
  id: string;
  org_id: string;
  org_name: string;
  title: string;
  filename: string;
  file_type: string;
  source_url: string;
  note: string;
  state: DocState;
  chunks: number;
  flagged: number;
  characters: number;
  uploaded_by: string;
  uploaded_at: number;
  reviewed_at: number | null;
  review_note: string;
  sha256: string;
};
type Passage = { n: number; text: string; flagged: boolean };

type Filter = DocState | "all";
const memory = { filter: "pending" as Filter };
const isFilter = (v: string | undefined): v is Filter => !!v && ["pending", "approved", "rejected", "all"].includes(v);
const docStates = (t: T): Record<string, [string, "warn" | "ok" | "bad"]> => ({
  pending: [t("Waiting for review"), "warn"],
  approved: [t("Approved"), "ok"],
  rejected: [t("Rejected"), "bad"],
});
const fileType = (t: T, k: string) => ({ pdf: "PDF", docx: "Word (.docx)", text: t("Text file") })[k] || k;
const narrow = () => matchMedia("(max-width: 860px)").matches;

export function Knowledge() {
  const { t, tf, lang, params, navigate, counts } = useStaff();
  const [filter, setFilter] = useState<Filter>(isFilter(params.state) ? params.state : memory.filter);
  const [active, setActive] = useState(params.doc || "");
  const readerRef = useRef<HTMLDivElement>(null);
  const org = params.org || "";
  const state = useLoad(() => api.get<{ documents: Doc[] }>("/staff/org-documents" + (filter === "all" ? "" : "?state=" + filter)), [filter]);
  const docs = (state.data?.documents || []).filter((d) => !org || d.org_id === org);
  const orgName = org ? docs[0]?.org_name || "" : "";
  // Nothing chosen yet (or the chosen one left this queue): open the first document on wide screens.
  const current = docs.some((d) => d.id === active) ? active : !narrow() && docs[0] ? docs[0].id : "";

  const pick = (f: Filter) => {
    memory.filter = f;
    setFilter(f);
    setActive("");
  };
  const open = (id: string) => {
    setActive(id);
    if (narrow()) setTimeout(() => readerRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 50);
  };
  const afterReview = async (id: string) => {
    const i = docs.findIndex((d) => d.id === id);
    const next = docs[i + 1] || docs[i - 1];
    await state.reload();
    setActive(next ? next.id : "");
  };

  const chips: [Filter, string][] = [
    ["pending", counts.pendingDocs ? tf("{label} ({n})", { label: t("Waiting for review"), n: counts.pendingDocs }) : t("Waiting for review")],
    ["approved", t("Approved")],
    ["rejected", t("Rejected")],
    ["all", t("All")],
  ];

  return (
    <div>
      <Intro title={t("Reference document review")}>
        {t("Organizations add reference documents, such as their laboratory's printed ranges or preparation instructions. The assistant cites a document only for that organization's members, and only after you approve it. Passages that look like instructions to an AI are never used.")}
      </Intro>
      <div className="toolbar" role="group" aria-label={t("Show documents")}>
        {chips.map(([v, label]) => (
          <Chip key={v} pressed={filter === v} onClick={() => pick(v)}>
            {label}
          </Chip>
        ))}
        <RefreshButton run={state.reload} />
      </div>
      {org ? (
        <p className="sd-filter-note small">
          {orgName ? tf("Showing documents from {name}.", { name: orgName }) : t("Showing documents from one organization.")}{" "}
          <button type="button" className="link-btn small" onClick={() => navigate("knowledge", filter === "pending" ? {} : { state: filter })}>
            {t("Show every organization")}
          </button>
        </p>
      ) : null}
      <Loaded state={state}>
        {() =>
          docs.length ? (
            <div className="staff-grid sd-review">
              <div className="staff-list" role="list" aria-label={t("Documents")}>
                {docs.map((d) => (
                  <div role="listitem" key={d.id} style={{ display: "contents" }}>
                    <button type="button" className="ticket-btn" aria-current={d.id === current} onClick={() => open(d.id)}>
                      <strong>{d.title}</strong>
                      <small>
                        {d.org_name || t("Unknown organization")} · {ago(d.uploaded_at, lang)}
                      </small>
                      <span className="row sd-row-tight">
                        <StateBadge map={docStates(t)} value={d.state} />
                        {d.flagged ? <Badge tone="bad">{tf("{n} flagged", { n: d.flagged })}</Badge> : null}
                      </span>
                    </button>
                  </div>
                ))}
              </div>
              <div className="staff-thread" ref={readerRef}>
                {current ? (
                  <Reader key={current} id={current} onReviewed={afterReview} />
                ) : (
                  <Empty title={t("Select a document")}>{t("Its passages, the uploader's note and the review actions appear here.")}</Empty>
                )}
              </div>
            </div>
          ) : (
            <Empty title={filter === "pending" ? t("Nothing to review") : t("No documents here")}>
              {filter === "pending" ? t("New uploads from organization admins appear here. You also get a notification.") : t("No documents in this group.")}
            </Empty>
          )
        }
      </Loaded>
    </div>
  );
}

function Reader({ id, onReviewed }: { id: string; onReviewed: (id: string) => Promise<void> }) {
  const { t, tf, lang, notice, confirm, refreshCounts } = useStaff();
  const state = useLoad(() => api.get<Doc & { passages: Passage[] }>("/staff/org-documents/" + id), [id]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const noteId = useId();

  if (state.data === null && state.loading) return <Skeleton />;
  if (state.data === null)
    return (
      <Empty title={t("This document cannot be opened")} actions={<ActionButton run={() => state.reload().catch(() => {})}>{t("Try again")}</ActionButton>}>
        {t(state.error)}
      </Empty>
    );
  const d = state.data;
  const review = async (decision: "approve" | "reject") => {
    setError("");
    try {
      await api.post("/staff/org-documents/" + id + "/review", { decision, note: note.trim() });
      notice(decision === "approve" ? tf("Approved: {title}. Members can now see it in chat.", { title: d.title }) : tf("Rejected: {title}. It is not used in chat.", { title: d.title }), "ok");
      refreshCounts();
      await onReviewed(id);
    } catch (e) {
      setError(errText(e));
    }
  };
  let safeSource = "";
  try {
    safeSource = d.source_url && new URL(d.source_url).protocol === "https:" ? d.source_url : "";
  } catch {
    safeSource = "";
  }
  return (
    <>
      <div className="record-head">
        <h3>{d.title}</h3>
        <StateBadge map={docStates(t)} value={d.state} />
      </div>
      <Kv
        rows={[
          [t("Organization"), d.org_name || t("Unknown organization")],
          [t("File"), [d.filename, fileType(t, d.file_type), tf("{n} characters", { n: d.characters.toLocaleString("en-US") })].filter(Boolean).join(" · ")],
          [t("Uploaded"), tf("{who}, {when}", { who: d.uploaded_by || t("Unknown"), when: when(d.uploaded_at, lang) })],
          [
            t("Source"),
            safeSource ? (
              <a href={safeSource} target="_blank" rel="noopener noreferrer" className="sd-break">
                {safeSource} <Icon name="external" size={13} />
              </a>
            ) : (
              t("No link given")
            ),
          ],
          [t("Note from the uploader"), d.note || t("None")],
          [t("Passages"), d.flagged ? tf("{n} passages, {m} flagged", { n: d.chunks, m: d.flagged }) : tf("{n} passages", { n: d.chunks })],
          [t("File fingerprint"), <span key="sha" className="mono">{d.sha256}</span>],
          ...(d.reviewed_at ? ([[t("Last review"), tf("{when}: {note}", { when: when(d.reviewed_at, lang), note: d.review_note || t("no note") })]] as [string, React.ReactNode][]) : []),
        ]}
      />
      {d.flagged ? (
        <p className="callout warn small sd-flag-callout">
          <Icon name="warn" />
          <span>
            {tf("{n} passages look like instructions to an AI. They are marked below and are never used, even after approval. Approving needs a review note.", { n: d.flagged })}
          </span>
        </p>
      ) : null}
      <section aria-labelledby={"pass-" + id} className="stack-sm">
        <h4 id={"pass-" + id}>{t("Passages the assistant may cite")}</h4>
        <ol className="sd-passages" tabIndex={0} aria-label={t("Document passages")}>
          {d.passages.map((p) => (
            <li key={p.n} className={"sd-passage" + (p.flagged ? " flagged" : "")}>
              <span className="sd-pnum num" aria-hidden="true">
                {p.n}
              </span>
              <div className="sd-pbody">
                {p.flagged ? (
                  <p className="sd-flag">
                    <Icon name="warn" size={14} />
                    {t("Looks like an instruction to an AI — will not be used")}
                  </p>
                ) : null}
                <p className="sd-ptext">{p.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <form
        className="form-grid sd-review-form"
        onSubmit={(e) => {
          e.preventDefault();
          review("approve");
        }}
      >
        <div className="field">
          <label htmlFor={noteId}>{t("Review note")}</label>
          <span className="hint" id={noteId + "-hint"}>
            {d.flagged ? t("Needed to approve a document with flagged passages (at least 5 characters). The organization's admins can read it.") : t("Optional. The organization's admins can read it.")}
          </span>
          <textarea id={noteId} className="input" rows={2} maxLength={500} aria-describedby={noteId + "-hint"} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error ? (
          <p className="field-error" role="alert">
            {t(error)}
          </p>
        ) : null}
        <div className="form-actions">
          {d.state !== "approved" ? (
            <ActionButton className="btn primary sm" run={() => review("approve")}>
              {t("Approve for chat")}
            </ActionButton>
          ) : null}
          {d.state !== "rejected" ? (
            <ActionButton className="btn sm danger" run={() => review("reject")}>
              {d.state === "approved" ? t("Withdraw approval") : t("Reject")}
            </ActionButton>
          ) : null}
          <button
            type="button"
            className="btn sm ghost"
            onClick={() =>
              confirm({
                title: t("Delete this document?"),
                body: <p>{tf("{title} is removed for good and is no longer used in chat. The organization can upload it again.", { title: d.title })}</p>,
                confirmLabel: t("Delete document"),
                danger: true,
                run: async () => {
                  await api.del("/staff/org-documents/" + id);
                  notice(t("Document deleted."));
                  refreshCounts();
                  await onReviewed(id);
                },
              })
            }
          >
            {t("Delete")}
          </button>
        </div>
      </form>
    </>
  );
}
