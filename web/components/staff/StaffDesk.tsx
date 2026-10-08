"use client";
/*
 * Service desk (/staff): side navigation, header, sign-in gate and the staff views in ./views.
 * The server owns identity, prices, capacity, payment state and permissions; this page renders
 * and asks. The view lives in the URL (?view=...), kept in sync with history push/popstate.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { api, type User } from "@/lib/api/client";
import { useT } from "@/lib/i18n/client";
import type { T } from "@/lib/i18n/shared";
import { useSession } from "@/lib/session";
import { Dialog } from "@/components/ui/Dialog";
import { LanguageSwitch, ThemeToggle } from "@/components/site/Controls";
import { Empty, Intro, Skeleton } from "@/components/workspace/ui";
import { StaffContext, MANAGER_VIEWS, isViewId, type Biz, type ConfirmOptions, type Counts, type StaffCtx, type ViewId } from "./context";
import { ConfirmBody, Icon, modeLabel } from "./parts";
import { VIEWS } from "./views";
import "@/app/styles/staff.css";

const STAFF_ROLES = ["staff", "manager", "clinical"];

export const viewTitles = (t: T): Record<ViewId, string> => ({
  overview: t("Overview"),
  staff: t("Inbox"),
  operations: t("Appointments"),
  customers: t("Customers"),
  payments: t("Payments"),
  notifications: t("Notifications"),
  "catalog-admin": t("Catalog and prices"),
  centers: t("Centers and capacity"),
  roles: t("Assistant roles"),
  ai: t("AI providers"),
  channels: t("Channels and budget"),
  audit: t("Audit log"),
  organizations: t("Organizations"),
  knowledge: t("Reference document review"),
});

const NAV_MAIN: ViewId[] = ["overview", "staff", "operations", "customers", "payments", "notifications"];
const NAV_MANAGE: ViewId[] = ["catalog-admin", "centers", "roles", "ai", "channels", "audit"];
const NAV_KNOWLEDGE: ViewId[] = ["organizations", "knowledge"];

const NARROW = "(max-width: 860px)";
function useNarrow() {
  return useSyncExternalStore(
    (fn) => {
      const m = matchMedia(NARROW);
      m.addEventListener("change", fn);
      return () => m.removeEventListener("change", fn);
    },
    () => matchMedia(NARROW).matches,
    () => false,
  );
}

type Phase = "checking" | "signed-out" | "ready" | "error";

export function StaffDesk() {
  const { t, tf, lang } = useT();
  const { user, notice, fail, openSignIn } = useSession();
  const search = useSearchParams();
  const [phase, setPhase] = useState<Phase>("checking");
  const [loadError, setLoadError] = useState("");
  const [dialog, setDialog] = useState<{ title: string; content: React.ReactNode } | null>(null);
  const [menu, setMenu] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [counts, setCounts] = useState<Counts>({ waiting: 0, requested: 0, pendingDocs: 0 });
  const [online, setOnline] = useState<null | boolean>(null);
  const [modes, setModes] = useState<Record<string, { mode: string; label: string }> | null>(null);
  const [biz, setBiz] = useState<Biz | null>(null);
  const bizPromise = useRef<Promise<Biz> | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const narrow = useNarrow();

  const staff = !!user && STAFF_ROLES.includes(user.role);
  const manager = user?.role === "manager";

  // The view is derived from the URL; pushState/popstate update useSearchParams.
  const requested = search.get("view") === "inbox" ? "staff" : search.get("view");
  let view: ViewId = isViewId(requested) ? requested : "overview";
  if (!manager && MANAGER_VIEWS.includes(view)) view = "overview";
  const paramString = search.toString();
  const params = useMemo(() => {
    const p = Object.fromEntries(new URLSearchParams(paramString).entries());
    delete p.view;
    return p;
  }, [paramString]);
  const titles = viewTitles(t);

  const navigate = useCallback(
    (next: ViewId, p: Record<string, string> = {}) => {
      const q = new URLSearchParams(next === "overview" ? p : { view: next, ...p });
      window.history.pushState(null, "", "/staff" + (q.toString() ? "?" + q : ""));
      setMenu(false);
      if (narrow) setTimeout(() => mainRef.current?.focus({ preventScroll: true }), 0);
      window.scrollTo({ top: 0 });
    },
    [narrow],
  );

  useEffect(() => {
    document.title = titles[view] + " | LabClear";
  }, [titles, view]);

  // Who is here: /me never creates a guest session. Staff continue, everyone else signs in.
  useEffect(() => {
    let alive = true;
    api
      .me()
      .then((u) => {
        if (!alive) return;
        if (u && STAFF_ROLES.includes(u.role)) setPhase("ready");
        else {
          setPhase("signed-out");
          openSignIn({ staff: true, onDone: () => location.reload() });
        }
      })
      .catch((e) => alive && (setPhase("error"), setLoadError((e as Error).message)));
    return () => {
      alive = false;
    };
  }, [openSignIn]);

  const business = useCallback((fresh = false) => {
    if (fresh || !bizPromise.current) {
      bizPromise.current = Promise.all([api.get("/catalog"), api.get("/branches")]).then(([catalog, b]) => {
        const next = { catalog, branches: b.branches };
        setBiz(next);
        return next;
      });
      bizPromise.current.catch(() => {
        bizPromise.current = null;
      });
    }
    return bizPromise.current;
  }, []);

  const refreshCounts = useCallback(async () => {
    if (!api.user || !STAFF_ROLES.includes(api.user.role)) return;
    try {
      const [d, docs] = await Promise.all([
        api.get("/staff/dashboard?days=1"),
        api.user.role === "manager" ? api.get("/staff/org-documents?state=pending") : Promise.resolve({ documents: [] }),
      ]);
      setCounts({ waiting: d.tickets.waiting || 0, requested: d.bookings.by_state.requested || 0, pendingDocs: docs.documents.length });
    } catch {
      /* counts are a convenience */
    }
  }, []);

  const pollBell = useCallback(async () => {
    if (!api.user || !STAFF_ROLES.includes(api.user.role)) return;
    try {
      setUnread((await api.get("/staff/notifications")).unread || 0);
    } catch {
      /* keep the last count */
    }
  }, []);

  const checkModes = useCallback(async () => {
    try {
      const m = (await api.get("/modes")).modes;
      setModes(m);
      setOnline(m.assistant?.mode === "LIVE_MODEL");
    } catch {
      setOnline(null);
    }
  }, []);

  useEffect(() => {
    if (phase !== "ready") return;
    business().catch(() => {});
    pollBell();
    checkModes();
    const id = setInterval(() => {
      if (document.hidden) return;
      pollBell();
      refreshCounts();
    }, 20000);
    return () => clearInterval(id);
  }, [phase, business, pollBell, checkModes, refreshCounts]);

  // Counts follow every view change (a decision in one view changes another view's badge).
  useEffect(() => {
    if (phase === "ready") refreshCounts();
  }, [phase, view, paramString, refreshCounts]);

  // Off-canvas navigation: Escape closes it, and focus returns to the menu button.
  useEffect(() => {
    if (!menu) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", key);
    sidebarRef.current?.querySelector<HTMLElement>(".nav-item, .account-button")?.focus();
    return () => document.removeEventListener("keydown", key);
  }, [menu]);
  useEffect(() => {
    if (!narrow) setMenu(false);
  }, [narrow]);

  // Account menu: outside click and Escape close it; arrows move between items.
  useEffect(() => {
    if (!accountOpen) return;
    const click = (e: MouseEvent) => {
      if (!accountRef.current?.contains(e.target as Node)) setAccountOpen(false);
    };
    document.addEventListener("click", click);
    accountRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => document.removeEventListener("click", click);
  }, [accountOpen]);

  const confirm = useCallback((o: ConfirmOptions) => setDialog({ title: o.title, content: <ConfirmBody o={o} /> }), []);
  const branchName = useCallback((id: string) => biz?.branches.find((b) => b.id === id)?.name || id || "Any center", [biz]);

  const ctx: StaffCtx | null = useMemo(
    () =>
      user && staff
        ? {
            t,
            tf,
            lang,
            user,
            manager,
            view,
            params,
            navigate,
            notice,
            fail,
            modal: (title, content) => setDialog({ title, content }),
            closeModal: () => setDialog(null),
            dialogOpen: !!dialog,
            confirm,
            biz,
            business,
            branchName,
            counts,
            refreshCounts,
            setUnread,
          }
        : null,
    [t, tf, lang, user, staff, manager, view, params, navigate, notice, fail, dialog, confirm, biz, business, branchName, counts, refreshCounts],
  );

  const openStatus = () =>
    setDialog({
      title: t("Assistant and integrations"),
      content: <StatusPanel online={online} modes={modes} manager={manager} onOpenAi={() => (setDialog(null), navigate("ai"))} />,
    });

  const View = VIEWS[view];
  const ready = phase === "ready" && ctx;

  const navButton = (id: ViewId, count = 0, countLabel = "") => (
    <button
      key={id}
      type="button"
      className={"nav-item" + (view === id ? " active" : "")}
      aria-current={view === id ? "page" : undefined}
      onClick={() => navigate(id)}
    >
      <span>{titles[id]}</span>
      {count ? (
        <span className="nav-count" aria-label={countLabel}>
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </button>
  );

  const shell = (
    <div className={"ws-root workspace staff" + (menu ? " sd-menu-open" : "")}>
      <a className="skip" href="#workspace-main">
        {t("Skip to content")}
      </a>
      <aside
        className={"sidebar" + (menu ? " open" : "")}
        id="sidebar"
        ref={sidebarRef}
        aria-label={t("Service desk navigation")}
        inert={narrow && !menu}
      >
        <Link href="/" className="brand">
          LabClear
        </Link>
        <p className="side-label">{t("Service desk")}</p>
        {ready ? (
          <nav className="side-nav" aria-label={t("Service desk")}>
            {navButton("overview")}
            {navButton("staff", counts.waiting, tf("{n} waiting for a person", { n: counts.waiting }))}
            {navButton("operations", counts.requested, tf("{n} awaiting confirmation", { n: counts.requested }))}
            {NAV_MAIN.slice(3).map((id) => navButton(id))}
            {manager ? (
              <>
                <span className="nav-group">{t("Manage")}</span>
                {NAV_MANAGE.map((id) => navButton(id))}
                <span className="nav-group">{t("Knowledge and organizations")}</span>
                {navButton(NAV_KNOWLEDGE[0])}
                {navButton(NAV_KNOWLEDGE[1], counts.pendingDocs, tf("{n} documents to review", { n: counts.pendingDocs }))}
              </>
            ) : null}
          </nav>
        ) : null}
        <div className="sidebar-bottom" ref={accountRef}>
          <button
            className="account-button"
            type="button"
            aria-haspopup={staff ? "menu" : undefined}
            aria-expanded={staff ? accountOpen : undefined}
            onClick={() => (staff ? setAccountOpen((o) => !o) : openSignIn({ staff: true, onDone: () => location.reload() }))}
          >
            <span className="avatar" aria-hidden="true">
              {staff ? user!.email[0]?.toUpperCase() : "?"}
            </span>
            <span className="account-text">
              <strong>{staff ? user!.email + (user!.demo ? " (demo)" : "") : t("Not signed in")}</strong>
              <small>{staff ? roleLine(t, user!) : t("Staff sign-in")}</small>
            </span>
          </button>
          {accountOpen && staff ? (
            <AccountMenu
              user={user!}
              onClose={() => setAccountOpen(false)}
              onKey={(e) => {
                if (e.key === "Escape") {
                  setAccountOpen(false);
                  accountRef.current?.querySelector<HTMLElement>(".account-button")?.focus();
                }
              }}
            />
          ) : null}
          <a href="/help" className="small">
            {t("Help and policies")}
          </a>
        </div>
      </aside>
      <div className="sd-scrim" onClick={() => setMenu(false)} aria-hidden="true" />
      <div className="workspace-body">
        <header className="workspace-header">
          <button
            ref={toggleRef}
            className="icon-btn mobile-menu"
            type="button"
            aria-label={menu ? t("Close navigation") : t("Open navigation")}
            aria-expanded={menu}
            aria-controls="sidebar"
            onClick={() => setMenu((m) => !m)}
          >
            <Icon name="menu" size={18} />
          </button>
          <h1>{ready ? titles[view] : t("Service desk")}</h1>
          <div className="header-actions">
            <LanguageSwitch />
            {ready ? (
              <button type="button" className={"status-pill " + (online ? "ok" : online === false ? "off" : "")} onClick={openStatus}>
                {online === null ? t("Checking") : online ? t("Assistant online") : t("Assistant offline")}
              </button>
            ) : null}
            <ThemeToggle />
            {ready ? (
              <button
                type="button"
                className="icon-btn"
                aria-label={unread ? tf("Notifications, {n} unread", { n: unread }) : t("Notifications")}
                onClick={() => navigate("notifications")}
              >
                <Icon name="bell" size={18} />
                <span className="count" hidden={!unread}>
                  {unread > 99 ? "99+" : unread}
                </span>
              </button>
            ) : null}
          </div>
        </header>
        <main id="workspace-main" ref={mainRef} tabIndex={-1}>
          <section className="view content-view" aria-busy={phase === "checking" || undefined}>
            <div id="content">
              {phase === "checking" ? (
                <Skeleton />
              ) : phase === "error" ? (
                <Empty
                  title={t("The service desk could not be loaded")}
                  actions={
                    <button type="button" className="btn sm" onClick={() => location.reload()}>
                      {t("Try again")}
                    </button>
                  }
                >
                  {t(loadError)}
                </Empty>
              ) : !ready ? (
                <div>
                  <Intro title={t("Service desk")}>{t("Customer requests, appointments, payments and settings for the LabClear team.")}</Intro>
                  <Empty
                    title={t("Staff sign-in required")}
                    actions={
                      <button type="button" className="btn primary sm" onClick={() => openSignIn({ staff: true, onDone: () => location.reload() })}>
                        {t("Sign in")}
                      </button>
                    }
                  >
                    {user?.registered ? tf("You are signed in as {email}, which is not a staff account.", { email: user.email }) : t("Use an account created by the deployment owner.")}
                  </Empty>
                </div>
              ) : (
                <View key={view + "?" + paramString} />
              )}
            </div>
          </section>
        </main>
      </div>
      <Dialog open={!!dialog} onClose={() => setDialog(null)} title={dialog?.title || ""}>
        {dialog?.content}
      </Dialog>
    </div>
  );

  return ctx ? <StaffContext.Provider value={ctx}>{shell}</StaffContext.Provider> : shell;
}

function roleLine(t: T, u: User) {
  const role = u.role === "manager" ? t("Manager") : u.role === "clinical" ? t("Clinical staff") : t("Staff member");
  return role + (u.branch ? " · " + u.branch : "");
}

function AccountMenu({ user, onClose, onKey }: { user: User; onClose: () => void; onKey: (e: React.KeyboardEvent) => void }) {
  const { t } = useT();
  const { fail } = useSession();
  const move = (e: React.KeyboardEvent<HTMLDivElement>) => {
    onKey(e);
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>("[role=menuitem]")];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };
  return (
    <div className="account-menu" role="menu" aria-label={t("Account")} onKeyDown={move}>
      <div className="menu-head">
        <strong>
          {user.email}
          {user.demo ? " (demo)" : ""}
        </strong>
        <span className="tiny muted">{roleLine(t, user)}</span>
      </div>
      <a role="menuitem" className="menu-item" href="/app" onClick={onClose}>
        {t("Customer app")}
      </a>
      <a role="menuitem" className="menu-item" href="/" onClick={onClose}>
        {t("Website")}
      </a>
      <button
        type="button"
        role="menuitem"
        className="menu-item danger"
        onClick={async () => {
          onClose();
          try {
            await api.logout();
            location.href = "/staff";
          } catch (e) {
            fail(e);
          }
        }}
      >
        {t("Sign out")}
      </button>
    </div>
  );
}

