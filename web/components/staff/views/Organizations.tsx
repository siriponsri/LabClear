"use client";
/*
 * Organization membership (manager). Integration 4.0: Claude's 4.0.0 "Organizations" view is
 * replaced by the Codex model (PUT /api/business/organization-documents/membership): a manager
 * assigns a registered account to an organization ID as a reader or an editor. Organization
 * editors then upload and review their own documents in My organization; staff do not review them.
 * The page only works when the owner has turned on ORG_DOCUMENTS_ENABLED.
 */
import { useId, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { ActionButton, Badge, Empty, Intro } from "@/components/workspace/ui";
import { useStaff } from "../context";
import { Loaded, errText, useLoad } from "../parts";

type Features = { org_documents: boolean; org_reference_inference: boolean };
type Customer = { id: string; label: string };

export function Organizations() {
  const { t } = useStaff();
  const state = useLoad(
    () =>
      Promise.all([
        api.get<Features>("/site/features"),
        api.get<{ customers: Customer[] }>("/staff/customers").catch(() => ({ customers: [] as Customer[] })),
      ]),
    [],
  );
  return (
    <div>
      <Intro title={t("Organization membership")}>
        {t("Add a registered account to a hospital, clinic or company as a reader or an editor. Editors upload and approve their organization's documents in My organization; readers see approved documents only. Changes take effect on the member's next request.")}
      </Intro>
      <Loaded state={state}>
        {([features, customers]) =>
          !features.org_documents ? (
            <Empty title={t("Organization documents are not switched on")}>
              {t("The deployment owner turns this on with ORG_DOCUMENTS_ENABLED. Saving members is refused until then.")}
            </Empty>
          ) : (
            <div className="stack">
              <MembershipForm customers={customers.customers} />
              <section className="card stack-sm">
                <h3>{t("Before you add members")}</h3>
                <ul className="small">
                  <li>{t("Use synthetic organizations and documents until rights and clinical review are approved.")}</li>
                  <li>{t("An account belongs to one organization at a time; saving again moves it.")}</li>
                  <li>
                    {features.org_reference_inference
                      ? t("Approved excerpts may be sent to the configured AI providers for members' chats.")
                      : t("The assistant does not receive organization documents (ORG_REFERENCE_INFERENCE_ENABLED is off).")}
                  </li>
                </ul>
              </section>
            </div>
          )
        }
      </Loaded>
    </div>
  );
}

function MembershipForm({ customers }: { customers: Customer[] }) {
  const { t, tf, notice } = useStaff();
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const [user, setUser] = useState("");
  const [org, setOrg] = useState("org_");
  const [role, setRole] = useState<"reader" | "editor">("reader");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ user: string; org: string; role: string } | null>(null);
  const save = async () => {
    setError("");
    if (!form.current?.reportValidity()) return;
    try {
      await api.put("/organization-documents/membership", { user_id: user.trim(), organization_id: org.trim(), role });
      setSaved({ user: user.trim(), org: org.trim(), role });
      notice(t("Membership saved."));
    } catch (e) {
      setError(errText(e));
    }
  };
  return (
    <section className="card stack" aria-labelledby={id + "h"}>
      <h3 id={id + "h"}>{t("Add or change a member")}</h3>
      <form
        ref={form}
        className="form-grid two"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="field">
          <label htmlFor={id + "u"}>{t("Account ID")}</label>
          <span className="hint">{t("Shown to the customer under My organization. Customers with activity are suggested.")}</span>
          <input id={id + "u"} className="input mono" list={id + "list"} required maxLength={100} autoComplete="off" spellCheck={false} value={user} onChange={(e) => setUser(e.target.value)} />
          <datalist id={id + "list"}>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </datalist>
        </div>
        <div className="field">
          <label htmlFor={id + "o"}>{t("Organization ID")}</label>
          <span className="hint">{t("Lowercase, starting with org_, for example org_synthetic_clinic")}</span>
          <input id={id + "o"} className="input mono" required pattern="org_[a-z0-9_\-]{1,60}" maxLength={64} autoComplete="off" spellCheck={false} value={org} onChange={(e) => setOrg(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={id + "r"}>{t("Role")}</label>
          <select id={id + "r"} className="input" value={role} onChange={(e) => setRole(e.target.value as "reader" | "editor")}>
            <option value="reader">{t("Reader: sees approved documents")}</option>
            <option value="editor">{t("Editor: uploads and reviews documents")}</option>
          </select>
        </div>
        {error ? (
          <p className="field-error wide" role="alert">
            {t(error)}
          </p>
        ) : null}
        <div className="form-actions wide">
          <ActionButton className="btn primary sm" run={save}>
            {t("Save membership")}
          </ActionButton>
        </div>
      </form>
      {saved ? (
        <p className="small" role="status">
          <Badge tone="ok">{t("Saved")}</Badge> {tf("{user} is now {role} of {org}.", { user: saved.user, org: saved.org, role: saved.role === "editor" ? t("an editor") : t("a reader") })}
        </p>
      ) : null}
    </section>
  );
}
