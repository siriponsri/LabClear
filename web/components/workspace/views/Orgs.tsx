"use client";
/*
 * My organization (CEO requirement 1, 4.0.0): join a hospital, clinic or company with its code,
 * see the reference documents LabClear staff approved for it, let the chat cite them, and — for an
 * organization admin — upload documents for review. Backend: routers/org.py, services/org_knowledge.py.
 */
import { useId, useRef, useState } from "react";
import type { T } from "@/lib/i18n/shared";
import { api as apiClient } from "@/lib/api/client";
import { useWorkspace } from "../context";
import { Badge, Empty } from "../ui";
import { Act, dayText, errorText, LoadError, Loading, useConfirm, useLoad } from "./shared";

type Org = { id: string; name: string; kind: string; active: boolean; docs_version: number; created: number };
type Doc = {
  id: string;
  org_id: string;
  title: string;
  filename: string;
  file_type: string;
  source_url: string;
  note: string;
  state: "pending" | "approved" | "rejected";
  chunks: number;
  flagged: number;
  characters: number;
  uploaded_by: string;
  uploaded_at: number;
  reviewed_at: number | null;
  review_note: string;
};
type Membership = { org: Org; role: "member" | "admin"; joined: number; documents: Doc[] };
type Mine = { memberships: Membership[]; chat_org_id: string; signed_in: boolean };

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = ".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown";

function kindLabel(t: T, kind: string) {
  return ({ hospital: t("Hospital"), clinic: t("Clinic"), company: t("Company"), other: t("Other organization") } as Record<string, string>)[kind] || kind;
}
function fileLabel(t: T, type: string) {
  return ({ pdf: "PDF", docx: "Word (.docx)", text: t("Text file") } as Record<string, string>)[type] || type;
}

/** Clear Thai messages for every upload error code in services/org_knowledge.py. */
function uploadError(t: T, e: unknown): string {
  const code = (e as { code?: string })?.code || "";
  const messages: Record<string, string> = {
    document_type: t("This file type cannot be used. Upload a PDF with selectable text, a Word file (.docx), or a .txt or .md file."),
    document_no_text: t("No readable text was found in this file. A scanned PDF has no text layer: export the document as PDF from Word or Google Docs, or upload the .docx file instead."),
    document_too_large: t("This file is larger than 5 MB. Remove pictures or split the document, then try again."),
    document_too_long: t("This document is too long. Upload a PDF of 60 pages or fewer, or split the text into smaller files."),
    org_doc_duplicate: t("This file was already added to the organization. Delete the old copy first if you want to replace it."),
    org_doc_url: t("The source link must start with https:// (for example https://hospital.example/guide)."),
    org_doc_limit: t("Your organization already keeps 30 documents. Delete one you no longer need, then upload again."),
    document_invalid: t("This file could not be opened. Check that it is not damaged or password-protected, then try again."),
    forbidden: t("Only an organization admin can add or remove documents. Ask a LabClear manager to make you an admin."),
    org_inactive: t("This organization is inactive, so documents cannot be added."),
  };
  return messages[code] || errorText(t, e);
}

/** multipart POST with upload progress (fetch cannot report it). Same headers as the api client. */
function postWithProgress(path: string, body: FormData, onProgress: (pct: number) => void): Promise<Doc> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/business" + path);
    xhr.withCredentials = true;
    Object.entries(apiClient.headers({ Accept: "application/json" })).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let d: any;
      try {
        d = JSON.parse(xhr.responseText);
      } catch {
        return reject(Object.assign(new Error("The server response could not be read."), { code: xhr.status === 413 ? "document_too_large" : "bad_response", status: xhr.status }));
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(d);
      let message = d?.message || (typeof d?.detail === "string" ? d.detail : "The request could not be completed.");
      if (Array.isArray(d?.detail)) message = "Please check: " + d.detail.map((x: any) => (x.loc || []).slice(-1)[0]).filter(Boolean).join(", ") + ".";
      reject(Object.assign(new Error(message), { code: d?.code, status: xhr.status }));
    };
    xhr.onerror = () => reject(Object.assign(new Error("You appear to be offline. Check your connection and try again."), { code: "network" }));
    xhr.send(body);
  });
}

function formatCode(v: string) {
  const c = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return c.length > 4 ? c.slice(0, 4) + "-" + c.slice(4) : c;
}

