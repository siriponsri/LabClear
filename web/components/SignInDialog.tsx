"use client";
import { useEffect, useRef, useState } from "react";
import { api, type User } from "@/lib/api/client";
import { useT } from "@/lib/i18n/client";
import { apiMessage } from "@/lib/i18n/shared";
import { Dialog } from "@/components/ui/Dialog";

export type SignInOptions = {
  /** staff: service desk wording, no "Create account", no Google. */
  staff?: boolean;
  /** Messages in this page's temporary chat; > 0 warns that signing in deletes them. */
  guestMessages?: number;
  /** Called after a successful sign-in or registration. */
  onDone?: (user: User) => void;
  reason?: string;
};

const STAFF_ROLES = ["staff", "manager", "clinical"];

export function SignInDialog({ options, onClose }: { options: SignInOptions | null; onClose: () => void }) {
  const { t, lang } = useT();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const open = !!options;
  const staff = !!options?.staff;
  const guestMessages = options?.guestMessages || 0;

  useEffect(() => {
    if (open) {
      setError("");
    }
  }, [open]);

  async function submit(kind: "login" | "register") {
    if (!form.current?.reportValidity()) return;
    const data = new FormData(form.current);
    setBusy(true);
    setError("");
    try {
      const r = await api.auth(kind, String(data.get("email") || ""), String(data.get("password") || ""));
      onClose();
      if (STAFF_ROLES.includes(r.user.role) && !staff && !location.pathname.startsWith("/staff")) {
        location.href = "/staff";
        return;
      }
      options?.onDone?.(r.user);
    } catch (e) {
      setError(apiMessage(lang, (e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  const next = typeof window !== "undefined" ? location.pathname + location.search : "/app";
  return (
    <Dialog open={open} onClose={onClose} title={staff ? t("Staff sign-in") : t("Sign in or create an account")} className="signin-dialog" labelledBy="signin-title">
      <div className="stack">
        {options?.reason ? <p>{options.reason}</p> : null}
        {!staff && api.google ? (
          <>
            <a className="btn google-btn" href={"/api/business/auth/google/start?next=" + encodeURIComponent(next)}>
              {t("Continue with Google")}
            </a>
            <p className="tiny muted or-line">{t("or use your email")}</p>
          </>
        ) : null}
        <form
          ref={form}
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            submit("login");
          }}
        >
          <div className="field">
            <label htmlFor="si-email">{t("Email or username")}</label>
            <input id="si-email" name="email" className="input" type="text" required autoComplete="username" spellCheck={false} minLength={3} maxLength={180} autoFocus />
          </div>
          <div className="field">
            <label htmlFor="si-pass">{t("Password")}</label>
            <input id="si-pass" name="password" className="input" type="password" required autoComplete="current-password" minLength={4} maxLength={200} />
            {!staff ? <span className="hint">{t("New accounts need at least 12 characters.")}</span> : null}
          </div>
          {!staff ? (
            <p className={"tiny" + (guestMessages > 0 ? " callout warn guest-discard" : " muted")}>
              {t("Signing in or creating an account discards this temporary chat and its images.")}
            </p>
          ) : null}
          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="form-actions">
            <button className="btn primary" type="submit" disabled={busy}>
              {t("Sign in")}
            </button>
            {!staff ? (
              <button className="btn" type="button" disabled={busy} onClick={() => submit("register")}>
                {t("Create account")}
              </button>
            ) : null}
          </div>
          {staff ? <p className="tiny muted">{t("Staff accounts are created by the deployment owner with scripts/create_staff.py.")}</p> : null}
        </form>
      </div>
    </Dialog>
  );
}
