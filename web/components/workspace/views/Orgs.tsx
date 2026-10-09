"use client";
/*
 * My organization — the Claude 4.0.0 view, adapted in integration 4.0 to the Codex contract
 * (routers/organization_sources.py, services/organization_sources.py):
 * - membership is assigned by a LabClear manager (reader or editor); there are no join codes;
 * - editors upload UTF-8 .txt/.md files of at most 256 KiB as drafts, then approve, reject,
 *   revoke, delete or upload a new version; readers see approved documents only;
 * - search returns source excerpts, never an AI answer;
 * - the assistant receives approved excerpts only when the owner turns on
 *   ORG_REFERENCE_INFERENCE_ENABLED, and a revoked document never reaches a later answer.
 * The layout, cards, upload progress and privacy aside are Claude's original design.
 */
import { useId, useRef, useState } from "react";
import type { T } from "@/lib/i18n/shared";
import { api as apiClient } from "@/lib/api/client";
import { loadFeatures, type Features, type Membership } from "@/components/chat/ContextChips";
import { useWorkspace } from "../context";
import { Badge, Empty } from "../ui";
import { Act, dayText, errorText, LoadError, Loading, useConfirm, useLoad } from "./shared";

type DocState = "draft" | "approved" | "rejected" | "revoked" | "deleted";
type Doc = { id: string; state: DocState; title: string; version: number; sha256: string; reviewed_at: number | null };
type Listing = { can_edit: boolean; documents: Doc[] };
type Preview = Doc & { text?: string; filename?: string; uploaded_at?: number; previous_id?: string | null };
type Excerpt = { id: string; version: number; title: string; section: string; content: string; url: string };
type Loaded = { features: Features | null; listing: Listing | null; problem: "" | "disabled" | "no_membership" };

const MAX_BYTES = 256 * 1024;
const ACCEPT = ".txt,.md,text/plain,text/markdown";
const BASE = "/organization-documents";

/** Clear messages for every error code in services/organization_sources.py. */
function uploadError(t: T, e: unknown): string {
  const code = (e as { code?: string })?.code || "";
  const messages: Record<string, string> = {
    file_size: t("Use a non-empty file of at most 256 KB."),
    file_type: t("Use a UTF-8 .txt or .md file. PDF, Word and scanned images are not supported here."),
    file_encoding: t("Save the document as UTF-8 text, then upload it again."),
    file_content: t("The file is not plain text. Copy the text into a .txt or .md file."),
    duplicate_source: t("This file already exists in your organization."),
    source_limit: t("Your organization has reached 100 documents. Delete one you no longer need first."),
    version_conflict: t("The approved version changed meanwhile. Upload the new version against the current approved one."),
    source_state: t("This document cannot make that change in its current state."),
    forbidden: t("Only an organization editor can add or review documents. Ask a LabClear manager for editor access."),
  };
  return messages[code] || errorText(t, e);
}

