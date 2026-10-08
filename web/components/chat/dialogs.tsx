"use client";
/* Dialog contents used by the chat (both surfaces). Each is a small component rendered inside
   the chat's own <Dialog>; `close` comes from ModalContext. */
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { useT } from "@/lib/i18n/client";
import { useSession } from "@/lib/session";
import { ActionButton } from "@/components/workspace/ui";
import { reportImage, useObjectUrl } from "./util";
import type { DraftSample, ReportField } from "./types";

export type Modal = { title: string; node: React.ReactNode; className?: string } | null;
export const ModalContext = createContext<{ open: (title: string, node: React.ReactNode, className?: string) => void; close: () => void }>({
  open: () => {},
  close: () => {},
});
export const useModal = () => useContext(ModalContext);

/* ------------------------------------------------------------ report image */

export function ImageView({ src, name }: { src: string; name: string }) {
  const { t } = useT();
  return (
    <div className="stack">
      <img className="lightbox-img" src={src} alt={name || t("Report image")} />
      <a className="btn sm" href={src} target="_blank" rel="noopener">
        {t("Open in a new tab")}
      </a>
    </div>
  );
}

/* ------------------------------------------------------------ LabClear Plus */

export function UpgradeView({ reason, onPlan }: { reason: string; onPlan: () => void }) {
  const { t } = useT();
  const { close } = useModal();
  return (
    <div className="stack">
      <p>{t(reason)}</p>
      <p className="small muted">
        {t("LabClear Plus costs ฿355 for 30 days. It reads reports without the one-report limit, up to three pages or images at once, and shows your results over time. It does not renew by itself.")}
      </p>
      <button
        type="button"
        className="btn primary"
        onClick={() => {
          close();
          onPlan();
        }}
      >
        {t("See LabClear Plus")}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------ synthetic sample reports */

type Demo = { id: string; title: string; description: string };

export function DemoPicker({ onPick }: { onPick: (s: DraftSample) => void }) {
  const { t } = useT();
  const { close } = useModal();
  const [demos, setDemos] = useState<Demo[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    api
      .get<{ demos: Demo[] }>("/demos")
      .then((d) => alive && setDemos(d.demos))
      .catch((e) => alive && setError(t((e as Error).message)));
    return () => {
      alive = false;
    };
  }, [t]);
  return (
    <div className="stack">
      <p className="small muted">{t("Six synthetic laboratory documents for testing the reader. Their values and printed ranges are not medical reference knowledge.")}</p>
      {error ? <p className="callout bad">{error}</p> : null}
      {!demos && !error ? <div className="skeleton" aria-hidden="true" /> : null}
      <div className="demo-list">
        {(demos || []).map((d) => (
          <div className="record demo-row" key={d.id}>
            <div>
              <h3>{t(d.title)}</h3>
              <p className="small muted">{t(d.description)}</p>
            </div>
            <div className="row">
              <a className="small" href={"/api/samples/" + d.id + "/png"} target="_blank" rel="noopener">
                {t("View source image")}
              </a>
              <button
                type="button"
                className="btn sm"
                onClick={() => {
                  onPick({ id: d.id, title: t(d.title), preview: "/api/samples/" + d.id + "/png" });
                  close();
                }}
              >
                {t("Attach to my message")}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ talk to our team */

export function HandoffForm({ onSent, prefill = "" }: { onSent: () => Promise<unknown>; prefill?: string }) {
  const { t } = useT();
  const { close } = useModal();
  const { notice, fail } = useSession();
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  const [text, setText] = useState(prefill);
  return (
    <form ref={form} className="form-grid" onSubmit={(e) => e.preventDefault()}>
      <div className="field">
        <label htmlFor={id}>{t("How can our team help?")}</label>
        <textarea id={id} className="input" required maxLength={1000} rows={4} autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <p className="small muted">
        {t("Your conversation is shared with the service team and the assistant pauses until they reply or hand it back. Urgent health concerns should not wait in this queue.")}
      </p>
      <ActionButton
        className="btn primary"
        onError={fail}
        run={async () => {
          if (!form.current?.reportValidity()) return;
          await api.post("/handoffs", { summary: text.trim() });
          close();
          await onSent();
          notice(t("Your request is queued for our team."));
        }}
      >
        {t("Send to our team")}
      </ActionButton>
    </form>
  );
}

/* ------------------------------------------------------------ chats and projects */

type ChatRow = { id: string; title: string; project_id: string };
type Project = { id: string; name: string };

export function ChatEdit({ chat, projects, act }: { chat: ChatRow; projects: Project[]; act: (run: () => Promise<unknown>, done: string) => Promise<void> }) {
  const { t, tf } = useT();
  const form = useRef<HTMLFormElement>(null);
  const [title, setTitle] = useState(t(chat.title));
  const [project, setProject] = useState(chat.project_id || "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nameId = useId();
  const projId = useId();
  if (confirmDelete)
    return (
      <div className="stack">
        <p>{tf('Delete "{title}"? Its messages are removed. Reports stay in My reports.', { title: t(chat.title) })}</p>
        <div className="form-actions">
          <ActionButton className="btn danger" run={() => act(() => api.del("/chats/" + encodeURIComponent(chat.id)), t("Chat deleted."))}>
            {t("Delete chat")}
          </ActionButton>
          <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
            {t("Cancel")}
          </button>
        </div>
      </div>
    );
  return (
    <form ref={form} className="form-grid" onSubmit={(e) => e.preventDefault()}>
      <div className="field">
        <label htmlFor={nameId}>{t("Chat name")}</label>
        <input id={nameId} className="input" required maxLength={80} value={title} autoComplete="off" onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor={projId}>{t("Project")}</label>
        <select id={projId} className="input" value={project} onChange={(e) => setProject(e.target.value)}>
          <option value="">{t("No project")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="form-actions">
        <ActionButton
          className="btn primary"
          run={() => form.current?.reportValidity() && act(() => api.patch("/chats/" + encodeURIComponent(chat.id), { title: title.trim(), project_id: project }), t("Chat updated."))}
        >
          {t("Save")}
        </ActionButton>
        <button type="button" className="btn danger" onClick={() => setConfirmDelete(true)}>
          {t("Delete chat")}
        </button>
      </div>
    </form>
  );
}

export function ProjectEdit({ project, act, onCreated }: { project?: Project; act: (run: () => Promise<unknown>, done: string) => Promise<void>; onCreated: (id: string) => void }) {
  const { t } = useT();
  const form = useRef<HTMLFormElement>(null);
  const [name, setName] = useState(project?.name || "");
  const id = useId();
  return (
    <form ref={form} className="form-grid" onSubmit={(e) => e.preventDefault()}>
      <div className="field">
        <label htmlFor={id}>{t("Project name")}</label>
        <span className="hint" id={id + "-hint"}>
          {t("For example: Annual check-up 2026")}
        </span>
        <input id={id} className="input" required maxLength={60} value={name} autoComplete="off" aria-describedby={id + "-hint"} autoFocus onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="form-actions">
        <ActionButton
          className="btn primary"
          run={() =>
            form.current?.reportValidity() &&
            act(
              async () => {
                if (project) await api.patch("/projects/" + encodeURIComponent(project.id), { name: name.trim() });
                else {
                  const r = await api.post<{ project: Project }>("/projects", { name: name.trim() });
                  onCreated(r.project.id);
                }
              },
              project ? t("Project renamed.") : t("Project created. Start a chat in it from the list."),
            )
          }
        >
          {project ? t("Save") : t("Create project")}
        </ActionButton>
        {project ? (
          <ActionButton className="btn danger" run={() => act(() => api.del("/projects/" + encodeURIComponent(project.id)), t("Project deleted. Its chats moved to Chats."))}>
            {t("Delete project")}
          </ActionButton>
        ) : null}
      </div>
      {project ? <p className="tiny muted">{t("Deleting a project keeps its chats; they move to Chats.")}</p> : null}
    </form>
  );
}

/* ------------------------------------------------------------ review the values read from a report */

type ReportRow = { id: string; data: { fields: ReportField[]; warnings?: string[]; pages?: number; label?: string; collected_date?: string; critical_note?: string; confirmed?: boolean } };
const COLS = ["name", "value", "unit", "reference", "printed_flag"] as const;
const MAX_LEN: Record<(typeof COLS)[number], number> = { name: 100, value: 150, unit: 60, reference: 150, printed_flag: 25 };
const COL_LABEL: Record<(typeof COLS)[number], string> = { name: "Test", value: "Result", unit: "Unit", reference: "Reference", printed_flag: "Flag" };

function SourcePage({ reportId, page, pages }: { reportId: string; page: number; pages: number }) {
  const { tf, t } = useT();
  const { url, failed } = useObjectUrl(reportImage(reportId, page));
  if (failed) return <p className="small muted">{t("Source image unavailable. Please reopen the report.")}</p>;
  return url ? (
    <img className="report-preview" src={url} alt={tf("Source report, page {page} of {pages}, for comparison", { page, pages })} loading="lazy" />
  ) : (
    <div className="skeleton" aria-hidden="true" />
  );
}

/**
 * Compare every value with the source image, correct it, then confirm. In the chat (onConfirm)
 * the corrected rows go to /chat/report/confirm; elsewhere to /reports/confirm.
 */
export function ReportReview({ reportId, highlight = "", onConfirm, onConfirmed }: { reportId: string; highlight?: string; onConfirm?: (fields: ReportField[]) => void; onConfirmed?: () => Promise<unknown> }) {
  const { t, tf } = useT();
  const { close } = useModal();
  const { notice, fail } = useSession();
  const [r, setR] = useState<ReportRow | null>(null);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<{ key: number; init: Partial<ReportField> }[]>([]);
  const next = useRef(0);
  const form = useRef<HTMLFormElement>(null);
  const uid = useId();

  useEffect(() => {
    let alive = true;
    api
      .get<ReportRow>("/reports/" + encodeURIComponent(reportId))
      .then((row) => {
        if (!alive) return;
        setR(row);
        setRows(row.data.fields.map((f) => ({ key: next.current++, init: f })));
      })
      .catch((e) => alive && setError(t((e as Error).message)));
    return () => {
      alive = false;
    };
  }, [reportId, t]);

  useEffect(() => {
    if (!highlight || !r) return;
    const id = setTimeout(() => form.current?.querySelector("tr.highlight")?.scrollIntoView({ block: "center" }), 60);
    return () => clearTimeout(id);
  }, [highlight, r]);

  if (error) return <p className="callout bad">{error}</p>;
  if (!r) return <div className="skeleton" aria-hidden="true" />;
  const d = r.data;
  const pages = d.pages || 1;

  const values = (): ReportField[] => {
    const f = form.current!;
    return rows.map(({ key }) => Object.fromEntries(COLS.map((c) => [c, (f.elements.namedItem(`${uid}-${key}-${c}`) as HTMLInputElement)?.value || ""])) as unknown as ReportField);
  };

  return (
    <form ref={form} className="form-grid report-review" onSubmit={(e) => e.preventDefault()}>
      {d.critical_note ? <p className="callout warn">{t(d.critical_note)}</p> : null}
      <p className="small muted">{t("Compare every value with the source image. Leave missing values empty. Synthetic samples are not patient records.")}</p>
      {!onConfirm ? (
        <>
          <div className="field">
            <label htmlFor={uid + "-label"}>{t("Report label")}</label>
            <input id={uid + "-label"} name="label" className="input" maxLength={80} autoComplete="off" defaultValue={d.label && d.label !== "Unconfirmed report" ? d.label : ""} placeholder={t("For example: Annual check, September 2026")} />
          </div>
          <div className="field">
            <label htmlFor={uid + "-date"}>{t("Collection date if known")}</label>
            <input id={uid + "-date"} name="collected_date" className="input" type="date" defaultValue={d.collected_date || ""} />
          </div>
        </>
      ) : null}
      {d.warnings?.length ? <p className="callout warn small">{d.warnings.join(" · ")}</p> : null}
      <div className={pages > 1 ? "report-pages" : ""}>
        {Array.from({ length: pages }, (_, i) => (
          <SourcePage key={i} reportId={r.id} page={i + 1} pages={pages} />
        ))}
      </div>
      {!d.fields.length ? <p className="callout warn small">{t("No values could be read. Delete this report or try a clearer image.")}</p> : null}
      <div className="table-wrap">
        <table className="data report-table">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c} scope="col">
                  {t(COL_LABEL[c])}
                </th>
              ))}
              <th scope="col">{t("Edit")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, init }, i) => (
              <tr key={key} className={highlight && init.id === highlight ? "highlight flash" : undefined}>
                {COLS.map((c) => (
                  <td key={c}>
                    <input
                      type="text"
                      name={`${uid}-${key}-${c}`}
                      defaultValue={(init[c] as string) || ""}
                      maxLength={MAX_LEN[c]}
                      required={c === "name"}
                      autoComplete="off"
                      aria-label={tf("{column} for row {n}", { column: t(COL_LABEL[c]), n: i + 1 })}
                    />
                  </td>
                ))}
                <td>
                  <button type="button" className="btn sm" onClick={() => setRows((list) => list.filter((x) => x.key !== key))}>
                    {tf("Remove row {n}", { n: i + 1 })}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="btn sm"
        onClick={() => {
          if (rows.length >= 60) return notice(t("A report can contain up to 60 rows."), "bad");
          setRows((list) => [...list, { key: next.current++, init: {} }]);
        }}
      >
        {t("Add missing test row")}
      </button>
      <label className="check">
        <input type="checkbox" name="same_person" required /> {t("I checked the extracted values and confirm this report belongs to the person being discussed.")}
      </label>
      <ActionButton
        className="btn primary"
        onError={fail}
        run={async () => {
          if (!form.current?.reportValidity()) return;
          if (!rows.length) return notice(t("Keep at least one test row before confirming."), "bad");
          const fields = values();
          if (onConfirm) {
            close();
            onConfirm(fields);
            return;
          }
          const f = form.current!;
          await api.post("/reports/confirm", {
            report_id: r.id,
            fields,
            label: (f.elements.namedItem("label") as HTMLInputElement)?.value.trim() || "My report",
            collected_date: (f.elements.namedItem("collected_date") as HTMLInputElement)?.value || "",
            same_person_confirmed: true,
          });
          close();
          await onConfirmed?.();
          notice(t("Report confirmed. You can ask about it now."));
        }}
      >
        {onConfirm ? t("Confirm and explain") : t("Confirm and use report")}
      </ActionButton>
    </form>
  );
}