function JoinForm({ onJoined, compact }: { onJoined: () => Promise<unknown>; compact: boolean }) {
  const { api, t, tf, notice } = useWorkspace();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ready = code.replace("-", "").length === 8;
  return (
    <form
      className={"org-join" + (compact ? " compact" : " card")}
      aria-labelledby="org-join-title"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        setErr("");
        try {
          const r = await api.post<{ org: Org; role: string }>("/orgs/join", { code });
          setCode("");
          notice(tf("You joined {name}.", { name: r.org.name }));
          await onJoined();
        } catch (x) {
          setErr(errorText(t, x));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 id="org-join-title">{compact ? t("Join another organization") : t("Join with a code")}</h3>
      {!compact ? <p className="small muted">{t("Your hospital, clinic or company gives you an 8-character code. You can join up to 5 organizations.")}</p> : null}
      <div className="org-join-row">
        <div className="field">
          <label htmlFor="org-code">{t("Join code")}</label>
          <input
            id="org-code"
            className="input org-code"
            value={code}
            onChange={(e) => {
              setCode(formatCode(e.target.value));
              setErr("");
            }}
            placeholder="ABCD-2345"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={9}
            aria-invalid={!!err || undefined}
            aria-describedby={err ? "org-code-error" : undefined}
          />
        </div>
        <button type="submit" className="btn primary" disabled={!ready || busy} aria-busy={busy || undefined}>
          {busy ? t("Joining…") : t("Join")}
        </button>
      </div>
      {err ? (
        <p className="field-error" id="org-code-error" role="alert">
          {err}
        </p>
      ) : null}
    </form>
  );
}

function UploadForm({ orgId, onDone }: { orgId: string; onDone: () => Promise<unknown> }) {
  const { t, tf, notice } = useWorkspace();
  const uid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const busy = progress !== null;

  const check = (f: File | null): string => {
    if (!f) return t("Choose a file to upload.");
    if (!/\.(pdf|docx|txt|md|markdown)$/i.test(f.name)) return uploadError(t, { code: "document_type" });
    if (f.size > MAX_BYTES) return uploadError(t, { code: "document_too_large" });
    if (!f.size) return t("The file is empty.");
    return "";
  };

  return (
    <form
      ref={formRef}
      className="org-upload form-grid"
      aria-labelledby={uid + "-title"}
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const problem = check(file) || (url.trim() && !/^https:\/\/[^\s<>"']{4,300}$/.test(url.trim()) ? uploadError(t, { code: "org_doc_url" }) : "");
        if (problem) {
          setErr(problem);
          return;
        }
        const body = new FormData();
        body.append("file", file!);
        body.append("title", title.trim());
        body.append("source_url", url.trim());
        body.append("note", note.trim());
        setErr("");
        setProgress(0);
        try {
          const doc = await postWithProgress("/orgs/" + encodeURIComponent(orgId) + "/documents", body, setProgress);
          notice(tf("“{title}” was added. LabClear staff will review it before the chat uses it.", { title: doc.title }));
          setFile(null);
          setTitle("");
          setUrl("");
          setNote("");
          if (fileRef.current) fileRef.current.value = "";
          await onDone();
        } catch (x) {
          setErr(uploadError(t, x));
        } finally {
          setProgress(null);
        }
      }}
    >
      <h4 id={uid + "-title"}>{t("Add a document for review")}</h4>
      <div className="field">
        <label htmlFor={uid + "-file"}>{t("File")}</label>
        <span className="hint" id={uid + "-file-hint"}>
          {t("PDF with selectable text, Word (.docx), .txt or .md, up to 5 MB. Scanned images cannot be read.")}
        </span>
        <input
          ref={fileRef}
          id={uid + "-file"}
          className="input"
          type="file"
          accept={ACCEPT}
          required
          disabled={busy}
          aria-describedby={uid + "-file-hint"}
          onChange={(e) => {
            const f = e.target.files?.[0] || null;
            setFile(f);
            setErr(f ? check(f) : "");
            if (f && !title) setTitle(f.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 140));
          }}
        />
      </div>
      <div className="form-grid two">
        <div className="field">
          <label htmlFor={uid + "-name"}>{t("Title")}</label>
          <span className="hint">{t("Shown to members and in chat citations.")}</span>
          <input id={uid + "-name"} className="input" maxLength={140} value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor={uid + "-url"}>{t("Source link (optional)")}</label>
          <span className="hint">{t("Where members can read the original. Starts with https://")}</span>
          <input id={uid + "-url"} className="input" type="url" inputMode="url" maxLength={300} placeholder="https://" value={url} disabled={busy} onChange={(e) => setUrl(e.target.value)} autoComplete="off" />
        </div>
      </div>
      <div className="field">
        <label htmlFor={uid + "-note"}>{t("Note for the reviewer (optional)")}</label>
        <textarea id={uid + "-note"} className="input" maxLength={500} rows={2} value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} placeholder={t("For example: reference ranges used by our laboratory since 2026")} />
      </div>
      {busy ? (
        <div className="org-progress" role="status" aria-live="polite">
          <progress max={100} value={progress! < 100 ? progress! : undefined} aria-label={t("Upload progress")} />
          <span className="small muted">{progress! < 100 ? tf("Uploading… {n}%", { n: progress! }) : t("Reading and checking the text…")}</span>
        </div>
      ) : null}
      {err ? (
        <p className="field-error" role="alert">
          {err}
        </p>
      ) : null}
      <div className="row">
        <button type="submit" className="btn primary" disabled={busy} aria-busy={busy || undefined}>
          {busy ? t("Uploading…") : t("Upload for review")}
        </button>
      </div>
    </form>
  );
}

