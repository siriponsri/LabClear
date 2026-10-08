"use client";
/*
 * The compact chat panel of the website dock. Same conversation, engine and turns as /app; the
 * page the visitor is viewing is sent as context. Shortcuts only navigate (client-side, so a
 * guest chat survives) or prefill; the visitor confirms every action.
 */
import "@/app/styles/chat.css";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api } from "@/lib/api/client";
import { useT } from "@/lib/i18n/client";
import { useSession } from "@/lib/session";
import { Dialog } from "@/components/ui/Dialog";
import { useChatEngine } from "./engine";
import { Feed, useStableHandlers, useStableMessages } from "./Feed";
import { Composer, type ComposerHandle } from "./Composer";
import { GuestNote, useLeaveGuard } from "./guest";
import { Icon } from "./icons";
import { HandoffForm, ImageView, ModalContext, ReportReview, UpgradeView, type Modal } from "./dialogs";
import { confirmAction, shortcutView, sitePageContext } from "./shared";
import type { ChatMessage, WorkspaceState } from "./types";
import type { DockSeed } from "./Dock";

const SHOWN = 10;

function useApiUser() {
  return useSyncExternalStore(
    (fn) => api.subscribe(fn),
    () => api.user,
    () => null,
  );
}

function contextLine(path: string, t: (s: string) => string, tf: (s: string, v: Record<string, string | number>) => string) {
  const c = sitePageContext();
  if (c.package_id) return tf("Answers with {name} in mind.", { name: document.querySelector("main h1")?.textContent?.trim() || c.package_id });
  if (c.compare_ids?.length) return tf("Answers with your comparison of {n} packages in mind.", { n: c.compare_ids.length });
  if (path === "/packages") return t("Answers with the catalog you are browsing in mind.");
  if (path === "/organizations") return t("Answers with your organization request in mind.");
  return t("Replies in your language. General information, not a diagnosis.");
}