/** multipart POST with upload progress (fetch cannot report it). Same headers as the api client. */
function postWithProgress(path: string, body: FormData, onProgress: (pct: number) => void): Promise<{ id: string; state: DocState; version: number }> {
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
        return reject(Object.assign(new Error("The server response could not be read."), { code: xhr.status === 413 ? "file_size" : "bad_response", status: xhr.status }));
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

function stateLabel(t: T): Record<DocState, [string, "" | "ok" | "warn" | "bad" | "neutral"]> {
  return {
    draft: [t("Draft, waiting for an editor's review"), "warn"],
    approved: [t("Approved"), "ok"],
    rejected: [t("Not approved"), "bad"],
    revoked: [t("Revoked"), "neutral"],
    deleted: [t("Deleted"), "neutral"],
  };
}

function UploadForm({ replacing, onDone, onCancel }: { replacing: Doc | null; onDone: () => Promise<unknown>; onCancel: () => void }) {
  const { t, tf, notice } = useWorkspace();
  const uid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState(replacing?.title || "");
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const busy = progress !== null;

  const check = (f: File | null): string => {
    if (!f) return t("Choose a file to upload.");
    if (!/\.(txt|md)$/i.test(f.name)) return uploadError(t, { code: "file_type" });
    if (!f.size || f.size > MAX_BYTES) return uploadError(t, { code: "file_size" });
    return "";
  };

  return (
    <form
      className="org-upload form-grid"
      aria-labelledby={uid + "-title"}
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const problem = check(file) || (!title.trim() ? t("Enter a title.") : "");
        if (problem) {
          setErr(problem);
          return;
        }
        const body = new FormData();
        body.append("file", file!);
        body.append("title", title.trim());
        body.append("previous_id", replacing?.id || "");
        setErr("");
        setProgress(0);
        try {
          const doc = await postWithProgress(BASE, body, setProgress);
          notice(tf("Version {n} was saved as a draft. Review and approve it before members can use it.", { n: doc.version }));
          setFile(null);
          setTitle("");
          if (fileRef.current) fileRef.current.value = "";
          await onDone();
        } catch (x) {
          setErr(uploadError(t, x));
        } finally {
          setProgress(null);
        }
      }}
    >
      <h4 id={uid + "-title"}>{replacing ? tf("New version of “{title}”", { title: replacing.title }) : t("Add a document")}</h4>
      <div className="field">
        <label htmlFor={uid + "-file"}>{t("File")}</label>
        <span className="hint" id={uid + "-file-hint"}>
          {t("UTF-8 .txt or .md, up to 256 KB. Use synthetic or approved text only.")}
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
            if (f && !title) setTitle(f.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 160));
          }}
        />
      </div>
      <div className="field">
        <label htmlFor={uid + "-name"}>{t("Title")}</label>
        <span className="hint">{t("Shown to members and in chat citations.")}</span>
        <input id={uid + "-name"} className="input" maxLength={160} required value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} autoComplete="off" />
      </div>
      {busy ? (
        <div className="org-progress" role="status" aria-live="polite">
          <progress max={100} value={progress! < 100 ? progress! : undefined} aria-label={t("Upload progress")} />
          <span className="small muted">{progress! < 100 ? tf("Uploading… {n}%", { n: progress! }) : t("Checking the text…")}</span>
        </div>
      ) : null}
      {err ? (
        <p className="field-error" role="alert">
          {err}
        </p>
      ) : null}
      <div className="row">
        <button type="submit" className="btn primary" disabled={busy} aria-busy={busy || undefined}>
          {busy ? t("Uploading…") : replacing ? t("Upload new version") : t("Upload as draft")}
        </button>
        {replacing ? (
          <button type="button" className="btn ghost" disabled={busy} onClick={onCancel}>
            {t("Cancel")}
          </button>
        ) : null}
      </div>
    </form>
  );
}

function PreviewBody({ id }: { id: string }) {
  const { api, t, tf, lang } = useWorkspace();
  const res = useLoad(() => api.get<Preview>(BASE + "/" + encodeURIComponent(id)), [id]);
  if (res.error) return <LoadError error={res.error} retry={() => res.reload()} />;
  if (!res.data) return <Loading rows={3} />;
  const d = res.data;
  return (
    <div className="stack-sm">
      <p className="small muted">
        {tf("Version {n}", { n: d.version })}
        {d.uploaded_at ? " · " + tf("Uploaded {date}", { date: dayText(d.uploaded_at, lang) }) : ""} · SHA-256 <span className="mono">{d.sha256.slice(0, 12)}…</span>
      </p>
      <pre className="org-preview" tabIndex={0} aria-label={t("Document text")}>
        {d.text || ""}
      </pre>
    </div>
  );
}

