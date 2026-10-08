"use client";
/* Organizations (manager, 4.0.0): hospitals, clinics and companies whose members may see that
   organization's reviewed reference documents in chat. Backend: routers/org.py. */
import { useId, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { longDate } from "@/lib/format";
import type { T } from "@/lib/i18n/shared";
import { ActionButton, Badge, Empty, Intro } from "@/components/workspace/ui";
import { useStaff } from "../context";
import { CopyButton, Icon, Loaded, RefreshButton, errText, useLoad } from "../parts";

type Kind = "hospital" | "clinic" | "company" | "other";
type Member = { email: string; role: "member" | "admin"; joined: number };
type Org = {
  id: string;
  name: string;
  kind: Kind;
  active: boolean;
  created: number;
  join_code: string;
  members: Member[];
  documents: { pending: number; approved: number; rejected: number };
};

export const kindLabels = (t: T): Record<Kind, string> => ({ hospital: t("Hospital"), clinic: t("Clinic"), company: t("Company"), other: t("Other organization") });
const isoDay = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10);

export function Organizations() {
  const { t, modal } = useStaff();
  const state = useLoad(() => api.get<{ organizations: Org[] }>("/staff/organizations"), []);
  const create = () => modal(t("New organization"), <OrgForm onDone={state.reload} />);
  return (
    <div>
      <Intro title={t("Organizations")}>
        {t("Hospitals, clinics and companies that add their own reference documents. Share the join code with the organization; its people join from My organization in the app and see only approved documents.")}
      </Intro>
      <div className="toolbar">
        <button type="button" className="btn primary sm" onClick={create}>
          {t("New organization")}
        </button>
        <RefreshButton run={state.reload} />
      </div>
      <Loaded state={state}>
        {(d) =>
          d.organizations.length ? (
            <div className="record-list">
              {d.organizations.map((o) => (
                <OrgRecord key={o.id} o={o} reload={state.reload} />
              ))}
            </div>
          ) : (
            <Empty
              title={t("No organizations yet")}
              actions={
                <button type="button" className="btn sm" onClick={create}>
                  {t("Create the first organization")}
                </button>
              }
            >
              {t("Create one for a hospital, clinic or company, then share its join code.")}
            </Empty>
          )
        }
      </Loaded>
    </div>
  );
}

