"use client";
/* Channels and budget: integration modes, the project AI budget and the LINE channel simulator. */
import { useId, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { when } from "@/lib/format";
import { ActionButton, Badge, Intro } from "@/components/workspace/ui";
import { useStaff } from "../context";
import { BudgetPanel, Loaded, RefreshButton, errText, modeLabel, useLoad, type BudgetData } from "../parts";

type Outbox = { jobs: { id: string; kind: string; state: string; error_code: string; created: number }[]; deliveries: { id: string; to: string; text: string; at: number }[] };
type Modes = { modes: Record<string, { mode: string; label: string }> };

const simId = () => "Usim" + Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, "0")).join("");

export function Channels() {
  const { t } = useStaff();
  const state = useLoad(
    () =>
      Promise.all([
        api.get<Modes>("/modes"),
        api.get<BudgetData>("/staff/budget").catch((e) => ({ error: errText(e) })),
        api.get<Outbox>("/staff/line-simulator/outbox"),
      ]),
    [],
  );
  return (
    <div>
      <Intro title={t("Channels and budget")}>{t("Integration modes are decided by the server. Simulated channels run through the same adapters, queues and storage as real ones.")}</Intro>
      <Loaded state={state}>
        {([m, budget, out]) => (
          <div className="stack">
            <div className="table-wrap">
              <table className="data sd-table">
                <thead>
                  <tr>
                    <th scope="col">{t("Integration")}</th>
                    <th scope="col">{t("Mode")}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(m.modes).map(([k, x]) => (
                    <tr key={k}>
                      <td data-label={t("Integration")} className="sd-cell-title">
                        {t(x.label)}
                      </td>
                      <td data-label={t("Mode")}>
                        <Badge tone={x.mode === "LIVE_MODEL" || x.mode === "PROVIDER_SANDBOX" ? "ok" : x.mode === "UNAVAILABLE" ? "warn" : "neutral"}>{modeLabel(t, x.mode)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {"error" in budget ? (
              <section className="card stack-sm">
                <h3>{t("AI budget (project total)")}</h3>
                <p className="small">{t(budget.error)}</p>
              </section>
            ) : (
              <BudgetPanel b={budget} />
            )}
            <LineSimulator out={out} reload={state.reload} />
          </div>
        )}
      </Loaded>
    </div>
  );
}

function LineSimulator({ out, reload }: { out: Outbox; reload: () => Promise<void> }) {
  const { t, tf, lang, notice, fail } = useStaff();
  const [uid, setUid] = useState(simId);
  const [text, setText] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const idA = useId();
  const idB = useId();
  const send = async () => {
    if (!form.current?.reportValidity()) return;
    const r = await api.post<{ event_id: string }>("/staff/line-simulator/events", { line_user_id: uid, text });
    notice(tf("Queued event {id}. Run the worker to process it.", { id: r.event_id.slice(-6) }));
    setText("");
    await reload();
  };
  return (
    <section className="card stack" aria-labelledby="sd-line">
      <h3 id="sd-line">{t("LINE channel simulator")}</h3>
      <p className="small muted">{t("Sends a LINE-shaped, signed webhook event through the real verification, queue and worker. Replies are stored as simulated deliveries; nothing is sent to LINE.")}</p>
      <form
        ref={form}
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          send().catch(fail);
        }}
      >
        <div className="field">
          <label htmlFor={idA}>{t("Simulated LINE user ID")}</label>
          <input id={idA} className="input mono" pattern="Usim[0-9a-f]{8,32}" required value={uid} onChange={(e) => setUid(e.target.value)} spellCheck={false} />
        </div>
        <div className="field">
          <label htmlFor={idB}>{t("Message")}</label>
          <textarea id={idB} className="input" required maxLength={2000} autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div className="form-actions">
          <ActionButton className="btn primary sm" run={send} onError={fail}>
            {t("Send as LINE user")}
          </ActionButton>
          <ActionButton
            className="btn sm"
            onError={fail}
            run={async () => {
              const r = await api.post<{ processed?: number; failed?: number }>("/staff/line-simulator/run");
              notice(r.processed ? t("Processed one job.") : r.failed ? t("The job failed; see its error code below.") : t("No pending jobs."));
              await reload();
            }}
          >
            {t("Run worker once")}
          </ActionButton>
          <RefreshButton run={reload} />
        </div>
      </form>
      <h4>{t("Jobs")}</h4>
      <div className="table-wrap">
        <table className="data sd-table">
          <thead>
            <tr>
              <th scope="col">{t("Job")}</th>
              <th scope="col">{t("State")}</th>
              <th scope="col">{t("Error")}</th>
              <th scope="col">{t("Created")}</th>
            </tr>
          </thead>
          <tbody>
            {out.jobs.length ? (
              out.jobs
                .slice()
                .reverse()
                .map((j) => (
                  <tr key={j.id}>
                    <td data-label={t("Job")} className="mono">
                      {j.kind} …{j.id.slice(-6)}
                    </td>
                    <td data-label={t("State")}>{t(j.state)}</td>
                    <td data-label={t("Error")}>{j.error_code || t("None")}</td>
                    <td data-label={t("Created")}>{when(j.created, lang)}</td>
                  </tr>
                ))
            ) : (
              <tr>
                <td colSpan={4} className="muted">
                  {t("No LINE jobs yet.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <h4>{t("Simulated deliveries")}</h4>
      {out.deliveries.length ? (
        <div className="record-list">
          {out.deliveries
            .slice()
            .reverse()
            .map((x) => (
              <article key={x.id} className="notice-item">
                <strong className="mono">{tf("To {who}", { who: x.to })}</strong>
                <span className="small">{x.text}</span>
                <time>{when(x.at, lang)}</time>
              </article>
            ))}
        </div>
      ) : (
        <p className="small muted">{t("No simulated deliveries yet.")}</p>
      )}
    </section>
  );
}
