"use client";
/* Manager views: catalog and prices, centers and capacity, assistant roles, audit log. */
import { useState } from "react";
import { api } from "@/lib/api/client";
import { money, when } from "@/lib/format";
import type { Branch, Dot, Package } from "@/lib/types";
import { ActionButton, Badge, Empty, Intro } from "@/components/workspace/ui";
import { useStaff } from "../context";
import { Kv, Loaded, errText, useLoad } from "../parts";

/* ------------------------------------------------------------------ catalog */

export function CatalogAdmin() {
  const { t, tf } = useStaff();
  const state = useLoad(() => api.get<{ catalog: { version: string; packages: Package[] } }>("/staff/operations"), []);
  return (
    <div>
      <Intro title={t("Catalog and prices")}>{t("Changes apply immediately to the website, the assistant and new previews. Confirmed appointments keep their agreed price.")}</Intro>
      <Loaded state={state}>
        {(d) => (
          <>
            <p className="small muted sd-gap">{tf("Catalog version {v}", { v: d.catalog.version })}</p>
            <div className="table-wrap">
              <table className="data sd-table">
                <thead>
                  <tr>
                    <th scope="col">{t("Package")}</th>
                    <th scope="col">{t("Segment")}</th>
                    <th scope="col">{t("Price (THB)")}</th>
                    <th scope="col">{t("Available")}</th>
                    <th scope="col">
                      <span className="sr-only">{t("Save")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {d.catalog.packages.map((p) => (
                    <PackageRow key={p.id} p={p} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Loaded>
    </div>
  );
}

function PackageRow({ p }: { p: Package }) {
  const { t, tf, business } = useStaff();
  const [price, setPrice] = useState(String(p.price_thb));
  const [active, setActive] = useState(p.active !== false);
  const [status, setStatus] = useState<{ text: string; bad?: boolean }>({ text: "" });
  const priceId = "price-" + p.id;
  return (
    <tr>
      <td data-label={t("Package")} className="sd-cell-title">
        <strong>{p.name}</strong>
        <span className="sub mono">{p.id}</span>
      </td>
      <td data-label={t("Segment")}>{p.segment === "organization" ? t("Organizations") : t("Individuals")}</td>
      <td data-label={t("Price (THB)")}>
        <label className="sr-only" htmlFor={priceId}>
          {tf("{name} price in THB", { name: p.name })}
        </label>
        <input id={priceId} className="input sd-num-input" type="number" min={1} max={1000000} value={price} onChange={(e) => setPrice(e.target.value)} />
      </td>
      <td data-label={t("Available")}>
        <label className="check">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span>{active ? t("Shown to customers") : t("Hidden")}</span>
        </label>
      </td>
      <td data-label="">
        <span className="sd-cell-stack">
          <ActionButton
            className="btn sm"
            run={async () => {
              const n = Number(price);
              if (!Number.isFinite(n) || n < 1 || n > 1000000) {
                setStatus({ text: t("Enter 1–1,000,000."), bad: true });
                return;
              }
              try {
                const r = await api.put<{ version: string }>("/staff/catalog/" + p.id, { price_thb: n, active });
                business(true).catch(() => {});
                // Read back what customers now see, as the 3.x desk did.
                const fresh = await api.get<{ packages: Package[] }>("/catalog/search?segment=" + p.segment);
                const back = fresh.packages.find((x) => x.id === p.id);
                setStatus({ text: back ? tf("Saved · now {price} · {v}", { price: money(back.price_thb), v: r.version }) : tf("Saved · hidden from customers · {v}", { v: r.version }) });
              } catch (e) {
                setStatus({ text: t(errText(e)), bad: true });
              }
            }}
          >
            {t("Save package")}
          </ActionButton>
          <span className={"tiny " + (status.bad ? "sd-bad" : "muted")} aria-live="polite">
            {status.text}
          </span>
        </span>
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ centers */

export function Centers() {
  const { t } = useStaff();
  const state = useLoad(() => api.get<{ branches: (Branch & { area?: string; hours?: string })[] }>("/branches"), []);
  return (
    <div>
      <Intro title={t("Centers and capacity")}>{t("Visits per half-hour slot apply to new requests immediately. Existing appointments are never cancelled by a change.")}</Intro>
      <Loaded state={state}>
        {(d) => (
          <div className="table-wrap">
            <table className="data sd-table">
              <thead>
                <tr>
                  <th scope="col">{t("Center")}</th>
                  <th scope="col">{t("Area")}</th>
                  <th scope="col">{t("Hours")}</th>
                  <th scope="col">{t("Visits per slot")}</th>
                  <th scope="col">
                    <span className="sr-only">{t("Save")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.branches.map((b) => (
                  <CenterRow key={b.id} b={b} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Loaded>
    </div>
  );
}

function CenterRow({ b }: { b: Branch & { area?: string; hours?: string } }) {
  const { t, tf, business } = useStaff();
  const [value, setValue] = useState(String(b.capacity_per_slot));
  const [status, setStatus] = useState<{ text: string; bad?: boolean }>({ text: "" });
  const id = "cap-" + b.id;
  return (
    <tr>
      <td data-label={t("Center")} className="sd-cell-title">
        <strong>{t(b.name)}</strong>
        <span className="sub mono">{b.id}</span>
      </td>
      <td data-label={t("Area")}>{t(b.area || "")}</td>
      <td data-label={t("Hours")}>{t(b.hours || "")}</td>
      <td data-label={t("Visits per slot")}>
        <label className="sr-only" htmlFor={id}>
          {tf("{name} visits per slot", { name: t(b.name) })}
        </label>
        <input id={id} className="input sd-num-input" type="number" min={1} max={20} value={value} onChange={(e) => setValue(e.target.value)} />
      </td>
      <td data-label="">
        <span className="sd-cell-stack">
          <ActionButton
            className="btn sm"
            run={async () => {
              const n = Number(value);
              if (!Number.isInteger(n) || n < 1 || n > 20) {
                setStatus({ text: t("Use 1–20."), bad: true });
                return;
              }
              try {
                const r = await api.put<{ branch: Branch; version: string }>("/staff/branches/" + b.id, { capacity_per_slot: n });
                business(true).catch(() => {});
                setStatus({ text: tf("Saved · {n} per slot · {v}", { n: r.branch.capacity_per_slot, v: r.version }) });
              } catch (e) {
                setStatus({ text: t(errText(e)), bad: true });
              }
            }}
          >
            {t("Save")}
          </ActionButton>
          <span className={"tiny " + (status.bad ? "sd-bad" : "muted")} aria-live="polite">
            {status.text}
          </span>
        </span>
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ assistant roles */

export function Roles() {
  const { t, tf, notice, fail, confirm } = useStaff();
  const state = useLoad(() => api.get<{ dots: Dot[] }>("/dots"), []);
  const full = (id: string): [string, string][] =>
    id === "advisor"
      ? [
          [t("Can propose"), t("Answer, compare, quote preview, appointment request preview, payment preview, organization request, team handoff")],
          [t("Page shortcuts"), t("Open package, compare, filter catalog, prefill booking, open organization form")],
          [t("Can read"), t("Catalog, centers, policies, public medical sources, your own appointments")],
        ]
      : id === "explainer"
        ? [
            [t("Can propose"), t("Answer, clarify, urgent referral, team handoff")],
            [t("Page shortcuts"), t("Highlight a report value, open a view")],
            [t("Can read"), t("Confirmed report values, public medical sources, policies. No catalog or prices.")],
          ]
        : [];
  const toggle = async (r: Dot) => {
    await api.put("/staff/dots/" + r.id, { enabled: !r.enabled });
    notice(r.enabled ? tf("{name} paused. Its questions go to the other role or our team.", { name: t(r.name) }) : tf("{name} is on.", { name: t(r.name) }));
    await state.reload();
  };
  return (
    <div>
      <Intro title={t("Assistant roles")}>{t("Two AI roles are routed automatically inside one conversation. Customers never choose a role. Permissions below are enforced by the server, not by the prompt.")}</Intro>
      <Loaded state={state}>
        {(d) => (
          <>
            <div className="record-list">
              {d.dots.map((r) => (
                <article key={r.id} className="record">
                  <div className="record-head">
                    <span className={"dot-mark " + r.id} aria-hidden="true">
                      {t(r.name)[0]}
                    </span>
                    <h3>{t(r.name)}</h3>
                    <Badge tone={r.enabled ? "ok" : "warn"}>{r.enabled ? t("On") : t("Paused")}</Badge>
                  </div>
                  <Kv rows={[[t("Role"), t(r.role)], [t("Purpose"), t(r.summary)], ...full(r.id)]} />
                  <div className="record-actions">
                    {r.enabled ? (
                      <button
                        type="button"
                        className="btn sm danger"
                        onClick={() =>
                          confirm({
                            title: tf("Pause {name}?", { name: t(r.name) }),
                            body: <p>{t("Its questions go to the other role or to our team until you turn it on again. Customers are not told which role answers.")}</p>,
                            confirmLabel: t("Pause this role"),
                            danger: true,
                            run: () => toggle(r),
                          })
                        }
                      >
                        {t("Pause this role")}
                      </button>
                    ) : (
                      <ActionButton className="btn sm primary" run={() => toggle(r)} onError={fail}>
                        {t("Turn on")}
                      </ActionButton>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <p className="small muted sd-footnote">{t("Pausing every role pauses AI replies; browsing, booking, payments and the team inbox keep working.")}</p>
          </>
        )}
      </Loaded>
    </div>
  );
}

/* ------------------------------------------------------------------ audit log */

type AuditEvent = { at: number; actor_role: string; actor: string; action: string; object: string };

export function Audit() {
  const { t, lang } = useStaff();
  const state = useLoad(() => api.get<{ events: AuditEvent[] }>("/staff/audit?limit=150"), []);
  return (
    <div>
      <Intro title={t("Audit log")}>{t("Who did what and when. Message contents and health data are never stored here.")}</Intro>
      <Loaded state={state}>
        {(d) =>
          d.events.length ? (
            <div className="table-wrap">
              <table className="data sd-table">
                <thead>
                  <tr>
                    <th scope="col">{t("Time")}</th>
                    <th scope="col">{t("Actor")}</th>
                    <th scope="col">{t("Action")}</th>
                    <th scope="col">{t("Record")}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.events.map((e, i) => (
                    <tr key={i}>
                      <td data-label={t("Time")}>{when(e.at, lang)}</td>
                      <td data-label={t("Actor")}>
                        {t(e.actor_role)} <span className="mono muted">…{e.actor}</span>
                      </td>
                      <td data-label={t("Action")} className="mono">
                        {e.action}
                      </td>
                      <td data-label={t("Record")} className="mono">
                        …{e.object}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title={t("No events yet")} />
          )
        }
      </Loaded>
    </div>
  );
}
