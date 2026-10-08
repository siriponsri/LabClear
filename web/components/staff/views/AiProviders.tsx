"use client";
/* AI providers (manager): what every AI step uses, the project budget, readiness without AI calls,
   the 4.0.0 fast OpenRouter set, and per-step provider forms. Keys are never shown back. */
import { useId, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import type { T } from "@/lib/i18n/shared";
import { ActionButton, Badge, Intro } from "@/components/workspace/ui";
import { useStaff } from "../context";
import { BudgetPanel, Icon, Kv, Loaded, errText, useLoad, type BudgetData } from "../parts";

type Kind = "llm" | "vision" | "guard" | "embedding";
type SlotView = {
  label: string;
  source: "environment" | "app" | "shared" | "shared_key";
  preset: string;
  provider_label: string;
  model: string;
  base_url: string;
  enabled: boolean;
  key: string;
  ready: boolean;
  price_in: number | null;
  price_out: number | null;
  priced: boolean;
  slot?: string;
  help?: string;
};
type Preset = { id: string; label: string; slots: string[]; default_model: string; vision_model: string; price_in: number; price_out: number; key_url: string };
type AiView = { slots: Record<Kind, SlotView>; agents: Record<string, SlotView & { slot: string; help: string }>; presets: Preset[]; network_enabled: boolean };
type Readiness = {
  ready: boolean;
  issues: string[];
  required_calls: number;
  calls: { cycle?: string | null; used?: number; limit?: number; remaining?: number };
  slots: Record<string, { model: string; provider: string; ready: boolean; priced: boolean; source: string }>;
  retrieval: { ready: boolean; mode: string; reason?: string; building?: boolean; model?: string; dimensions?: number; records?: number; built_at?: number | string; enabled?: boolean };
  note: string;
};

/** The 4.0.0 default: one team OpenRouter key for every step. */
const FAST: Record<string, string> = {
  agent_plan: "qwen/qwen3-30b-a3b-instruct-2507",
  agent_advisor: "google/gemini-3.1-flash-lite",
  agent_explainer: "google/gemini-3.1-flash-lite",
  agent_review: "openai/gpt-4.1-mini",
  guard: "openai/gpt-4.1-mini",
  vision: "google/gemini-3.1-flash-lite",
  embedding: "qwen/qwen3-embedding-8b",
};

const slotLabel = (t: T, slot: string) =>
  ({
    llm: t("Language model"),
    guard: t("Safety check"),
    vision: t("Report reading (OCR)"),
    embedding: t("Knowledge retrieval"),
    agent_plan: t("Planner"),
    agent_advisor: t("Health-check Advisor"),
    agent_explainer: t("Report Explainer"),
    agent_review: t("Reviewer"),
  })[slot] || slot;

const sourceLabel = (t: T, s: string) =>
  ({ environment: t("Server environment"), app: t("Saved here"), shared: t("Shared language model"), shared_key: t("Shared OpenRouter key") })[s] || s;

function issueText(t: T, tf: (s: string, v: Record<string, string | number>) => string, issue: string, required: number) {
  const [code, slot] = issue.split(":");
  switch (code) {
    case "offline":
      return t("AI calls are switched off on this server (PROVIDER_NETWORK_ENABLED is not true).");
    case "cycle_required":
      return t("Set PROVIDER_BUDGET_CYCLE_ID and CLOUD_CALL_LIMIT to allow AI calls.");
    case "provider_not_configured":
      return tf("{step}: no API key, model or endpoint yet.", { step: slotLabel(t, slot) });
    case "price_unknown":
      return tf("{step}: no price, so the budget cannot be enforced.", { step: slotLabel(t, slot) });
    case "call_limit_insufficient":
      return tf("Fewer calls are left in this cycle than one evaluation round needs ({n}).", { n: required });
    case "storage_unavailable":
      return t("The budget ledger is unavailable.");
    case "budget_prior_unknown":
      return t("Spending before this ledger is not set, so paid AI calls are blocked.");
    case "budget_exhausted":
      return t("The project budget is used up.");
    case "embedding_index_unavailable":
      return t("The knowledge index is not built yet, so retrieval uses keyword search only.");
    default:
      return issue;
  }
}

export function AiProviders() {
  const { t, tf, confirm, notice } = useStaff();
  const state = useLoad(
    () =>
      Promise.all([
        api.get<AiView>("/staff/ai-providers"),
        api.get<BudgetData>("/staff/budget").catch((e) => ({ error: errText(e) })),
        api.get<Readiness>("/staff/ai-providers/readiness/details").catch((e) => ({ error: errText(e) })),
      ]),
    [],
  );
  return (
    <div>
      <Intro title={t("AI providers")}>
        {t("Choose the provider, model and API key for each AI step. Keys are stored encrypted on the server and never shown again; leave the key empty to keep the saved one.")}
      </Intro>
      <Loaded state={state}>
        {([d, budget, ready]) => {
          const rows: [string, SlotView][] = [
            ["llm", d.slots.llm],
            ...Object.values(d.agents).map((a) => [a.slot, a] as [string, SlotView]),
            ["guard", d.slots.guard],
            ["vision", d.slots.vision],
            ["embedding", d.slots.embedding],
          ];
          const fast = rows.every(([slot, v]) => !FAST[slot] || v.model === FAST[slot]);
          const useFast = () =>
            confirm({
              title: t("Use the fast, economical OpenRouter model set"),
              body: <FastProfileBody />,
              confirmLabel: t("Use this model set"),
              run: async () => {
                await api.post("/staff/ai-providers/profile/fast");
                notice(t("Every AI step now uses the fast OpenRouter set."));
                await state.reload();
              },
            });
          return (
            <div className="stack sd-ai">
              {!d.network_enabled ? <p className="callout warn small">{t("AI calls are switched off on this server (PROVIDER_NETWORK_ENABLED is not true). You can still save providers now.")}</p> : null}

              <section className="card stack" aria-labelledby="sd-ai-summary">
                <div className="record-head">
                  <h3 id="sd-ai-summary">{t("What each AI step uses")}</h3>
                  <Badge tone={fast ? "accent" : "neutral"}>{fast ? t("Fast OpenRouter set") : t("Custom choices")}</Badge>
                </div>
                <p className="small muted">{t("The 4.0.0 default is one team OpenRouter key for every step, with small fast models that fit the USD 10 project budget.")}</p>
                <div className="table-wrap">
                  <table className="data sd-table sd-ai-table">
                    <thead>
                      <tr>
                        <th scope="col">{t("Step")}</th>
                        <th scope="col">{t("Model")}</th>
                        <th scope="col">{t("Provider")}</th>
                        <th scope="col">{t("Settings from")}</th>
                        <th scope="col">{t("Ready")}</th>
                        <th scope="col" className="n">
                          {t("THB per 1M tokens (in / out)")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(([slot, v]) => (
                        <tr key={slot}>
                          <td data-label={t("Step")} className="sd-cell-title">
                            {slotLabel(t, slot)}
                            {slot === "llm" ? <span className="sub">{t("Holds the shared OpenRouter key")}</span> : null}
                          </td>
                          <td data-label={t("Model")}>
                            <span className="mono sd-model">{v.model || t("Not set")}</span>
                            {FAST[slot] && v.model !== FAST[slot] ? <span className="sub">{tf("Fast set uses {model}", { model: FAST[slot] })}</span> : null}
                          </td>
                          <td data-label={t("Provider")}>{v.provider_label}</td>
                          <td data-label={t("Settings from")}>{sourceLabel(t, v.source)}</td>
                          <td data-label={t("Ready")}>
                            <Badge tone={v.ready ? "ok" : "warn"}>{v.ready ? t("Ready") : t("Not set up")}</Badge>
                          </td>
                          <td data-label={t("THB per 1M tokens (in / out)")} className="n">
                            {v.priced ? (
                              <span className="num">
                                {v.price_in} / {v.price_out}
                              </span>
                            ) : (
                              <Badge tone="warn">{t("No price")}</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="form-actions">
                  <button type="button" className="btn primary" onClick={useFast}>
                    {t("Use the fast, economical OpenRouter model set")}
                  </button>
                  <span className="small muted">{t("Needs the shared OpenRouter key saved under Language model first.")}</span>
                </div>
              </section>

              <div className="sd-two">
                {"error" in budget ? (
                  <section className="card stack-sm">
                    <h3>{t("AI budget (project total)")}</h3>
                    <p className="small">{t(budget.error)}</p>
                  </section>
                ) : (
                  <BudgetPanel b={budget} />
                )}
                <ReadinessPanel r={ready} reload={state.reload} />
              </div>

              <h3 className="sd-section-title">{t("Change a step")}</h3>
              {(["llm", "guard", "vision", "embedding"] as Kind[]).map((slot) => (
                <SlotCard key={slot} d={d} slot={slot} cur={d.slots[slot]} onSaved={state.reload} />
              ))}
              <AgentsCard d={d} onSaved={state.reload} />
              <p className="small muted">
                {t("Each test makes one real call, counted in the call cap and the THB budget. Prices are estimates used only for that budget; set them to your provider's real prices.")}
              </p>
            </div>
          );
        }}
      </Loaded>
    </div>
  );
}

function FastProfileBody() {
  const { t } = useStaff();
  const rows: [string, string][] = [
    [t("Planner"), "qwen/qwen3-30b-a3b-instruct-2507"],
    [t("Writers (Advisor and Explainer)"), "google/gemini-3.1-flash-lite"],
    [t("Reviewer and safety classifier"), "openai/gpt-4.1-mini"],
    [t("Report reading (OCR)"), "google/gemini-3.1-flash-lite"],
    [t("Knowledge retrieval"), "qwen/qwen3-embedding-8b"],
  ];
  return (
    <>
      <p>{t("Every step will use the team's one OpenRouter key:")}</p>
      <Kv rows={rows.map(([k, v]) => [k, <span key={k} className="mono">{v}</span>])} />
      <p className="muted">{t("This replaces the saved choices for the agents, the safety check, report reading and retrieval. The shared language model and its key stay as they are.")}</p>
    </>
  );
}

function ReadinessPanel({ r, reload }: { r: Readiness | { error: string }; reload: () => Promise<void> }) {
  const { t, tf, lang, fail } = useStaff();
  if ("error" in r)
    return (
      <section className="card stack-sm">
        <h3>{t("Readiness")}</h3>
        <p className="small">{t(r.error)}</p>
      </section>
    );
  const idx = r.retrieval;
  const built = idx.built_at ? new Date(typeof idx.built_at === "number" ? idx.built_at * 1000 : idx.built_at) : null;
  return (
    <section className="card stack" aria-labelledby="sd-ready">
      <div className="record-head">
        <h3 id="sd-ready">{t("Readiness (no AI calls)")}</h3>
        <Badge tone={r.ready ? "ok" : "warn"}>{r.ready ? t("Ready") : tf("{n} to fix", { n: r.issues.length })}</Badge>
      </div>
      {r.issues.length ? (
        <ul className="sd-issues small">
          {r.issues.map((i) => (
            <li key={i}>
              <Icon name="warn" size={15} />
              <span>{issueText(t, tf, i, r.required_calls)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small">{t("Configuration ready. Live model quality has not been evaluated.")}</p>
      )}
      <Kv
        rows={[
          [
            t("Call allowance"),
            r.calls.limit !== undefined ? tf("{remaining} of {limit} calls left", { remaining: r.calls.remaining ?? "?", limit: r.calls.limit }) : t("Unknown"),
          ],
          [
            t("Knowledge index"),
            idx.ready ? (
              <span>
                <Badge tone="ok">{t("Built")}</Badge>{" "}
                {tf("{n} passages · {model} · {dims} dimensions", { n: idx.records ?? 0, model: idx.model || "", dims: idx.dimensions ?? "?" })}
                {built && !Number.isNaN(built.getTime()) ? " · " + built.toLocaleDateString(lang === "th" ? "th-TH" : "en-GB") : ""}
              </span>
            ) : (
              <span>
                <Badge tone={idx.building ? "accent" : "neutral"}>{idx.building ? t("Building") : t("Not built")}</Badge>{" "}
                {t("Retrieval uses keyword search (BM25) until the index is built with scripts/build_embeddings.py.")}
              </span>
            ),
          ],
        ]}
      />
      <p className="tiny muted">{t("Configuration checks only; JSON, OCR and Thai quality still need a live evaluation.")}</p>
      <ActionButton className="btn sm" run={reload} onError={fail}>
        {t("Check readiness again")}
      </ActionButton>
    </section>
  );
}

const HELP = (t: T): Record<Kind, string> => ({
  llm: t("The shared model every agent below uses unless it has its own. Its OpenRouter key is shared with the other steps. Must follow JSON instructions well."),
  guard: t("Screens every customer message, every answer and every report before it is used. Anything not clearly safe is blocked."),
  vision: t("Reads lab report photos and PDFs. Verify decimal values and units with the live OCR evaluation."),
  embedding: t("Optional hybrid retrieval over the public knowledge base. Build the index with scripts/build_embeddings.py before enabling it."),
});

function TestButton({ slot }: { slot: string }) {
  const { t, notice, fail } = useStaff();
  return (
    <ActionButton
      className="btn sm"
      title={t("Makes one real call, counted in the budget")}
      onError={fail}
      run={async () => {
        const r = await api.post<{ ok: boolean; message: string }>("/staff/ai-providers/" + slot + "/test");
        notice(t(r.message), r.ok ? "ok" : "bad");
      }}
    >
      {t("Test connection")}
    </ActionButton>
  );
}

function SlotCard({ d, slot, cur, onSaved }: { d: AiView; slot: Kind; cur: SlotView; onSaved: () => Promise<void> }) {
  const { t } = useStaff();
  return (
    <section className="card stack-sm sd-slot" aria-labelledby={"sd-slot-" + slot}>
      <div className="record-head">
        <h3 id={"sd-slot-" + slot}>{t(cur.label)}</h3>
        <Badge tone={cur.ready ? "ok" : "warn"}>{cur.ready ? sourceLabel(t, cur.source) : t("Not set up")}</Badge>
      </div>
      <p className="small muted">{HELP(t)[slot]}</p>
      <p className="small">
        <span className="mono">{cur.model || t("Not set")}</span> · {cur.provider_label}
        {cur.key ? (
          <>
            {" · "}
            {t("key")} <span className="mono">{cur.key}</span>
          </>
        ) : null}
        {(slot === "vision" || slot === "embedding") && !cur.enabled ? <> · {t("Switched off")}</> : null}
      </p>
      <div className="row">
        <TestButton slot={slot} />
      </div>
      <details className="sd-edit">
        <summary>
          <Icon name="chevron" size={14} />
          {t("Change provider, model or key")}
        </summary>
        <ProviderForm d={d} slot={slot} cur={cur} kind={slot} onSaved={onSaved} />
      </details>
    </section>
  );
}

function AgentsCard({ d, onSaved }: { d: AiView; onSaved: () => Promise<void> }) {
  const { t, tf, confirm, notice } = useStaff();
  const [own, setOwn] = useState<Record<string, boolean>>({});
  return (
    <section className="card stack agents-card" aria-labelledby="sd-agents">
      <h3 id="sd-agents">{t("Agents")}</h3>
      <p className="small muted">{t("Each agent uses the language model above unless you give it its own provider, model and key. A different model for the Reviewer makes its check more independent.")}</p>
      {Object.entries(d.agents).map(([id, cur]) => {
        const saved = cur.source === "app" || cur.source === "shared_key";
        const ownChoice = own[id] ?? saved;
        const selectId = "agent-" + id;
        return (
          <div key={id} className="agent-row">
            <div className="record-head">
              <strong>{t(cur.label)}</strong>
              <Badge tone={saved ? "ok" : "neutral"}>{(saved ? t("Own") : t("Shared")) + ": " + cur.provider_label + " · " + cur.model}</Badge>
            </div>
            <p className="small muted">{t(cur.help)}</p>
            <div className="row sd-agent-controls">
              <div className="field">
                <label htmlFor={selectId}>{tf("Model for the {agent}", { agent: t(cur.label) })}</label>
                <select
                  id={selectId}
                  className="input"
                  value={ownChoice ? "own" : "shared"}
                  onChange={(e) => {
                    if (e.target.value === "own") return setOwn((o) => ({ ...o, [id]: true }));
                    if (!saved) return setOwn((o) => ({ ...o, [id]: false }));
                    confirm({
                      title: tf("Use the shared language model for the {agent}?", { agent: t(cur.label) }),
                      body: <p>{t("Its own provider, model and key are removed. It then uses the language model above.")}</p>,
                      confirmLabel: t("Use the shared language model"),
                      danger: true,
                      run: async () => {
                        await api.del("/staff/ai-providers/" + cur.slot);
                        setOwn((o) => ({ ...o, [id]: false }));
                        notice(tf("{agent} uses the shared language model again.", { agent: t(cur.label) }));
                        await onSaved();
                      },
                    });
                  }}
                >
                  <option value="shared">{t("Shared language model")}</option>
                  <option value="own">{t("Its own provider")}</option>
                </select>
              </div>
              <TestButton slot={cur.slot} />
            </div>
            {ownChoice ? (
              <details className="sd-edit" open={own[id] === true && !saved}>
                <summary>
                  <Icon name="chevron" size={14} />
                  {t("Change provider, model or key")}
                </summary>
                <ProviderForm d={d} slot={cur.slot} cur={cur} kind="llm" onSaved={onSaved} />
              </details>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

function ProviderForm({ d, slot, cur, kind, onSaved }: { d: AiView; slot: string; cur: SlotView; kind: Kind; onSaved: () => Promise<void> }) {
  const { t, tf, notice, confirm } = useStaff();
  const options = d.presets.filter((p) => p.slots.includes(kind));
  const initial = options.find((p) => p.id === cur.preset) || options[0];
  const shared = cur.source === "shared";
  const [preset, setPreset] = useState(initial?.id || "");
  const [model, setModel] = useState(shared ? "" : cur.model);
  const [key, setKey] = useState("");
  const [url, setUrl] = useState(cur.base_url || "");
  const [priceIn, setPriceIn] = useState(String((shared ? initial?.price_in : cur.price_in) ?? ""));
  const [priceOut, setPriceOut] = useState(String((shared ? initial?.price_out : cur.price_out) ?? ""));
  const [enabled, setEnabled] = useState(cur.enabled);
  const [error, setError] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const uid = useId();
  const p = options.find((x) => x.id === preset) || initial;
  if (!p) return null;
  const keyHint =
    cur.source === "shared_key"
      ? t("Uses the shared OpenRouter key; leave blank to keep using it.")
      : cur.key && !shared
        ? tf("Saved key: {key}. Leave empty to keep it.", { key: cur.key })
        : t("Paste the key from the provider console.");
  const save = async () => {
    setError("");
    if (!form.current?.reportValidity()) return;
    try {
      await api.put("/staff/ai-providers/" + slot, {
        preset,
        model: model.trim(),
        api_key: key.trim(),
        base_url: url.trim(),
        enabled: kind === "vision" || kind === "embedding" ? enabled : true,
        price_in: priceIn === "" ? null : Number(priceIn),
        price_out: priceOut === "" ? null : Number(priceOut),
      });
      setKey("");
      notice(tf("{step} saved.", { step: t(cur.label) }));
      await onSaved();
    } catch (e) {
      setError(errText(e));
    }
  };
  const agent = slot.startsWith("agent_");
  return (
    <form
      ref={form}
      className="ai-form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="field">
        <label htmlFor={uid + "p"}>{t("Provider")}</label>
        <select
          id={uid + "p"}
          className="input"
          value={preset}
          onChange={(e) => {
            const next = options.find((x) => x.id === e.target.value);
            setPreset(e.target.value);
            setModel("");
            setKey("");
            setPriceIn(String(next?.price_in ?? ""));
            setPriceOut(String(next?.price_out ?? ""));
          }}
        >
          {options.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={uid + "m"}>{t("Model")}</label>
        <span className="hint" id={uid + "mh"}>
          {t("Leave empty to use the provider default.")}
        </span>
        <input
          id={uid + "m"}
          className="input mono"
          aria-describedby={uid + "mh"}
          maxLength={120}
          spellCheck={false}
          placeholder={(kind === "vision" && p.vision_model) || p.default_model || t("model name")}
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
      </div>
      <div className="field wide">
        <label htmlFor={uid + "k"}>{t("API key")}</label>
        <span className="hint" id={uid + "kh"}>
          {keyHint}
        </span>
        <input
          id={uid + "k"}
          className="input mono"
          type="password"
          aria-describedby={uid + "kh"}
          autoComplete="off"
          spellCheck={false}
          maxLength={400}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </div>
      {preset === "custom" ? (
        <div className="field wide">
          <label htmlFor={uid + "u"}>{t("Endpoint URL")}</label>
          <span className="hint" id={uid + "uh"}>
            {t("OpenAI-compatible base URL, for example https://api.example.com/v1")}
          </span>
          <input id={uid + "u"} className="input mono" type="url" aria-describedby={uid + "uh"} required value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
      ) : null}
      <div className="field">
        <label htmlFor={uid + "i"}>{t("Input price (THB per 1M tokens)")}</label>
        <input id={uid + "i"} className="input" type="number" min={0} max={100000} step="any" value={priceIn} onChange={(e) => setPriceIn(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor={uid + "o"}>{t("Output price (THB per 1M tokens)")}</label>
        <input id={uid + "o"} className="input" type="number" min={0} max={100000} step="any" value={priceOut} onChange={(e) => setPriceOut(e.target.value)} />
      </div>
      {kind === "vision" || kind === "embedding" ? (
        <label className="check wide">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>{kind === "embedding" ? t("Retrieval is on") : t("Report reading is on")}</span>
        </label>
      ) : null}
      {error ? (
        <p className="field-error wide" role="alert">
          {t(error)}
        </p>
      ) : null}
      <div className="form-actions wide">
        <ActionButton className="btn primary sm" run={save}>
          {t("Save")}
        </ActionButton>
        {cur.source === "app" || cur.source === "shared_key" ? (
          <button
            type="button"
            className="btn sm ghost"
            onClick={() =>
              confirm({
                title: agent ? t("Use the shared language model") : t("Use server settings"),
                body: <p>{agent ? t("Its own provider, model and key are removed. It then uses the language model above.") : t("The saved provider, model and key for this step are removed, and the server environment is used again.")}</p>,
                confirmLabel: agent ? t("Use the shared language model") : t("Use server settings"),
                danger: true,
                run: async () => {
                  await api.del("/staff/ai-providers/" + slot);
                  notice(agent ? tf("{agent} uses the shared language model again.", { agent: t(cur.label) }) : t("Saved settings removed; the server environment is used again."));
                  await onSaved();
                },
              })
            }
          >
            {agent ? t("Use the shared language model") : t("Use server settings")}
          </button>
        ) : null}
        {p.key_url ? (
          <a className="small" href={p.key_url} target="_blank" rel="noopener noreferrer">
            {tf("Get a key from {provider}", { provider: p.label })} <Icon name="external" size={13} />
          </a>
        ) : null}
      </div>
    </form>
  );
}