export default function DockPanel({ open, onClose, seed }: { open: boolean; onClose: () => void; seed: DockSeed }) {
  const { t, tf } = useT();
  const { notice, fail, openSignIn } = useSession();
  const router = useRouter();
  const path = usePathname();
  const user = useApiUser();
  const registered = !!user?.registered;
  const [state, setState] = useState<WorkspaceState | null>(null);
  const [error, setError] = useState("");
  const [online, setOnline] = useState<boolean | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [line, setLine] = useState("");
  const composer = useRef<ComposerHandle>(null);
  const panel = useRef<HTMLElement>(null);
  const loading = useRef<Promise<WorkspaceState | null> | null>(null);

  const modalApi = useMemo(
    () => ({
      open: (title: string, node: React.ReactNode, className?: string) => setModal({ title, node, className }),
      close: () => setModal(null),
    }),
    [],
  );

  const refresh = useCallback(async (): Promise<WorkspaceState | null> => {
    if (loading.current) return loading.current;
    loading.current = (async () => {
      try {
        if (!api.csrf) await api.session();
        let s: WorkspaceState;
        try {
          s = await api.get<WorkspaceState>("/workspace");
        } catch (e) {
          if ((e as { status?: number }).status !== 401) throw e;
          await api.session();
          s = await api.get<WorkspaceState>("/workspace");
        }
        setState(s);
        setError("");
        return s;
      } catch (e) {
        setError(t((e as Error).message));
        return null;
      } finally {
        loading.current = null;
      }
    })();
    return loading.current;
  }, [t]);

  const upgrade = useCallback(
    (reason: string) => modalApi.open(t("This needs LabClear Plus"), <UpgradeView reason={reason} onPlan={() => router.push("/app?view=plan")} />),
    [modalApi, router, t],
  );

  const engine = useChatEngine({ surface: "dock", state, refresh, page: sitePageContext, upgrade, afterTurn: () => composer.current?.focus() });
  const all = useStableMessages(state?.conversation.messages as ChatMessage[] | undefined);
  const messages = useMemo(() => all.slice(-SHOWN), [all]);
  const mode = state?.conversation.mode || "bot";
  const guestCount = all.length + (engine.live?.user ? 1 : 0);
  useLeaveGuard(!registered && guestCount > 0);

  const signedIn = useCallback(
    async (kept: number) => {
      await refresh();
      notice(kept ? t("Signed in. This chat is now saved in your account.") : t("Signed in."));
    },
    [notice, refresh, t],
  );
  const requireAccount = useCallback(
    (reason: string) => openSignIn({ reason, guestMessages: guestCount, onDone: (_u, kept) => signedIn(kept) }),
    [guestCount, openSignIn, signedIn],
  );

  const handlers = useStableHandlers({
    interactive: true,
    retry: engine.retry,
    cardRetry: engine.cardRetry,
    followup: (q) => engine.send(q),
    staff: () => {
      if (!registered) return requireAccount(t("Sign in to send a request to our team. You can keep this chat in your account."));
      modalApi.open(t("Talk to our team"), <HandoffForm onSent={refresh} />);
    },
    followupCheck: () => engine.send(t("Is there a follow-up check for the items in this report?")),
    shortcut: (cmd) => shortcutView(cmd, t, tf, {}),
    confirmAction: (m) => confirmAction(m, { t, notice, fail, refresh, requireAccount }),
    confirmCard: (id) => engine.confirmCard(id),
    editCard: (m) => modalApi.open(t("Edit values"), <ReportReview reportId={m.report_id || ""} onConfirm={(fields) => engine.confirmCard(m.id, fields)} />, "wide"),
    discardCard: engine.discardCard,
    openImage: (src, name) => modalApi.open(t("Report image"), <ImageView src={src} name={name} />, "wide"),
    isBusy: () => engine.busyRef.current,
  });

  // First open: start (or resume) the session and load the chat. Assistant status once.
  const started = useRef(false);
  useEffect(() => {
    if (!open || started.current) return;
    started.current = true;
    refresh();
    api
      .get("/modes")
      .then((m) => setOnline(m?.modes?.assistant?.mode === "LIVE_MODEL"))
      .catch(() => setOnline(null));
  }, [open, refresh]);

  // Signing in or out elsewhere on the page (header) switches the chat.
  const userId = user?.id || "";
  const lastUser = useRef(userId);
  useEffect(() => {
    if (lastUser.current === userId) return;
    lastUser.current = userId;
    if (started.current && userId) refresh();
  }, [refresh, userId]);

  // Refresh every 5 seconds while open and idle.
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => {
      if (document.hidden || engine.busyRef.current || !api.csrf || document.querySelector("dialog[open]")) return;
      refresh();
    }, 5000);
    return () => clearInterval(id);
  }, [engine.busyRef, open, refresh]);

  // Focus the message box when opened; prefill or send what the opener asked for.
  useEffect(() => {
    if (open) requestAnimationFrame(() => composer.current?.focus());
  }, [open]);
  const seeded = useRef(0);
  useEffect(() => {
    if (!seed || seeded.current === seed.n || !state) return;
    seeded.current = seed.n;
    if (seed.send && engine.send(seed.text)) return;
    composer.current?.set(seed.text);
  }, [seed, state, engine]);

  // The page context line follows client navigation (the heading renders after the route changes).
  useEffect(() => {
    const id = setTimeout(() => setLine(contextLine(path, t, tf)), 60);
    return () => clearTimeout(id);
  }, [path, t, tf]);

  // On phones the panel fills the visible area above the keyboard.
  useEffect(() => {
    const vv = window.visualViewport;
    const el = panel.current;
    if (!vv || !el || !open) return;
    const update = () => el.style.setProperty("--dock-vh", Math.round(vv.height) + "px");
    vv.addEventListener("resize", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      el.style.removeProperty("--dock-vh");
    };
  }, [open]);

  const c = typeof window !== "undefined" ? sitePageContext() : { path: "" };
  const prompts = c.package_id
    ? ["What does each test in this package measure?", "Is this suitable for a yearly check-up?"]
    : c.compare_ids?.length
      ? ["What is the real difference between these packages?"]
      : ["Which package fits a ฿1,500 budget?", "What does a lipid profile include?", "We need checks for 40 employees"];

  const empty = (
    <div className="dock-empty">
      {online === false ? <p className="callout warn">{t("AI answers are switched off at the moment. You can still browse, book, and send a message to our team.")}</p> : null}
      {!state && !error ? <div className="skeleton" aria-hidden="true" /> : null}
      {state
        ? prompts.map((p) => (
            <button key={p} type="button" className="chip" onClick={() => engine.send(t(p))}>
              {t(p)}
            </button>
          ))
        : null}
    </div>
  );

  return (
    <ModalContext.Provider value={modalApi}>
      <section
        ref={panel}
        className="dock chat-dock"
        role="dialog"
        aria-modal="false"
        aria-labelledby="dock-title"
        hidden={!open}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !(e.target as Element).closest?.("dialog, [role=menu]")) {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <div className="dock-head">
          <div className="row">
            <h2 id="dock-title">
              <span className="speaker-dot" aria-hidden="true" />
              {t("Ask LabClear")}
            </h2>
            <div className="row dock-tools">
              <Link href="/app" className="dock-full">
                <Icon name="expand" />
                {t("Open full chat")}
              </Link>
              <button type="button" className="icon-btn" aria-label={t("Close")} onClick={onClose}>
                ×
              </button>
            </div>
          </div>
          <p className="dock-context">{line}</p>
        </div>
        <Feed
          className="dock-body"
          label={t("Messages")}
          messages={messages}
          live={engine.live}
          handlers={handlers}
          empty={empty}
          after={
            <>
              {error ? (
                <div className="callout bad dock-error" role="alert">
                  <span>{error}</span>
                  <button type="button" className="btn sm" onClick={() => refresh()}>
                    {t("Try again")}
                  </button>
                </div>
              ) : null}
              {mode !== "bot" ? (
                <p className="callout dock-mode">{mode === "waiting" ? t("Your message is with our team. AI answers are paused until they reply.") : t("A person from our team is replying. AI answers are paused.")}</p>
              ) : null}
            </>
          }
        />
        <div className="dock-foot">
          {!registered && state ? <GuestNote compact messages={guestCount} onSignedIn={signedIn} /> : null}
          <p className="tiny muted dock-status" role="status">
            {engine.live?.human ? t("Sending to our team…") : ""}
          </p>
          <Composer ref={composer} engine={engine} surface="dock" placeholder={t("Ask about a test, a package or a booking")} />
          <p className="tiny muted">{t("General information, not a medical diagnosis.")}</p>
        </div>
      </section>
      <Dialog open={!!modal} onClose={() => setModal(null)} title={modal?.title || ""} className={"chat-dialog " + (modal?.className || "")}>
        {modal?.node}
      </Dialog>
    </ModalContext.Provider>
  );
}