function StatusPanel({ online, modes, manager, onOpenAi }: { online: boolean | null; modes: Record<string, { mode: string; label: string }> | null; manager: boolean; onOpenAi: () => void }) {
  const { t } = useT();
  const { notice } = useSession();
  const [code, setCode] = useState("");
  return (
    <div className="stack">
      <p className="small">
        {online
          ? t("The conversation model is connected. Replies pass safety and evidence checks before they appear.")
          : t("The conversation model is not connected or is paused. Browsing, booking, payments, reports review and our team still work; AI replies will show a clear error instead of an invented answer.")}
      </p>
      {modes ? (
        <ul className="plain small">
          {Object.entries(modes).map(([k, x]) => (
            <li key={k} className="row" style={{ justifyContent: "space-between" }}>
              <span>{t(x.label)}</span>
              <span className="badge neutral">{modeLabel(t, x.mode)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          api.accessCode = code;
          setCode("");
          notice(t("Access code set for this tab only."));
        }}
      >
        <div className="field">
          <label htmlFor="sd-access">{t("Demo access code for this tab")}</label>
          <span className="hint">{t("Only if the deployment owner gave you one")}</span>
          <input id="sd-access" className="input" type="password" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn sm">
            {t("Use access code")}
          </button>
          {manager ? (
            <button type="button" className="btn sm ghost" onClick={onOpenAi}>
              {t("Open AI providers")}
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