function DocRow({ d, editor, reload, onNewVersion }: { d: Doc; editor: boolean; reload: () => Promise<unknown>; onNewVersion: (d: Doc) => void }) {
  const { api, t, tf, lang, notice, modal } = useWorkspace();
  const confirm = useConfirm();
  const [label, tone] = stateLabel(t)[d.state] || [d.state, "warn"];
  const act = (action: "approve" | "reject" | "revoke" | "delete", done: string) => async () => {
    await api.post(BASE + "/" + encodeURIComponent(d.id) + "/" + action);
    notice(done);
    await reload();
  };
  return (
    <article className="record" key={d.id}>
      <div className="record-head">
        <h3>{d.title}</h3>
        <Badge tone={tone}>{label}</Badge>
        <Badge tone="neutral">{tf("Version {n}", { n: d.version })}</Badge>
      </div>
      <div className="record-meta">
        {d.reviewed_at ? <span>{tf("Reviewed {date}", { date: dayText(d.reviewed_at, lang) })}</span> : <span>{t("Not reviewed yet")}</span>}
        <span className="mono">{d.sha256.slice(0, 12)}…</span>
        {d.state === "approved" ? (
          <a href={"/api/business" + BASE + "/" + encodeURIComponent(d.id) + "/download"} download className="org-source">
            {t("Download text")}
          </a>
        ) : null}
      </div>
      {editor ? (
        <div className="record-actions">
          {d.state !== "revoked" ? (
            <button type="button" className="btn sm" onClick={() => modal(d.title, <PreviewBody id={d.id} />)}>
              {t("Preview")}
            </button>
          ) : null}
          {d.state === "draft" ? (
            <>
              <Act className="btn sm primary" run={act("approve", t("Approved. Members can now see this version."))}>
                {t("Approve")}
              </Act>
              <Act className="btn sm" run={act("reject", t("Marked as not approved."))}>
                {t("Reject")}
              </Act>
            </>
          ) : null}
          {d.state === "approved" ? (
            <>
              <button type="button" className="btn sm" onClick={() => onNewVersion(d)}>
                {t("Upload new version")}
              </button>
              <button
                type="button"
                className="btn sm"
                onClick={() =>
                  confirm(t("Revoke document"), tf("Revoke “{title}”? Members stop seeing it and later answers can no longer use it.", { title: d.title }), t("Revoke"), act("revoke", t("Revoked.")))
                }
              >
                {t("Revoke")}
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="btn sm danger"
            onClick={() =>
              confirm(t("Delete document"), tf("Delete “{title}”? Its text is removed from the store. This cannot be undone.", { title: d.title }), t("Delete document"), act("delete", t("Document deleted.")))
            }
          >
            {t("Delete")}
          </button>
        </div>
      ) : null}
    </article>
  );
}

function SearchBox() {
  const { api, t, tf, fail } = useWorkspace();
  const uid = useId();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<Excerpt[] | null>(null);
  return (
    <section className="card stack-sm" aria-labelledby={uid + "-h"}>
      <h3 id={uid + "-h"}>{t("Search approved documents")}</h3>
      <form
        className="org-join-row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!q.trim() || busy) return;
          setBusy(true);
          try {
            setFound((await api.post<{ sources: Excerpt[] }>(BASE + "/search", { q: q.trim() })).sources);
          } catch (x) {
            fail(x);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="field">
          <label htmlFor={uid + "-q"}>{t("Words to find")}</label>
          <input id={uid + "-q"} className="input" maxLength={500} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        </div>
        <button type="submit" className="btn primary" disabled={busy || !q.trim()} aria-busy={busy || undefined}>
          {t("Search")}
        </button>
      </form>
      {found ? (
        found.length ? (
          <div className="stack-sm" aria-live="polite">
            <p className="tiny muted">{t("Text from the source document — not an answer from AI.")}</p>
            <ul className="plain org-docs">
              {found.map((x, i) => (
                <li key={x.id + i}>
                  <strong>{x.title}</strong>
                  <div className="record-meta">
                    <span>{tf("Version {n}", { n: x.version })}</span>
                    <span>{x.section}</span>
                  </div>
                  <blockquote className="org-excerpt">{x.content}</blockquote>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="small muted" aria-live="polite">
            {t("No approved document contains these words.")}
          </p>
        )
      ) : null}
    </section>
  );
}

function PrivacyNote({ features }: { features: Features | null }) {
  const { t } = useWorkspace();
  return (
    <aside className="org-privacy" aria-labelledby="org-privacy-title">
      <h3 id="org-privacy-title">{t("How organization documents are handled")}</h3>
      <ul>
        <li>{t("Documents are stored encrypted and are visible only to members of the same organization.")}</li>
        <li>{t("An organization editor reviews every draft. Members see approved versions only.")}</li>
        <li>{t("Revoking or deleting a document stops later answers from using it.")}</li>
        <li>
          {features?.org_reference_inference
            ? t("The assistant may cite approved excerpts in members' chats, with the document named as the source.")
            : t("The assistant does not use these documents yet; members can search them here.")}
        </li>
        <li>{t("Your own lab reports are never shared with the organization.")}</li>
      </ul>
    </aside>
  );
}

export function OrgsView() {
  const { api, t, tf, user, requireAccount } = useWorkspace();
  const signedIn = !!user?.registered;
  const [replacing, setReplacing] = useState<Doc | null>(null);
  // A fresh form after each upload, so the emptied required fields do not show as errors.
  const [uploads, setUploads] = useState(0);
  const res = useLoad<Loaded | null>(async () => {
    if (!signedIn) return null;
    const features = await loadFeatures();
    if (features && !features.org_documents) return { features, listing: null, problem: "disabled" };
    const m = await api.get<Membership>("/site/membership");
    if (!m.enabled) return { features, listing: null, problem: "disabled" };
    if (!m.member) return { features, listing: null, problem: "no_membership" };
    try {
      return { features, listing: await api.get<Listing>(BASE), problem: "" };
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "feature_disabled") return { features, listing: null, problem: "disabled" };
      if (code === "forbidden") return { features, listing: null, problem: "no_membership" };
      throw e;
    }
  }, [signedIn]);
  const reload = () => res.reload(true);

  const intro = (
    <div className="view-intro">
      <h2>{t("My organization")}</h2>
      <p>{t("If your hospital, clinic or company works with LabClear, a LabClear manager adds your account to it. Members can then read and search the organization's own approved documents, such as its laboratory reference ranges or preparation instructions.")}</p>
    </div>
  );

  let main: React.ReactNode;
  if (!signedIn)
    main = (
      <Empty
        title={t("Sign in to see your organization")}
        actions={
          <button type="button" className="btn primary sm" onClick={() => requireAccount(t("Organization documents are only shown to signed-in members."))}>
            {t("Sign in or create an account")}
          </button>
        }
      >
        {t("Organizations are linked to your account, so a temporary guest chat cannot use one.")}
      </Empty>
    );
  else if (res.error) main = <LoadError error={res.error} retry={() => res.reload()} />;
  else if (!res.data) main = <Loading rows={2} />;
  else if (res.data.problem === "disabled")
    main = <Empty title={t("Organization documents are not switched on")}>{t("The service owner has not turned on organization documents for this deployment.")}</Empty>;
  else if (res.data.problem === "no_membership")
    main = (
      <Empty title={t("You are not in an organization yet")}>
        {t("A LabClear manager adds members to an organization as a reader or an editor. Ask your organization's contact to arrange it.")}{" "}
        {tf("Your account ID: {id}", { id: user?.id || "" })}
      </Empty>
    );
  else {
    const { can_edit, documents } = res.data.listing!;
    const docs = documents.filter((d) => d.state !== "deleted").slice().sort((a, b) => (a.state === "approved" ? -1 : 0) - (b.state === "approved" ? -1 : 0));
    main = (
      <div className="stack" aria-busy={res.loading || undefined}>
        <section className="org-card card" aria-labelledby="org-docs-h">
          <div className="record-head">
            <h3 id="org-docs-h">{t("Your organization")}</h3>
            <Badge tone={can_edit ? "accent" : ""}>{can_edit ? t("Editor") : t("Reader")}</Badge>
            {res.data.features?.org_reference_inference ? <Badge tone="ok">{t("Used by the assistant")}</Badge> : <Badge tone="neutral">{t("Search only")}</Badge>}
          </div>
          {docs.length ? (
            <div className="record-list">
              {docs.map((d) => (
                <DocRow key={d.id} d={d} editor={can_edit} reload={reload} onNewVersion={setReplacing} />
              ))}
            </div>
          ) : (
            <p className="small muted">{can_edit ? t("No documents yet. Upload a synthetic or approved text document to start.") : t("No approved documents yet. Your organization's editor adds and reviews them.")}</p>
          )}
          {can_edit ? (
            <div className="org-admin stack">
              <UploadForm key={(replacing?.id || "new") + ":" + uploads} replacing={replacing} onCancel={() => setReplacing(null)} onDone={async () => {
                setReplacing(null);
                setUploads((n) => n + 1);
                await reload();
              }} />
            </div>
          ) : null}
        </section>
        <SearchBox />
      </div>
    );
  }

  return (
    <div>
      {intro}
      <div className="org-layout">
        <div className="org-main">{main}</div>
        <PrivacyNote features={res.data?.features || null} />
      </div>
    </div>
  );
}