function DocMeta({ d }: { d: Doc }) {
  const { t, tf, lang } = useWorkspace();
  return (
    <div className="record-meta">
      <span>{fileLabel(t, d.file_type)}</span>
      <span>{tf("{n} passages", { n: d.chunks })}</span>
      {d.state === "approved" && d.reviewed_at ? <span>{tf("Reviewed {date}", { date: dayText(d.reviewed_at, lang) })}</span> : <span>{tf("Uploaded {date}", { date: dayText(d.uploaded_at, lang) })}</span>}
      {d.source_url ? (
        <a href={d.source_url} target="_blank" rel="noopener noreferrer" className="org-source">
          {t("Source")}
          <span className="sr-only"> ({t("opens in a new tab")})</span>
        </a>
      ) : null}
    </div>
  );
}

function AdminDocs({ m, reload }: { m: Membership; reload: () => Promise<unknown> }) {
  const { api, t, tf, notice } = useWorkspace();
  const confirm = useConfirm();
  const states: Record<string, [string, "warn" | "ok" | "bad"]> = {
    pending: [t("Waiting for staff review"), "warn"],
    approved: [t("Approved"), "ok"],
    rejected: [t("Not approved"), "bad"],
  };
  const docs = m.documents.slice().sort((a, b) => b.uploaded_at - a.uploaded_at);
  return (
    <div className="org-admin stack">
      <UploadForm orgId={m.org.id} onDone={reload} />
      <div className="stack-sm">
        <h4>{t("Documents and review status")}</h4>
        {!docs.length ? (
          <p className="small muted">{t("No documents yet. Upload your laboratory's reference ranges or preparation instructions to start.")}</p>
        ) : (
          <div className="record-list">
            {docs.map((d) => {
              const [label, tone] = states[d.state] || [d.state, "warn"];
              return (
                <article className="record" key={d.id}>
                  <div className="record-head">
                    <h3>{d.title}</h3>
                    <Badge tone={tone}>{label}</Badge>
                    {d.flagged ? <Badge tone="warn">{tf("{n} flagged passages", { n: d.flagged })}</Badge> : null}
                  </div>
                  <DocMeta d={d} />
                  {d.flagged ? <p className="small muted">{t("Flagged passages read like instructions to an AI. They are never used in the chat.")}</p> : null}
                  {d.review_note ? (
                    <p className="small">{d.state === "rejected" ? tf("Reason from LabClear staff: {note}", { note: d.review_note }) : tf("Note from LabClear staff: {note}", { note: d.review_note })}</p>
                  ) : null}
                  <div className="record-actions">
                    <button
                      type="button"
                      className="btn sm danger"
                      onClick={() =>
                        confirm(t("Delete document"), tf("Delete “{title}”? The chat stops citing it right away. This cannot be undone.", { title: d.title }), t("Delete document"), async () => {
                          await api.del("/orgs/" + encodeURIComponent(m.org.id) + "/documents/" + encodeURIComponent(d.id));
                          notice(t("Document deleted."));
                          await reload();
                        })
                      }
                    >
                      {t("Delete")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function OrgCard({ m, chatOrg, reload }: { m: Membership; chatOrg: string; reload: () => Promise<unknown> }) {
  const { api, t, tf, lang, notice, navigate, refresh } = useWorkspace();
  const confirm = useConfirm();
  const admin = m.role === "admin";
  const inChat = chatOrg === m.org.id;
  const approved = m.documents.filter((d) => d.state === "approved");
  const heading = "org-" + m.org.id;
  const scope = async (orgId: string) => api.post("/chat/org-scope", { org_id: orgId });
  return (
    <section className="org-card card" aria-labelledby={heading}>
      <div className="record-head">
        <h3 id={heading}>{m.org.name}</h3>
        <Badge tone="neutral">{kindLabel(t, m.org.kind)}</Badge>
        <Badge tone={admin ? "accent" : ""}>{admin ? t("Admin") : t("Member")}</Badge>
        {inChat ? <Badge tone="ok">{t("Used in your chat")}</Badge> : null}
      </div>
      <p className="small muted">{tf("Joined {date}", { date: dayText(m.joined, lang) })}</p>

      <div className="stack-sm">
        <h4>{t("Approved documents")}</h4>
        {approved.length ? (
          <>
            <p className="small">{t("Your chat cites these documents when this organization is selected.")}</p>
            <ul className="plain org-docs">
              {approved.map((d) => (
                <li key={d.id}>
                  <strong>{d.title}</strong>
                  <DocMeta d={d} />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="small muted">
            {admin ? t("No approved documents yet. Documents you upload appear here after LabClear staff approve them.") : t("No approved documents yet. Your organization's admin adds them and LabClear staff review each one.")}
          </p>
        )}
        <div className="row">
          {inChat ? (
            <>
              <button type="button" className="btn sm primary" onClick={() => navigate("chat")}>
                {t("Go to the chat")}
              </button>
              <Act
                className="btn sm ghost"
                run={async () => {
                  await scope("none");
                  notice(t("Your chat no longer cites organization documents."));
                  await reload();
                }}
              >
                {t("Stop citing in my chat")}
              </Act>
            </>
          ) : (
            <Act
              className="btn sm primary"
              run={async () => {
                await scope(m.org.id);
                await refresh().catch(() => null);
                notice(tf("Your chat now cites {name}'s approved documents.", { name: m.org.name }));
                navigate("chat");
              }}
            >
              {t("Use in my chat")}
            </Act>
          )}
        </div>
      </div>

      {admin ? <AdminDocs m={m} reload={reload} /> : null}

      <div className="org-leave">
        <button
          type="button"
          className="btn sm ghost danger"
          onClick={() =>
            confirm(t("Leave organization"), tf("Leave {name}? Your chat stops citing its documents. To come back you need a join code again.", { name: m.org.name }), t("Leave organization"), async () => {
              await api.post("/orgs/" + encodeURIComponent(m.org.id) + "/leave");
              notice(tf("You left {name}.", { name: m.org.name }));
              await reload();
            })
          }
        >
          {t("Leave organization")}
        </button>
      </div>
    </section>
  );
}

function PrivacyNote() {
  const { t } = useWorkspace();
  return (
    <aside className="org-privacy" aria-labelledby="org-privacy-title">
      <h3 id="org-privacy-title">{t("How organization documents are handled")}</h3>
      <ul>
        <li>{t("Each document is turned into text and stored encrypted. The original file is not kept.")}</li>
        <li>{t("LabClear staff review every document before the chat can use it. Passages that read like instructions to an AI are left out.")}</li>
        <li>{t("Only members' chats cite these documents, with the organization named as the source.")}</li>
        <li>{t("Document text is never sent to an outside service for embeddings. It is searched on our own server.")}</li>
      </ul>
    </aside>
  );
}

export function OrgsView() {
  const { api, t, user, requireAccount } = useWorkspace();
  const signedIn = !!user?.registered;
  const res = useLoad(() => (signedIn ? api.get<Mine>("/orgs/mine") : Promise.resolve(null)), [signedIn]);
  const reload = () => res.reload(true);

  const intro = (
    <div className="view-intro">
      <h2>{t("My organization")}</h2>
      <p>{t("If your hospital, clinic or company works with LabClear, join it with the code it gives you. The chat can then cite your organization's own reviewed documents, such as its laboratory reference ranges or preparation instructions.")}</p>
    </div>
  );

  let main: React.ReactNode;
  if (!signedIn)
    main = (
      <Empty
        title={t("Sign in to join your organization")}
        actions={
          <button type="button" className="btn primary sm" onClick={() => requireAccount(t("Sign in to join your organization with its code. Organization documents are only cited for members."))}>
            {t("Sign in or create an account")}
          </button>
        }
      >
        {t("Organizations are linked to your account, so a temporary guest chat cannot join one.")}
      </Empty>
    );
  else if (res.error) main = <LoadError error={res.error} retry={() => res.reload()} />;
  else if (!res.data) main = <Loading rows={2} />;
  else {
    const { memberships, chat_org_id } = res.data;
    main = (
      <div className="stack" aria-busy={res.loading || undefined}>
        {!memberships.length ? <JoinForm onJoined={reload} compact={false} /> : null}
        {memberships.map((m) => (
          <OrgCard key={m.org.id} m={m} chatOrg={chat_org_id} reload={reload} />
        ))}
        {memberships.length && memberships.length < 5 ? <JoinForm onJoined={reload} compact /> : null}
      </div>
    );
  }

  return (
    <div>
      {intro}
      <div className="org-layout">
        <div className="org-main">{main}</div>
        <PrivacyNote />
      </div>
    </div>
  );
}
