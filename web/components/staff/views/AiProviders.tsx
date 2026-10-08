"use client";
/* AI providers (manager). Claude 4.0.0 view adapted in integration 4.0 to the Codex contract
   (routers/ai_admin.py, services/providers.py): three slots, four legacy agents that share the
   language model, and two opt-in roles (Medical analyzer, Thai composer) that start disabled and
   need an exact model, explicit prices and, on OpenRouter, reviewed endpoint IDs. Saving is a
   configuration check only; Test makes one real, budgeted call. Keys are never shown back. */
import { useId, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import type { T } from "@/lib/i18n/shared";
import { ActionButton, Badge, Intro } from "@/components/workspace/ui";
import { useStaff } from "../context";
import { BudgetPanel, Icon, Kv, Loaded, errText, useLoad, type BudgetData } from "../parts";

type Kind = "llm" | "vision" | "guard";
type SlotView = {
  label: string;
  source: "environment" | "app" | "shared" | "not_configured" | string;
  preset: string;
  provider_label: string;
  model: string;
  base_url: string;
  enabled: boolean;
  key: string;
  ready: boolean;
  config_status: "DISABLED" | "SCHEMA_CHECK_ONLY" | "NOT_CONFIGURED" | string;
  live_test_status: string;
  provider_allowlist: string[];
  price_in: number | null;
  price_out: number | null;
  slot?: string;
  help?: string;
};
type Preset = { id: string; label: string; slots: string[]; default_model: string; vision_model: string; price_in: number; price_out: number; key_url: string };
type AiView = { slots: Record<Kind, SlotView>; agents: Record<string, SlotView & { slot: string; help: string }>; presets: Preset[]; network_enabled: boolean };
type Candidate = { model_id: string; roles: string[]; approval_status: string; price_status: string; privacy_approval: string; last_live_eval: string | null; notes: string };
type Registry = { version: string; status: string; models: Candidate[] };

/** Opt-in roles added by the Codex upgrade: disabled until configured, no inherited key. */
const UPGRADE = new Set(["medical_analyzer", "thai_composer", "agent_medical_analyzer", "agent_thai_composer"]);

const slotLabel = (t: T, slot: string) =>
  ({
    llm: t("Language model"),
    guard: t("Safety check"),
    vision: t("Report reading (OCR)"),
    agent_plan: t("Planner"),
    agent_advisor: t("Health-check Advisor"),
    agent_explainer: t("Report Explainer"),
    agent_review: t("Reviewer"),
    agent_medical_analyzer: t("Medical analyzer"),
    agent_thai_composer: t("Thai composer"),
  })[slot] || slot;

const sourceLabel = (t: T, s: string) =>
  ({ environment: t("Server environment"), app: t("Saved here"), shared: t("Shared language model"), not_configured: t("Not configured") })[s] || s;

const configLabel = (t: T, s: string): [string, "ok" | "warn" | "neutral"] =>
  (({ SCHEMA_CHECK_ONLY: [t("Configuration checked"), "ok"], NOT_CONFIGURED: [t("Not configured"), "warn"], DISABLED: [t("Disabled"), "neutral"] }) as Record<string, [string, "ok" | "warn" | "neutral"]>)[s] || [s, "neutral"];

export function AiProviders() {
  const { t } = useStaff();
  const state = useLoad(
    () =>
      Promise.all([
        api.get<AiView>("/staff/ai-providers"),
        api.get<BudgetData>("/staff/budget").catch((e) => ({ error: errText(e) })),
        api.get<Registry>("/staff/ai-providers/registry").catch((e) => ({ error: errText(e) })),
      ]),
    [],
  );
  return (
    <div>
      <Intro title={t("AI providers")}>
        {t("Choose the provider, model and API key for each AI step. Keys are stored encrypted on the server and never shown again; leave the key empty to keep the saved one.")}
      </Intro>
      <Loaded state={state}>
        {([d, budget, registry]) => {
          const rows: [string, SlotView][] = [
            ["llm", d.slots.llm],
            ...Object.values(d.agents).map((a) => [a.slot, a] as [string, SlotView]),
            ["guard", d.slots.guard],
            ["vision", d.slots.vision],
          ];
          return (
            <div className="stack sd-ai">
              {!d.network_enabled ? <p className="callout warn small">{t("AI calls are switched off on this server (PROVIDER_NETWORK_ENABLED is not true). You can still save providers now.")}</p> : null}

              <section className="card stack" aria-labelledby="sd-ai-summary">
                <div className="record-head">
                  <h3 id="sd-ai-summary">{t("What each AI step uses")}</h3>
                  <Badge tone="neutral">{t("Live verification: not recorded")}</Badge>
                </div>
                <p className="small muted">{t("Saving checks the configuration only. Model quality, Thai output and medical accuracy are not verified until a reviewed live evaluation is authorized.")}</p>
                <div className="table-wrap">
                  <table className="data sd-table sd-ai-table">
                    <thead>
                      <tr>
                        <th scope="col">{t("Step")}</th>
                        <th scope="col">{t("Model")}</th>
                        <th scope="col">{t("Provider")}</th>
                        <th scope="col">{t("Settings from")}</th>
                        <th scope="col">{t("Configuration")}</th>
                        <th scope="col" className="n">
                          {t("THB per 1M tokens (in / out)")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(([slot, v]) => {
                        const [label, tone] = configLabel(t, v.config_status);
                        return (
                          <tr key={slot}>
                            <td data-label={t("Step")} className="sd-cell-title">
                              {slotLabel(t, slot)}
                              {UPGRADE.has(slot) ? <span className="sub">{t("Opt-in role")}</span> : null}
                            </td>
                            <td data-label={t("Model")}>
                              <span className="mono sd-model">{v.model || t("Not set")}</span>
                            </td>
                            <td data-label={t("Provider")}>{v.provider_label}</td>
                            <td data-label={t("Settings from")}>{sourceLabel(t, v.source)}</td>
                            <td data-label={t("Configuration")}>
                              <Badge tone={tone}>{label}</Badge>
                            </td>
                            <td data-label={t("THB per 1M tokens (in / out)")} className="n">
                              {v.price_in !== null && v.price_out !== null ? (
                                <span className="num">
                                  {v.price_in} / {v.price_out}
                                </span>
                              ) : (
                                <Badge tone="warn">{t("No price")}</Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
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
                <RegistryPanel r={registry} />
              </div>

              <h3 className="sd-section-title">{t("Change a step")}</h3>
              {(["llm", "guard", "vision"] as Kind[]).map((slot) => (
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

/** Candidate model metadata (runtime_skills/model_registry.json): never a default or a permission to call. */
function RegistryPanel({ r }: { r: Registry | { error: string } }) {
  const { t, tf } = useStaff();
  if ("error" in r)
    return (
      <section className="card stack-sm">
        <h3>{t("Candidate models")}</h3>
        <p className="small">{t(r.error)}</p>
      </section>
    );
  return (
    <section className="card stack" aria-labelledby="sd-registry">
      <div className="record-head">
        <h3 id="sd-registry">{t("Candidate models")}</h3>
        <Badge tone="neutral">{tf("{n} candidates", { n: r.models.length })}</Badge>
      </div>
      <p className="small muted">{t("Metadata for review only. Nothing here is selected, priced or approved; prices and privacy terms must be verified before use.")}</p>
      <ul className="sd-issues small">
        {r.models.map((m) => (
          <li key={m.model_id}>
            <Icon name="doc" size={15} />
            <span>
              <span className="mono">{m.model_id}</span> · {m.roles.join(", ")} · {m.price_status} · {m.approval_status}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const HELP = (t: T): Record<Kind, string> => ({
  llm: t("The shared model used by the four legacy agents unless they have their own settings. New roles start disabled. Must follow JSON instructions well."),
  guard: t("Screens every customer message, every answer and every report before it is used. Anything not clearly safe is blocked."),
  vision: t("Reads lab report photos and PDFs. Typhoon OCR is tuned for Thai reports."),
});

function TestButton({ slot }: { slot: string }) {
  const { t, notice, fail } = useStaff();
  return (
    <ActionButton
      className="btn sm"
      title={t("Makes one real call, counted in the budget")}
      onError={fail}
      run={async () => {
        const r = await api.post<{ ok: boolean; message: string; status?: string }>("/staff/ai-providers/" + slot + "/test");
        notice((r.status ? r.status + " · " : "") + t(r.message), r.ok ? "ok" : "bad");
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
      <p className="tiny muted">{t("Configuration") + ": " + configLabel(t, cur.config_status)[0] + " · " + t("Live verification: not recorded")}</p>
      <p className="small">
        <span className="mono">{cur.model || t("Not set")}</span> · {cur.provider_label}
        {cur.key ? (
          <>
            {" · "}
            {t("key")} <span className="mono">{cur.key}</span>
          </>
        ) : null}
        {slot === "vision" && !cur.enabled ? <> · {t("Switched off")}</> : null}
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
      <p className="small muted">{t("The four legacy agents share the language model unless configured separately. Medical analyzer and Thai composer start disabled and require their own reviewed settings. A separate Reviewer request still checks the original evidence.")}</p>
      {Object.entries(d.agents).map(([id, cur]) => {
        const upgrade = UPGRADE.has(id);
        const saved = cur.source === "app";
        const ownChoice = own[id] ?? saved;
        const selectId = "agent-" + id;
        return (
          <div key={id} className="agent-row">
            <div className="record-head">
              <strong>{t(cur.label)}</strong>
              <Badge tone={saved ? "ok" : "neutral"}>{upgrade && !saved ? t("Disabled until configured") : (saved ? t("Own") : t("Shared")) + ": " + cur.provider_label + " · " + cur.model}</Badge>
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
                      title: upgrade ? tf("Disable the {agent}?", { agent: t(cur.label) }) : tf("Use the shared language model for the {agent}?", { agent: t(cur.label) }),
                      body: <p>{upgrade ? t("Its saved provider, model and key are removed and the role is disabled.") : t("Its own provider, model and key are removed. It then uses the language model above.")}</p>,
                      confirmLabel: upgrade ? t("Disable this new role") : t("Use the shared language model"),
                      danger: true,
                      run: async () => {
                        await api.del("/staff/ai-providers/" + cur.slot);
                        setOwn((o) => ({ ...o, [id]: false }));
                        notice(upgrade ? tf("{agent} is disabled.", { agent: t(cur.label) }) : tf("{agent} uses the shared language model again.", { agent: t(cur.label) }));
                        await onSaved();
                      },
                    });
                  }}
                >
                  <option value="shared">{upgrade ? t("Disabled") : t("Shared language model")}</option>
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
  const upgrade = UPGRADE.has(slot);
  const options = d.presets.filter((p) => p.slots.includes(kind));
  const initial = options.find((p) => p.id === cur.preset) || options[0];
  // Opt-in roles never inherit a default model or price (Codex: exact model and prices required).
  const shared = cur.source === "shared" || cur.source === "not_configured";
  const [preset, setPreset] = useState(initial?.id || "");
  const [model, setModel] = useState(shared ? "" : cur.model);
  const [key, setKey] = useState("");
  const [url, setUrl] = useState(cur.base_url || "");
  const [priceIn, setPriceIn] = useState(upgrade && shared ? "" : String((shared ? initial?.price_in : cur.price_in) ?? ""));
  const [priceOut, setPriceOut] = useState(upgrade && shared ? "" : String((shared ? initial?.price_out : cur.price_out) ?? ""));
  const [endpoints, setEndpoints] = useState((cur.provider_allowlist || []).join(", "));
  const [enabled, setEnabled] = useState(cur.enabled);
  const [error, setError] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const uid = useId();
  const p = options.find((x) => x.id === preset) || initial;
  if (!p) return null;
  const keyHint =
    cur.key && !shared
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
        enabled: kind === "vision" ? enabled : true,
        price_in: priceIn === "" ? null : Number(priceIn),
        price_out: priceOut === "" ? null : Number(priceOut),
        provider_allowlist: endpoints
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
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
            setPriceIn(upgrade ? "" : String(next?.price_in ?? ""));
            setPriceOut(upgrade ? "" : String(next?.price_out ?? ""));
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
          {upgrade ? t("Enter the exact reviewed model ID; this role has no default.") : t("Leave empty to use the provider default.")}
        </span>
        <input
          id={uid + "m"}
          className="input mono"
          aria-describedby={uid + "mh"}
          maxLength={120}
          spellCheck={false}
          placeholder={upgrade ? t("model name") : (kind === "vision" && p.vision_model) || p.default_model || t("model name")}
          required={upgrade}
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
        <input id={uid + "i"} className="input" type="number" min={0} max={100000} step="any" required={upgrade} value={priceIn} onChange={(e) => setPriceIn(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor={uid + "o"}>{t("Output price (THB per 1M tokens)")}</label>
        <input id={uid + "o"} className="input" type="number" min={0} max={100000} step="any" required={upgrade} value={priceOut} onChange={(e) => setPriceOut(e.target.value)} />
      </div>
      {upgrade ? (
        <div className="field wide">
          <label htmlFor={uid + "e"}>{t("Reviewed OpenRouter endpoint IDs")}</label>
          <span className="hint" id={uid + "eh"}>
            {t("Comma-separated provider IDs. New OpenRouter roles require reviewed endpoints; fallback routing is off.")}
          </span>
          <input id={uid + "e"} className="input mono" aria-describedby={uid + "eh"} maxLength={1000} spellCheck={false} required={preset === "openrouter"} value={endpoints} onChange={(e) => setEndpoints(e.target.value)} />
        </div>
      ) : null}
      {kind === "vision" ? (
        <label className="check wide">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>{t("Report reading is on")}</span>
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
        {cur.source === "app" ? (
          <button
            type="button"
            className="btn sm ghost"
            onClick={() =>
              confirm({
                title: upgrade ? t("Disable this new role") : agent ? t("Use the shared language model") : t("Use server settings"),
                body: <p>{upgrade ? t("Its saved provider, model and key are removed and the role is disabled.") : agent ? t("Its own provider, model and key are removed. It then uses the language model above.") : t("The saved provider, model and key for this step are removed, and the server environment is used again.")}</p>,
                confirmLabel: upgrade ? t("Disable this new role") : agent ? t("Use the shared language model") : t("Use server settings"),
                danger: true,
                run: async () => {
                  await api.del("/staff/ai-providers/" + slot);
                  notice(upgrade ? tf("{agent} is disabled.", { agent: t(cur.label) }) : agent ? tf("{agent} uses the shared language model again.", { agent: t(cur.label) }) : t("Saved settings removed; the server environment is used again."));
                  await onSaved();
                },
              })
            }
          >
            {upgrade ? t("Disable this new role") : agent ? t("Use the shared language model") : t("Use server settings")}
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
