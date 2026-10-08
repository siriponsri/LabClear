"use client";
/* My reports: upload (Free: one image, Plus: up to three files), synthetic samples, field review
   against the source image, confirmation, selection for the chat, comparison and deletion. */
import { useEffect, useRef, useState } from "react";
import { longDate } from "@/lib/format";
import { useWorkspace, type WorkspaceState } from "../context";
import { Badge, Empty, Field } from "../ui";
import { Act, errorText, freshState, LoadError, Loading, planOf, PlanStrip, useConfirm, useLoad, useUpgrade } from "./shared";

type Row = { key: number; id?: string; name: string; value: string; unit: string; reference: string; printed_flag: string };
type ReportRecord = { id: string; data: any };
const COLS: { k: keyof Omit<Row, "key" | "id">; label: string; max: number }[] = [
  { k: "name", label: "Test", max: 100 },
  { k: "value", label: "Result", max: 150 },
  { k: "unit", label: "Unit", max: 60 },
  { k: "reference", label: "Reference", max: 150 },
  { k: "printed_flag", label: "Flag", max: 25 },
];

/** Source page images (fetched with the session or guest header, shown as blob URLs). */
function SourcePages({ id, pages }: { id: string; pages: number }) {
  const { api, t, tf } = useWorkspace();
  const [urls, setUrls] = useState<(string | null)[]>([]);
  useEffect(() => {
    let alive = true;
    const made: string[] = [];
    Promise.all(
      Array.from({ length: pages }, (_, i) =>
        api
          .objectUrl("/reports/" + encodeURIComponent(id) + "/source?page=" + (i + 1))
          .then((u) => (made.push(u), u))
          .catch(() => null),
      ),
    ).then((list) => alive && setUrls(list));
    return () => {
      alive = false;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [api, id, pages]);
  return (
    <div className={pages > 1 ? "report-pages" : ""}>
      {Array.from({ length: pages }, (_, i) =>
        urls[i] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} className="report-preview" src={urls[i]!} alt={tf("Source report, page {n} of {total}, for comparison", { n: i + 1, total: pages })} />
        ) : urls.length ? (
          <p key={i} className="callout small">
            {t("Source image unavailable. Please reopen the report.")}
          </p>
        ) : (
          <div key={i} className="skeleton report-skeleton" aria-hidden="true" />
        ),
      )}
    </div>
  );
}

/** Review and confirm the values read from a report (the same dialog for uploads and samples). */
export function ReviewReport({ report, highlight = "" }: { report: ReportRecord; highlight?: string }) {
  const { api, t, tf, notice, fail, closeModal, refresh, navigate } = useWorkspace();
  const d = report.data;
  const seq = useRef(0);
  const [rows, setRows] = useState<Row[]>(() => (d.fields || []).map((f: any) => ({ key: seq.current++, id: f.id, name: f.name || "", value: f.value || "", unit: f.unit || "", reference: f.reference || "", printed_flag: f.printed_flag || "" })));
  const [label, setLabel] = useState(d.label && d.label !== "Unconfirmed report" ? d.label : "");
  const [date, setDate] = useState(d.collected_date || "");
  const [same, setSame] = useState(false);
  const [err, setErr] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const edit = (key: number, k: string, v: string) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [k]: v } : r)));

  return (
    <form ref={form} className="form-grid" onSubmit={(e) => e.preventDefault()}>
      {d.critical_note ? <p className="callout warn">{d.critical_note}</p> : null}
      <p className="small muted">{t("Compare every value with the source image. Leave missing values empty. Synthetic samples are not patient records.")}</p>
      <div className="form-grid two">
        <Field label={t("Report label")} hint={t("For example: Annual check, September 2026")} id="rv-label">
          <input id="rv-label" className="input" maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} autoComplete="off" />
        </Field>
        <Field label={t("Collection date if known")} id="rv-date">
          <input id="rv-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      {d.warnings?.length ? <p className="callout warn small">{d.warnings.join(" · ")}</p> : null}
      <SourcePages id={report.id} pages={d.pages || 1} />
      {!rows.length ? <p className="callout warn small">{t("No values could be read. Delete this report or try a clearer image.")}</p> : null}
      <div className="table-wrap">
        <table className="data report-table">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.k} scope="col">
                  {t(c.label)}
                </th>
              ))}
              <th scope="col">
                <span className="sr-only">{t("Edit")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className={highlight && r.id === highlight ? "highlight" : undefined}>
                {COLS.map((c) => (
                  <td key={c.k}>
                    <input
                      type="text"
                      value={r[c.k]}
                      maxLength={c.max}
                      required={c.k === "name"}
                      aria-label={tf("{field} for row {n}", { field: t(c.label), n: i + 1 })}
                      onChange={(e) => edit(r.key, c.k, e.target.value)}
                      autoComplete="off"
                    />
                  </td>
                ))}
                <td>
                  <button type="button" className="btn sm ghost" aria-label={tf("Remove row {n}", { n: i + 1 })} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                    {t("Remove")}
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
          setRows((rs) => [...rs, { key: seq.current++, name: "", value: "", unit: "", reference: "", printed_flag: "" }]);
        }}
      >
        {t("Add missing test row")}
      </button>
      <label className="check">
        <input type="checkbox" required checked={same} onChange={(e) => setSame(e.target.checked)} />
        <span>{t("I checked the extracted values and confirm this report belongs to the person being discussed.")}</span>
      </label>
      {err ? (
        <p className="field-error" role="alert">
          {err}
        </p>
      ) : null}
      <Act
        className="btn primary"
        onError={fail}
        run={async () => {
          setErr("");
          if (!form.current?.reportValidity()) return;
          if (!rows.length) return setErr(t("Keep at least one test row before confirming."));
          const fields = rows.map(({ name, value, unit, reference, printed_flag }) => ({ name, value, unit, reference, printed_flag }));
          await api.post("/reports/confirm", { report_id: report.id, fields, label: label.trim() || "My report", collected_date: date, same_person_confirmed: same });
          closeModal();
          await refresh().catch(() => null);
          navigate("chat");
          notice(t("Report confirmed. You can ask about it now."));
        }}
      >
        {t("Confirm and use report")}
      </Act>
    </form>
  );
}