/** Create (no org) or rename (with org). */
function OrgForm({ org, onDone }: { org?: Org; onDone: () => Promise<unknown> }) {
  const { t, tf, notice, closeModal } = useStaff();
  const [name, setName] = useState(org?.name || "");
  const [kind, setKind] = useState<Kind>(org?.kind || "hospital");
  const [error, setError] = useState("");
  const ref = useRef<HTMLFormElement>(null);
  const id = useId();
  const submit = async () => {
    setError("");
    if (!ref.current?.reportValidity()) return;
    try {
      if (org) {
        await api.put("/staff/organizations/" + org.id, { name: name.trim() });
        notice(t("Organization renamed."));
      } else {
        const r = await api.post<Org>("/staff/organizations", { name: name.trim(), kind });
        notice(tf("{name} created. Join code {code}.", { name: r.name, code: r.join_code }));
      }
      closeModal();
      await onDone();
    } catch (e) {
      setError(errText(e));
    }
  };
  return (
    <form
      ref={ref}
      className="form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="field">
        <label htmlFor={id + "n"}>{t("Organization name")}</label>
        <input id={id + "n"} className="input" required minLength={2} maxLength={120} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {!org ? (
        <div className="field">
          <label htmlFor={id + "k"}>{t("Type")}</label>
          <select id={id + "k"} className="input" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {Object.entries(kindLabels(t)).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {error ? (
        <p className="field-error" role="alert">
          {t(error)}
        </p>
      ) : null}
      <div className="form-actions">
        <ActionButton className="btn primary" run={submit}>
          {org ? t("Save name") : t("Create organization")}
        </ActionButton>
        <button type="button" className="btn ghost" onClick={closeModal}>
          {t("Cancel")}
        </button>
      </div>
    </form>
  );
}

function OrgRecord({ o, reload }: { o: Org; reload: () => Promise<void> }) {
  const { t, tf, lang, modal, confirm, notice, navigate } = useStaff();
  const [open, setOpen] = useState(false);
  const panel = useId();
  const update = async (body: Record<string, unknown>, done: string) => {
    await api.put("/staff/organizations/" + o.id, body);
    notice(done);
    await reload();
  };
  const docs = o.documents;
  return (
    <article className={"record sd-org" + (o.active ? "" : " inactive")}>
      <div className="record-head">
        <h3>{o.name}</h3>
        <Badge tone="neutral">{kindLabels(t)[o.kind] || o.kind}</Badge>
        <Badge tone={o.active ? "ok" : "neutral"}>{o.active ? t("Active") : t("Inactive")}</Badge>
      </div>
      <div className="sd-org-body">
        <div className="sd-code-box">
          <span className="tiny muted">{t("Join code")}</span>
          <span className="row">
            <code className="sd-code">{o.join_code}</code>
            <CopyButton text={o.join_code} label={tf("Copy the join code for {name}", { name: o.name })} />
          </span>
          {!o.active ? <span className="tiny muted">{t("The code does not work while the organization is inactive.")}</span> : null}
        </div>
        <dl className="sd-org-stats">
          <div>
            <dt>{t("Members")}</dt>
            <dd className="num">{o.members.length}</dd>
          </div>
          <div>
            <dt>{t("Documents to review")}</dt>
            <dd className="num">{docs.pending ? <Badge tone="warn">{docs.pending}</Badge> : 0}</dd>
          </div>
          <div>
            <dt>{t("Approved")}</dt>
            <dd className="num">{docs.approved}</dd>
          </div>
          <div>
            <dt>{t("Rejected")}</dt>
            <dd className="num">{docs.rejected}</dd>
          </div>
          <div>
            <dt>{t("Created")}</dt>
            <dd>{longDate(isoDay(o.created), lang)}</dd>
          </div>
        </dl>
      </div>
      <div className="record-actions">
        <button type="button" className="btn sm" aria-expanded={open} aria-controls={panel} onClick={() => setOpen((v) => !v)}>
          <Icon name="chevron" size={14} />
          {open ? t("Hide members") : tf("Members ({n})", { n: o.members.length })}
        </button>
        <button type="button" className="btn sm" onClick={() => navigate("knowledge", { org: o.id, state: docs.pending ? "pending" : "all" })}>
          {t("Review documents")}
        </button>
        <button type="button" className="btn sm ghost" onClick={() => modal(t("Rename organization"), <OrgForm org={o} onDone={reload} />)}>
          {t("Rename")}
        </button>
        <button
          type="button"
          className="btn sm ghost"
          onClick={() =>
            confirm({
              title: t("Make a new join code?"),
              body: <p>{tf("The current code {code} stops working at once. People who already joined stay members.", { code: o.join_code })}</p>,
              confirmLabel: t("Make a new code"),
              run: () => update({ new_code: true }, t("New join code ready. Share it with the organization.")),
            })
          }
        >
          {t("New join code")}
        </button>
        {o.active ? (
          <button
            type="button"
            className="btn sm danger"
            onClick={() =>
              confirm({
                title: tf("Deactivate {name}?", { name: o.name }),
                body: <p>{t("Its documents are no longer used in chat and its join code stops working. Members and documents are kept, so you can activate it again later.")}</p>,
                confirmLabel: t("Deactivate"),
                danger: true,
                run: () => update({ active: false }, t("Organization deactivated.")),
              })
            }
          >
            {t("Deactivate")}
          </button>
        ) : (
          <ActionButton className="btn sm primary" run={() => update({ active: true }, t("Organization active again."))}>
            {t("Activate")}
          </ActionButton>
        )}
      </div>
      {open ? (
        <div id={panel}>
          <Members o={o} reload={reload} />
        </div>
      ) : null}
    </article>
  );
}

function Members({ o, reload }: { o: Org; reload: () => Promise<void> }) {
  const { t, tf, lang, confirm, notice, fail } = useStaff();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [error, setError] = useState("");
  const ref = useRef<HTMLFormElement>(null);
  const id = useId();
  const set = async (who: string, r: "member" | "admin" | "remove") => {
    await api.post("/staff/organizations/" + o.id + "/members", { email: who, role: r });
    notice(r === "remove" ? tf("{email} removed.", { email: who }) : r === "admin" ? tf("{email} is now an organization admin.", { email: who }) : tf("{email} is now a member.", { email: who }));
    await reload();
  };
  const add = async () => {
    setError("");
    if (!ref.current?.reportValidity()) return;
    try {
      await set(email.trim(), role);
      setEmail("");
    } catch (e) {
      setError(errText(e));
    }
  };
  return (
    <div className="sd-members stack-sm">
      {o.members.length ? (
        <div className="table-wrap">
          <table className="data sd-table">
            <thead>
              <tr>
                <th scope="col">{t("Customer email")}</th>
                <th scope="col">{t("Role")}</th>
                <th scope="col">{t("Joined")}</th>
                <th scope="col">
                  <span className="sr-only">{t("Actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {o.members.map((m) => (
                <tr key={m.email}>
                  <td data-label={t("Customer email")} className="sd-cell-title">
                    {m.email || t("Deleted account")}
                  </td>
                  <td data-label={t("Role")}>
                    <Badge tone={m.role === "admin" ? "accent" : "neutral"}>{m.role === "admin" ? t("Organization admin") : t("Member")}</Badge>
                  </td>
                  <td data-label={t("Joined")}>{longDate(isoDay(m.joined), lang)}</td>
                  <td data-label="">
                    {m.email ? (
                      <span className="row sd-row-tight">
                        <ActionButton className="btn sm ghost" onError={fail} run={() => set(m.email, m.role === "admin" ? "member" : "admin")}>
                          {m.role === "admin" ? t("Make member") : t("Make admin")}
                        </ActionButton>
                        <button
                          type="button"
                          className="btn sm danger"
                          onClick={() =>
                            confirm({
                              title: tf("Remove {email}?", { email: m.email }),
                              body: <p>{t("They lose access to this organization's documents in chat. They can join again with the current join code.")}</p>,
                              confirmLabel: t("Remove"),
                              danger: true,
                              run: () => set(m.email, "remove"),
                            })
                          }
                        >
                          {t("Remove")}
                        </button>
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="small muted">{t("No members yet. People join with the code, or you add them by email below.")}</p>
      )}
      <form
        ref={ref}
        className="sd-member-form"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <div className="field">
          <label htmlFor={id + "e"}>{t("Add a customer by email or username")}</label>
          <input id={id + "e"} className="input" type="text" required minLength={5} maxLength={180} autoComplete="off" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={id + "r"}>{t("Role")}</label>
          <select id={id + "r"} className="input" value={role} onChange={(e) => setRole(e.target.value as "member" | "admin")}>
            <option value="member">{t("Member")}</option>
            <option value="admin">{t("Organization admin (can upload documents)")}</option>
          </select>
        </div>
        <ActionButton className="btn sm primary" run={add}>
          {t("Add")}
        </ActionButton>
        {error ? (
          <p className="field-error sd-span" role="alert">
            {t(error)}
          </p>
        ) : null}
      </form>
    </div>
  );
}
