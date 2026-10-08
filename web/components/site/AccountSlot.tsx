"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { useT } from "@/lib/i18n/client";
import { useSession } from "@/lib/session";

const STAFF = ["staff", "manager", "clinical"];

/** Website header: "Sign in", or the signed-in customer's menu. Never creates a guest session. */
export function AccountSlot() {
  const { t } = useT();
  const { user, openSignIn, fail } = useSession();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    api.me().catch(() => {});
  }, []);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  if (!user?.registered) {
    return (
      <div className="nav-account">
        <button className="nav-signin nav-account-btn" type="button" onClick={() => openSignIn({ onDone: (u) => (location.href = STAFF.includes(u.role) ? "/staff" : location.pathname === "/" ? "/app" : location.href) })}>
          {t("Sign in")}
        </button>
      </div>
    );
  }
  const staff = STAFF.includes(user.role);
  return (
    <div className="nav-account" ref={box}>
      <button className="nav-avatar" type="button" aria-haspopup="menu" aria-expanded={open} aria-label={t("Account") + ": " + user.email} onClick={() => setOpen((o) => !o)}>
        <span className="avatar-letter">{user.email[0]?.toUpperCase()}</span>
      </button>
      <div
        className="account-pop"
        role="menu"
        hidden={!open}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        <div className="menu-head">
          <strong>
            {user.email}
            {user.demo ? " (demo)" : ""}
          </strong>
          <span className="tiny muted">{staff ? (user.role === "manager" ? t("Manager") : t("Staff")) : t("Customer")}</span>
        </div>
        <a className="menu-item" role="menuitem" href="/app">
          {t("Chat and lab reports")}
        </a>
        <a className="menu-item" role="menuitem" href="/app?view=bookings">
          {t("My appointments")}
        </a>
        <a className="menu-item" role="menuitem" href="/app?view=labs">
          {t("My results")}
        </a>
        <a className="menu-item" role="menuitem" href="/app?view=orgs">
          {t("My organization")}
        </a>
        {staff ? (
          <a className="menu-item" role="menuitem" href="/staff">
            {t("Service desk")}
          </a>
        ) : null}
        <button
          className="menu-item danger"
          role="menuitem"
          type="button"
          onClick={async () => {
            try {
              await api.logout();
            } catch (e) {
              fail(e);
            } finally {
              location.reload();
            }
          }}
        >
          {t("Sign out")}
        </button>
      </div>
    </div>
  );
}