/** Six synthetic laboratory documents to try the reader without a real report. */
function DemoPicker() {
  const { api, t, modal, notice } = useWorkspace();
  const demos = useLoad(() => api.get<{ demos: { id: string; title: string; description: string }[] }>("/demos"));
  if (demos.error) return <LoadError error={demos.error} retry={() => demos.reload()} />;
  if (!demos.data) return <Loading rows={2} />;
  return (
    <div className="stack">
      <p className="small muted">{t("Six synthetic laboratory documents for testing the reader. Their values and printed ranges are not medical reference knowledge.")}</p>
      <div className="record-list">
        {demos.data.demos.map((x) => (
          <div className="record" key={x.id}>
            <h3>{t(x.title)}</h3>
            <p className="small muted">{t(x.description)}</p>
            <div className="record-actions">
              <a className="btn sm ghost" href={"/api/samples/" + encodeURIComponent(x.id) + "/png"} target="_blank" rel="noopener noreferrer">
                {t("View source image")}
              </a>
              <Act
                className="btn sm"
                run={async () => {
                  notice(t("Reading the document. This uses the configured OCR provider."));
                  const r = await api.post("/demos/" + encodeURIComponent(x.id) + "/read");
                  modal(t("Review report fields"), <ReviewReport report={r} />);
                }}
              >
                {t("Read this sample")}
              </Act>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Hidden file input + upload flow shared by My reports and the lab dashboard. */
export function useReportUpload() {
  const { api, t, tf, state, modal, refresh, fail } = useWorkspace();
  const upgrade = useUpgrade();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const plan = planOf(state);
  const limit = plan.images_per_read || 1;

  const open = () => {
    if (!plan.can_read) return upgrade(t("Your free AI report reading has been used. Synthetic samples stay free."));
    input.current?.click();
  };
  const demos = () => modal(t("Try a sample report"), <DemoPicker />);

  const picked = async (list: FileList | null) => {
    const files = [...(list || [])];
    if (input.current) input.current.value = "";
    if (!files.length) return;
    if (files.length > limit)
      return upgrade(limit === 1 ? t("The Free plan reads one image at a time. LabClear Plus reads up to three pages or images together.") : t("Choose up to three files."));
    if (files.some((f) => f.size > 3 * 1024 * 1024)) return fail(new Error(t("Choose files under 3 MB each.")));
    if (files.some((f) => !/\.(pdf|png|jpe?g)$/i.test(f.name))) return fail(new Error(t("Use PDF, PNG or JPEG files.")));
    const body = new FormData();
    files.forEach((f) => body.append("files", f));
    setBusy(files.length > 1 ? tf("Reading {n} files together. Please wait…", { n: files.length }) : t("Reading your document. Please wait…"));
    try {
      const r = await api.post("/reports/read", body);
      await refresh().catch(() => null);
      modal(t("Review report fields"), <ReviewReport report={r} />);
    } catch (e) {
      if ((e as { code?: string }).code === "subscription_required") upgrade(errorText(t, e));
      else fail(e);
    } finally {
      setBusy("");
    }
  };

  const element = (
    <input ref={input} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" multiple={limit > 1} hidden onChange={(e) => picked(e.target.files)} />
  );
  return { element, open, demos, busy, limit };
}

function ReportItem({ r, s, reload }: { r: WorkspaceState["reports"][number]; s: WorkspaceState; reload: () => Promise<unknown> }) {
  const { api, t, lang, user, notice, modal, refresh, navigate, requireAccount } = useWorkspace();
  const confirm = useConfirm();
  const inUse = s.conversation.report_id === r.id;
  const previous = s.conversation.compare_report_id === r.id;
  return (
    <article className="record">
      <div className="record-head">
        <h3>{["Unconfirmed report", "My report", "Report"].includes(r.label) ? t(r.label) : r.label}</h3>
        {r.confirmed ? <Badge tone="ok">{t("Confirmed")}</Badge> : <Badge tone="warn">{t("Needs review")}</Badge>}
        {inUse ? <Badge tone="accent">{t("In use")}</Badge> : null}
        {previous ? <Badge tone="neutral">{t("Previous report")}</Badge> : null}
      </div>
      <p className="small muted">
        {(r.date ? longDate(r.date, lang) : t("Collection date not entered")) + (r.pages > 1 ? " · " + r.pages + " " + t("pages") : "") + (r.sample ? " · " + t("Synthetic sample") : "")}
      </p>
      <div className="record-actions">
        {r.confirmed ? (
          user?.registered ? (
            <a className="btn sm primary" href={"/lab-report/" + encodeURIComponent(r.id)}>
              {t("Lab Report")}
            </a>
          ) : (
            <button type="button" className="btn sm" onClick={() => requireAccount(t("Printable reports need an account. You can review the temporary values here; signing in discards this report."))}>
              {t("Lab Report")}
            </button>
          )
        ) : null}
        <Act
          className={"btn sm" + (r.confirmed ? "" : " primary")}
          run={async () => modal(t("Review report fields"), <ReviewReport report={await api.get("/reports/" + encodeURIComponent(r.id))} />)}
        >
          {r.confirmed ? t("View fields") : t("Review fields")}
        </Act>
        {r.confirmed ? (
          <>
            <Act
              className="btn sm"
              disabled={inUse}
              run={async () => {
                await api.post("/reports/select", { report_id: r.id });
                await refresh().catch(() => null);
                navigate("chat");
                notice(t("Report selected. Ask about it now."));
              }}
            >
              {t("Use in conversation")}
            </Act>
            <Act
              className="btn sm"
              disabled={previous}
              run={async () => {
                await api.post("/reports/compare", { report_id: r.id });
                notice(t("Previous report selected for comparison."));
                await reload();
              }}
            >
              {t("Use as previous report")}
            </Act>
          </>
        ) : null}
        <button
          type="button"
          className="btn sm danger"
          onClick={() =>
            confirm(t("Delete report"), t("This removes the report and clears conversation history so its values cannot reappear. This cannot be undone."), t("Delete report and history"), async () => {
              await api.del("/reports/" + encodeURIComponent(r.id));
              notice(t("Report deleted."));
              await reload();
            })
          }
        >
          {t("Delete")}
        </button>
      </div>
    </article>
  );
}

export function ReportsView() {
  const { api, t, refresh, notice } = useWorkspace();
  const res = useLoad(() => freshState(refresh));
  const upload = useReportUpload();
  const reload = () => res.reload(true);
  const intro = (
    <div className="view-intro">
      <h2>{t("My reports")}</h2>
      <p>{t("Check every extracted value before it is used. Choose a previous report for comparison only when it belongs to the same person.")}</p>
    </div>
  );
  if (res.error) return (<div>{intro}<LoadError error={res.error} retry={() => res.reload()} /></div>);
  if (!res.data) return (<div>{intro}<Loading rows={3} /></div>);
  const s = res.data;
  const hasContext = !!(s.conversation.report_id || s.conversation.compare_report_id);
  return (
    <div>
      {intro}
      <PlanStrip />
      {upload.element}
      <div className="toolbar">
        <button type="button" className="btn primary sm" onClick={upload.open} disabled={!!upload.busy}>
          {upload.limit > 1 ? t("Add a report (up to 3 files)") : t("Add a report")}
        </button>
        <button type="button" className="btn sm" onClick={upload.demos}>
          {t("Try a synthetic sample")}
        </button>
        <Act
          className="btn ghost sm"
          disabled={!hasContext}
          run={async () => {
            await api.post("/reports/select", { report_id: "" });
            await api.post("/reports/compare", { report_id: "" });
            notice(t("Report context cleared."));
            await reload();
          }}
        >
          {t("Clear report context")}
        </Act>
      </div>
      <p className="small views-busy" role="status" aria-live="polite">
        {upload.busy}
      </p>
      {!s.reports.length ? (
        <Empty title={t("No reports yet")}>{t("Upload a JPEG, PNG or PDF up to 3 MB, or read one of the synthetic samples.")}</Empty>
      ) : (
        <div className="record-list" aria-busy={res.loading || undefined}>
          {s.reports
            .slice()
            .reverse()
            .map((r) => (
              <ReportItem key={r.id} r={r} s={s} reload={reload} />
            ))}
        </div>
      )}
    </div>
  );
}
