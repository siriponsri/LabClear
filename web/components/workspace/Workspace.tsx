"use client";
/*
 * Customer workspace (/app): header, navigation, the chat (always mounted so a reply in progress
 * survives switching views) and the other views from ./views. All data comes from the API; the
 * browser only renders and asks.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api/client";
import { useT } from "@/lib/i18n/client";
import { useSession } from "@/lib/session";
import { Dialog } from "@/components/ui/Dialog";
import { LanguageSwitch, ThemeToggle } from "@/components/site/Controls";
import { ChatView } from "@/components/chat/ChatView";
import { VIEWS } from "./views";
import { WorkspaceContext, type ViewId, type WorkspaceCtx, type WorkspaceState } from "./context";
import { Empty } from "./ui";

const NAV: { id: ViewId; label: string }[] = [
  { id: "chat", label: "Conversation" },
  { id: "packages", label: "Health checks" },
  { id: "book", label: "Request a time" },
  { id: "bookings", label: "My appointments" },
  { id: "labs", label: "Lab dashboard" },
  { id: "reports", label: "My reports" },
  { id: "orgs", label: "My organization" },
  { id: "plan", label: "Plan" },
];
const TITLES: Record<ViewId, string> = {
  chat: "Conversation",
  packages: "Health checks",
  book: "Request a time",
  bookings: "My appointments",
  labs: "Lab dashboard",
  reports: "My reports",
  plan: "Plan",
  notifications: "Notifications",
  orgs: "My organization",
};
const isView = (v: string | null): v is ViewId => !!v && v in TITLES;

export function Workspace() {
  const { t, tf, lang } = useT();
  const { user, notice, fail, openSignIn } = useSession();
  const router = useRouter();
  const search = useSearchParams();
  const [state, setState] = useState<WorkspaceState | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<ViewId>(() => (isView(search.get("view")) ? (search.get("view") as ViewId) : "chat"));
  const [params, setParams] = useState<Record<string, string>>(() => Object.fromEntries(search.entries()));
  const [dialog, setDialog] = useState<{ title: string; content: React.ReactNode } | null>(null);
  const [menu, setMenu] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [online, setOnline] = useState<null | boolean>(null);
  const composer = useRef<((text: string, send?: boolean) => void) | null>(null);
  const businessCache = useRef<Promise<any> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await api.get<WorkspaceState>("/workspace");
      setState(s);
      setUnread(s.unread_notifications || 0);
      return s;
    } catch (e) {
      if ((e as any).status === 401) {
        await api.session();
        const s = await api.get<WorkspaceState>("/workspace");
        setState(s);
        return s;
      }
      throw e;
    }
  }, []);

  const navigate = useCallback((next: ViewId, p: Record<string, string> = {}, push = true) => {
    if (!isView(next)) next = "chat";
    setView(next);
    setParams(p);
    setMenu(false);
    if (push) {
      const q = new URLSearchParams(next === "chat" ? {} : { view: next, ...p });
      window.history.pushState({ view: next }, "", "/app" + (q.toString() ? "?" + q : ""));
    }
    document.title = t(TITLES[next]) + " | LabClear";
  }, [t]);

  useEffect(() => {
    const pop = () => {
      const q = new URLSearchParams(location.search);
      const v = q.get("view");
      setView(isView(v) ? v : "chat");
      setParams(Object.fromEntries(q.entries()));
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await api.session();
        if (["staff", "manager", "clinical"].includes(s.user.role) && search.get("view") === "staff") {
          location.href = "/staff";
          return;
        }
        await refresh();
        if (alive) setReady(true);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
      api
        .get("/modes")
        .then((m) => alive && setOnline(m.modes?.assistant?.mode === "LIVE_MODEL"))
        .catch(() => alive && setOnline(null));
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Unread notifications every 20 seconds while the page is visible.
  useEffect(() => {
    const id = setInterval(async () => {
      if (document.hidden || !api.csrf) return;
      try {
        setUnread((await api.get("/notifications")).unread || 0);
      } catch {
        /* keep the last count */
      }
    }, 20000);
    return () => clearInterval(id);
  }, []);

  const ctx: WorkspaceCtx = useMemo(
    () => ({
      api,
      t,
      tf,
      lang,
      user,
      state,
      refresh,
      view,
      params,
      navigate,
      notice,
      fail,
      modal: (title, content) => setDialog({ title, content }),
      closeModal: () => setDialog(null),
      requireAccount: (reason) =>
        openSignIn({
          reason,
          guestMessages: state?.conversation.messages.length || 0,
          onDone: (_u, kept) => {
            refresh();
            notice(kept ? t("Signed in. This chat is now saved in your account.") : t("Signed in."));
          },
        }),
      business: () => {
        if (!businessCache.current)
          businessCache.current = Promise.all([api.get("/catalog"), api.get("/branches")]).then(([catalog, b]) => ({ catalog, branches: b.branches, maps_embed_key: b.maps_embed_key }));
        return businessCache.current;
      },
      ask: (text, send) => {
        navigate("chat");
        setTimeout(() => composer.current?.(text, send), 0);
      },
      registerComposer: (fn) => {
        composer.current = fn;
      },
      setUnread,
    }),
    [t, tf, lang, user, state, refresh, view, params, navigate, notice, fail, openSignIn],
  );

  const View = view === "chat" ? null : VIEWS[view];
  const registered = !!user?.registered;
  const staff = ["staff", "manager", "clinical"].includes(user?.role || "");

  return (
    <WorkspaceContext.Provider value={ctx}>
      <div className="ws-root workspace customer">
        <a className="skip" href="#workspace-main">
          {t("Skip to content")}
        </a>
        <div className="workspace-body">
          <header className="workspace-header">
            <Link href="/" className="brand">
              LabClear
            </Link>
            <nav className={"top-nav" + (menu ? " open" : "")} id="sidebar" aria-label={t("Workspace")}>
              {NAV.map((n) => (
                <button key={n.id} type="button" className={"nav-item" + (view === n.id ? " active" : "")} aria-current={view === n.id ? "page" : undefined} onClick={() => navigate(n.id)}>
                  {t(n.label)}
                </button>
              ))}
              {staff ? (
                <a className="nav-item" href="/staff">
                  {t("Staff inbox")}
                </a>
              ) : null}
            </nav>
            <h1 className="sr-only">{t(TITLES[view])}</h1>
            <div className="header-actions">
              <LanguageSwitch />
              <button
                type="button"
                className={"status-pill " + (online ? "ok" : online === false ? "off" : "")}
                onClick={() =>
                  setDialog({
                    title: t("Assistant and integrations"),
                    content: (
                      <p className="small">
                        {online
                          ? t("The conversation model is connected. Replies pass safety and evidence checks before they appear.")
                          : t("The conversation model is not connected or is paused. Browsing, booking, payments, reports review and our team still work; AI replies will show a clear error instead of an invented answer.")}
                      </p>
                    ),
                  })
                }
              >
                {online === null ? t("Checking") : online ? t("Assistant online") : t("Assistant offline")}
              </button>
              <ThemeToggle />
              <button type="button" className="icon-btn" aria-label={unread ? tf("Notifications, {n} unread", { n: unread }) : t("Notifications")} onClick={() => navigate("notifications")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 9a6 6 0 0 1 12 0c0 6.5 2.5 8 2.5 8h-17S6 15.5 6 9" />
                  <path d="M10.3 20.5a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                <span className="count" hidden={!unread}>
                  {unread > 99 ? "99+" : unread}
                </span>
              </button>
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  className={"avatar-button" + (registered ? "" : " guest")}
                  aria-haspopup="menu"
                  aria-expanded={accountOpen}
                  aria-label={registered ? t("Account") + ": " + user!.email : t("Sign in")}
                  onClick={() => {
                    if (!registered)
                      openSignIn({
                        guestMessages: state?.conversation.messages.length || 0,
                        onDone: async (_u, kept) => {
                          await refresh();
                          notice(kept ? t("Signed in. This chat is now saved in your account.") : t("Signed in."));
                        },
                      });
                    else setAccountOpen((o) => !o);
                  }}
                >
                  <span className="avatar" aria-hidden="true">
                    {registered ? user!.email[0]?.toUpperCase() : "?"}
                  </span>
                  <span className="signin-text" aria-hidden="true">
                    {registered ? "" : t("Sign in")}
                  </span>
                </button>
                {accountOpen && registered ? (
                  <div className="account-menu" role="menu" aria-label={t("Account")} onKeyDown={(e) => e.key === "Escape" && setAccountOpen(false)}>
                    <div className="menu-head">
                      <strong>
                        {user!.email}
                        {user!.demo ? " (demo)" : ""}
                      </strong>
                      <span className="tiny muted">{state?.plan?.plan === "plus" ? "LabClear Plus" : t("Free plan")}</span>
                    </div>
                    {(["bookings", "reports", "orgs", "plan"] as ViewId[]).map((v) => (
                      <button key={v} type="button" role="menuitem" className="menu-item" onClick={() => (setAccountOpen(false), navigate(v))}>
                        {t(TITLES[v])}
                      </button>
                    ))}
                    {staff ? (
                      <a role="menuitem" className="menu-item" href="/staff">
                        {t("Service desk")}
                      </a>
                    ) : null}
                    <a role="menuitem" className="menu-item" href="/">
                      {t("Website")}
                    </a>
                    {state?.line_linked ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="menu-item"
                        onClick={async () => {
                          setAccountOpen(false);
                          try {
                            await api.post("/account/line/unlink");
                            notice(t("LINE unlinked. Pending LINE deliveries were cancelled."));
                          } catch (e) {
                            fail(e);
                          }
                        }}
                      >
                        {t("Unlink LINE")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      role="menuitem"
                      className="menu-item danger"
                      onClick={async () => {
                        try {
                          await api.logout();
                        } finally {
                          location.href = "/";
                        }
                      }}
                    >
                      {t("Sign out")}
                    </button>
                  </div>
                ) : null}
              </div>
              <button type="button" className="icon-btn mobile-menu" aria-label={menu ? t("Close navigation") : t("Open navigation")} aria-expanded={menu} aria-controls="sidebar" onClick={() => setMenu((m) => !m)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </header>
          <main id="workspace-main" tabIndex={-1}>
            {error ? (
              <section className="view content-view">
                <Empty title={t("This view could not be loaded")} actions={<button className="btn sm" onClick={() => location.reload()}>{t("Try again")}</button>}>
                  {error}
                </Empty>
              </section>
            ) : null}
            {ready ? (
              <>
                <section className="view chat-view" aria-label={t("Conversation")} hidden={view !== "chat"}>
                  <ChatView />
                </section>
                {View ? (
                  <section className="view content-view">
                    <div id="content">
                      <View key={view + JSON.stringify(params)} />
                    </div>
                  </section>
                ) : null}
              </>
            ) : !error ? (
              <section className="view content-view" aria-busy="true">
                <div className="skeleton" />
              </section>
            ) : null}
          </main>
        </div>
        <Dialog open={!!dialog} onClose={() => setDialog(null)} title={dialog?.title || ""}>
          {dialog?.content}
        </Dialog>
      </div>
    </WorkspaceContext.Provider>
  );
}
