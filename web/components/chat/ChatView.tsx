"use client";
/*
 * The conversation in /app (port of the chat parts of static/js/workspace.js and
 * templates/workspace.html): chat list and projects, the conversation bar, turns with live steps,
 * the composer with report upload, context chips, the comparison canvas and deep links.
 * Rendered inside <section class="view chat-view"> by components/workspace/Workspace.tsx.
 */
import "@/app/styles/chat.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { useSession } from "@/lib/session";
import { bangkokDate } from "@/lib/format";
import { useWorkspace, type ViewId } from "@/components/workspace/context";
import { Dialog } from "@/components/ui/Dialog";
import { useChatEngine, planOf } from "./engine";
import { Feed, useStableHandlers, useStableMessages } from "./Feed";
import { Composer, type ComposerHandle } from "./Composer";
import { ChatList, type ChatListing, type ChatSummary, type ProjectSummary } from "./ChatList";
import { ContextChips, useOrgScope } from "./ContextChips";
import { Canvas } from "./Canvas";
import { GuestNote, useLeaveGuard } from "./guest";
import { Icon } from "./icons";
import { ChatEdit, DemoPicker, HandoffForm, ImageView, ModalContext, ProjectEdit, ReportReview, UpgradeView, type Modal } from "./dialogs";
import { confirmAction, shortcutView } from "./shared";
import { loadBusiness } from "./util";
import type { ChatMessage } from "./types";

const PROMPTS: [string, string][] = [
  ["Which check fits about ฿1,500?", "Which health check fits a budget of about 1,500 baht?"],
  ["What does a lipid profile measure?", "What does a lipid profile measure?"],
  ["Checks for 40 employees", "We need health checks for 40 employees at our office."],
];
const STEPS = ["Send your report", "Confirm the values", "Understand each value", "Ask about a follow-up check", "Request a time"];

function useMedia(query: string) {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = matchMedia(query);
    setMatch(mq.matches);
    const on = () => setMatch(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

function Welcome({ onAttach, onSample, onPrompt }: { onAttach: () => void; onSample: () => void; onPrompt: (q: string) => void }) {
  const { t } = useWorkspace();
  return (
    <div className="welcome">
      <h2>{t("Start with your lab report.")}</h2>
      <p className="muted">
        {t("Attach a photo or PDF. LabClear reads it, you confirm the values in one click, and the Report Explainer explains each one with sources. Ask about a follow-up check or request a time whenever you are ready.")}
      </p>
      <ol className="welcome-steps" aria-label={t("How it works")}>
        {STEPS.map((s, i) => (
          <li key={s}>
            <span>{i + 1}</span>
            {t(s)}
          </li>
        ))}
      </ol>
      <div className="row">
        <button className="btn primary" type="button" onClick={onAttach}>
          {t("Attach a lab report")}
        </button>
        <button className="btn" type="button" onClick={onSample}>
          {t("Try a sample report")}
        </button>
      </div>
      <p className="small muted">{t("Or just ask:")}</p>
      <div className="row">
        {PROMPTS.map(([label, prompt]) => (
          <button key={label} className="chip" type="button" onClick={() => onPrompt(t(prompt))}>
            {t(label)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChatView() {
  const ws = useWorkspace();
  const { t, tf, lang, state, refresh, navigate, view, user, notice, fail } = ws;
  const { openSignIn } = useSession();
  const registered = !!user?.registered;
  const [modal, setModal] = useState<Modal>(null);
  const [chatsOpen, setChatsOpen] = useState(false);
  const [expanded, setExpandedMap] = useState<Record<string, boolean>>({});
  const [canvas, setCanvas] = useState<{ ids: string[]; focus?: string } | null>(null);
  const composer = useRef<ComposerHandle>(null);
  const root = useRef<HTMLDivElement>(null);
  const viewRef = useRef<ViewId>(view);
  viewRef.current = view;
  const drawer = useMedia("(max-width:980px)");
  const narrow = useMedia("(max-width:640px)");

  const modalApi = useMemo(
    () => ({
      open: (title: string, node: React.ReactNode, className?: string) => setModal({ title, node, className }),
      close: () => setModal(null),
    }),
    [],
  );
  const upgrade = useCallback((reason: string) => modalApi.open(t("This needs LabClear Plus"), <UpgradeView reason={reason} onPlan={() => navigate("plan")} />), [modalApi, navigate, t]);

  const engine = useChatEngine({
    surface: "app",
    state,
    refresh,
    page: () => ({ path: "/app", view: viewRef.current }),
    upgrade,
    beforeSend: () => {
      if (viewRef.current !== "chat") navigate("chat");
    },
    afterTurn: () => {
      if (viewRef.current === "chat" && !document.querySelector("dialog[open]")) composer.current?.focus();
    },
  });

  const conversation = state?.conversation;
  const messages = useStableMessages(conversation?.messages as ChatMessage[] | undefined);
  const mode = conversation?.mode || "bot";
  const guestCount = messages.length + (engine.live?.user ? 1 : 0);
  useLeaveGuard(!registered && guestCount > 0);
  const [mine, setMine] = useOrgScope(state, registered);

  /* ------------------------------------------------------------ actions */

  const signedIn = useCallback(
    async (kept: number) => {
      await refresh();
      notice(kept ? t("Signed in. This chat is now saved in your account.") : t("Signed in."));
    },
    [notice, refresh, t],
  );

  const requestStaff = useCallback(() => {
    if (!registered) return ws.requireAccount(t("Sign in to send a request to our team. You can keep this chat in your account."));
    modalApi.open(t("Talk to our team"), <HandoffForm onSent={refresh} />);
  }, [modalApi, refresh, registered, t, ws]);

  const attachReport = useCallback(() => {
    if (!planOf(state).can_read) {
      upgrade(t("Your free AI report reading has been used. Synthetic samples stay free."));
      return false;
    }
    return true;
  }, [state, t, upgrade]);

  const trySample = useCallback(
    () =>
      modalApi.open(
        t("Try a sample report"),
        <DemoPicker
          onPick={(s) => {
            engine.setSample(s);
            requestAnimationFrame(() => composer.current?.focus());
          }}
        />,
      ),
    [engine, modalApi, t],
  );

  const chatAction = useCallback(
    async (run: () => Promise<unknown>, done: string) => {
      if (engine.busyRef.current) {
        notice(t("Wait for the current reply first."), "bad");
        return;
      }
      try {
        await run();
        modalApi.close();
        setChatsOpen(false);
        setCanvas(null);
        engine.clearDraft();
        await refresh();
        if (viewRef.current !== "chat") navigate("chat");
        if (done) notice(done);
        composer.current?.focus();
      } catch (e) {
        fail(e);
      }
    },
    [engine, fail, modalApi, navigate, notice, refresh, t],
  );

  const highlight = useCallback(
    (fieldId: string) => {
      const id = conversation?.report_id;
      if (!id) return notice(t("Select a confirmed report first."), "bad");
      modalApi.open(t("Review report fields"), <ReportReview reportId={id} highlight={fieldId} onConfirmed={refresh} />, "wide");
    },
    [conversation?.report_id, modalApi, notice, refresh, t],
  );

  const handlers = useStableHandlers({
    interactive: true,
    retry: engine.retry,
    cardRetry: engine.cardRetry,
    followup: (q) => engine.send(q),
    staff: requestStaff,
    followupCheck: () => engine.send(t("Is there a follow-up check for the items in this report?")),
    shortcut: (cmd) =>
      shortcutView(cmd, t, tf, {
        navigate: (v, p) => navigate(v as ViewId, p),
        compare: (ids) => setCanvas({ ids }),
        highlight,
      }),
    confirmAction: (m) => confirmAction(m, { t, notice, fail, refresh, requireAccount: ws.requireAccount }),
    confirmCard: (id) => engine.confirmCard(id),
    editCard: (m) =>
      modalApi.open(t("Edit values"), <ReportReview reportId={m.report_id || ""} onConfirm={(fields) => engine.confirmCard(m.id, fields)} />, "wide"),
    discardCard: engine.discardCard,
    openImage: (src, name) => modalApi.open(t("Report image"), <ImageView src={src} name={name} />, "wide"),
    isBusy: () => engine.busyRef.current,
  });

  /* ------------------------------------------------------------ other views prefill or send */

  const composerFn = useRef<(text: string, send?: boolean) => void>(() => {});
  composerFn.current = (text, send) => {
    if (send && engine.send(text)) return;
    composer.current?.set(text);
  };
  const { registerComposer } = ws;
  useEffect(() => registerComposer((text, send) => composerFn.current(text, send)), [registerComposer]);

  /* ------------------------------------------------------------ deep links (?q=, ?package=, ...) */

  const applied = useRef(false);
  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    const p = new URLSearchParams(location.search);
    const hasView = !!p.get("view") && p.get("view") !== "chat";
    (async () => {
      const names = async (ids: string[]) => {
        const b = await loadBusiness().catch(() => null);
        return ids.map((id) => ({ id, name: b?.catalog.packages.find((x) => x.id === id)?.name || id }));
      };
      let text = "";
      if (p.get("package") && !hasView) {
        const [x] = await names([p.get("package")!]);
        text = tf("Tell me about {name} ({id}). Is it suitable for me?", x);
      }
      if (p.get("ask")) {
        const [x] = await names([p.get("ask")!]);
        text = tf("I am interested in {name} ({id}). Can your team review whether it is suitable for me?", x);
      }
      if (p.get("compare")) {
        const list = await names(p.get("compare")!.split(",").filter(Boolean).slice(0, 3));
        text = tf("Please compare {list} for me. What is different and which fits a general check-up?", { list: list.map((x) => `${x.name} (${x.id})`).join(t(" and ")) });
      }
      if (p.get("topic") === "organization") text = t("I would like to arrange health checks for my organization.");
      if (text) composer.current?.set(text);
      if (p.get("team") === "1") requestStaff();
      if (p.get("attach") === "1") composer.current?.openAttach();
      if (p.get("payment") === "return") notice(t("Returned from checkout. Payment status updates when the provider confirms it."));
      const q = (p.get("q") || "").trim().slice(0, 2000);
      const clean = ["q", "package", "ask", "compare", "topic", "team", "attach", "payment"].some((k) => p.has(k)) && !hasView;
      // A reload must not send the question again.
      if (clean || q) window.history.replaceState(window.history.state, "", "/app");
      if (q) {
        if (mode === "bot") engine.send(q);
        else composer.current?.set(q);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------ refresh every 4 seconds on the chat */

  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden || engine.busyRef.current || !api.csrf || viewRef.current !== "chat" || document.querySelector("dialog[open]")) return;
      refresh().catch(() => {});
    }, 4000);
    return () => clearInterval(id);
  }, [engine.busyRef, refresh]);

  /* ------------------------------------------------------------ layout: canvas column, drawer, keyboard */

  useEffect(() => {
    const section = root.current?.closest(".chat-view");
    section?.classList.toggle("with-canvas", !!canvas);
    return () => section?.classList.remove("with-canvas");
  }, [canvas]);

  useEffect(() => setChatsOpen(false), [drawer]);

  // Keep the composer above the on-screen keyboard (visual viewport smaller than the layout one).
  useEffect(() => {
    const vv = window.visualViewport;
    const section = root.current?.closest<HTMLElement>(".chat-view");
    if (!vv || !section) return;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      section.style.setProperty("--kb", kb > 80 ? Math.round(kb) + "px" : "0px");
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      section.style.removeProperty("--kb");
    };
  }, []);

  if (!state || !conversation) return null;

  /* ------------------------------------------------------------ derived */

  const list = state.chats as ChatListing;
  const active = list?.chats.find((c) => c.active);
  const project = list?.projects.find((p) => p.id === list.active_project);
  const today = bangkokDate(0);
  const upcoming = state.bookings
    .filter((b) => ["requested", "confirmed"].includes(b.state) && b.data?.date >= today)
    .sort((a, b) => (a.data.date + a.data.time).localeCompare(b.data.date + b.data.time))[0];
  const dayText = (d: string) => new Date(d + "T00:00:00").toLocaleDateString(lang === "th" ? "th-TH" : "en-GB", { weekday: "short", day: "numeric", month: "short" });
  const maxFiles = planOf(state).images_per_read || 1;

  return (
    <ModalContext.Provider value={modalApi}>
      <ChatList
        list={list}
        registered={registered}
        open={chatsOpen}
        drawer={drawer}
        onClose={() => setChatsOpen(false)}
        onNew={(projectId) => chatAction(() => api.post("/chats", { project_id: projectId }), "")}
        onOpen={(c: ChatSummary) => (c.active ? setChatsOpen(false) : chatAction(() => api.post("/chats/" + encodeURIComponent(c.id) + "/open"), ""))}
        onEditChat={(c) => modalApi.open(t("Chat"), <ChatEdit chat={c} projects={list.projects} act={chatAction} />)}
        onEditProject={(p?: ProjectSummary) =>
          modalApi.open(p ? t("Project") : t("New project"), <ProjectEdit project={p} act={chatAction} onCreated={(id) => setExpandedMap((m) => ({ ...m, [id]: true }))} />)
        }
        onSignIn={() => openSignIn({ guestMessages: guestCount, onDone: (_u, kept) => signedIn(kept) })}
        expanded={expanded}
        setExpanded={(id, open) => setExpandedMap((m) => ({ ...m, [id]: open }))}
      />
      <div className="conversation" ref={root}>
        <div className="col conv-bar">
          <button type="button" className="icon-btn chats-toggle" aria-label={chatsOpen ? t("Hide chats") : t("Show chats")} aria-controls="chat-list" aria-expanded={chatsOpen} onClick={() => setChatsOpen((o) => !o)}>
            <Icon name="panel" />
          </button>
          <div className="chat-title">
            <strong>{active ? t(active.title) : t("New chat")}</strong>
            {project ? <span className="chat-project">{project.name}</span> : null}
          </div>
          <div className="next">
            {upcoming ? (
              <>
                <button type="button" className="link-btn" onClick={() => navigate("bookings")}>
                  {tf(upcoming.state === "requested" ? "Requested: {date}, {time}" : "Next visit: {date}, {time}", { date: dayText(upcoming.data.date), time: upcoming.data.time })}
                </button>
                <span className={"badge " + (upcoming.state === "requested" ? "warn" : "ok")}>{upcoming.state === "requested" ? t("Awaiting confirmation") : t("Confirmed")}</span>
              </>
            ) : mode !== "bot" ? (
              <span>{t("Our team has this conversation.")}</span>
            ) : null}
          </div>
          <button type="button" className="btn ghost sm new-chat-btn" onClick={() => chatAction(() => api.post("/chats", { project_id: "" }), "")}>
            {t("New chat")}
          </button>
        </div>
        <Feed
          className="messages"
          label={t("Messages")}
          messages={messages}
          live={engine.live}
          handlers={handlers}
          empty={<Welcome onAttach={() => attachReport() && composer.current?.pickFile()} onSample={trySample} onPrompt={(q) => engine.send(q)} />}
        />
        <div className="composer-area col">
          {mode !== "bot" ? (
            <div className="staff-banner" role="status">
              <Icon name="person" />
              <p>{mode === "waiting" ? t("Your request is queued for our team; the assistant is paused.") : t("A team member is replying; the assistant is paused.")}</p>
            </div>
          ) : null}
          <div className="chat-status" role="status">
            {engine.live?.human ? t("Sending to our team…") : ""}
          </div>
          <ContextChips state={state} mine={mine} setMine={setMine} onChanged={refresh} />
          {!registered ? <GuestNote messages={guestCount} onSignedIn={signedIn} /> : null}
          <Composer
            ref={composer}
            engine={engine}
            surface="app"
            placeholder={narrow ? t("Ask a question") : t("Ask about lab results, packages or booking")}
            maxFiles={maxFiles}
            onAttachReport={attachReport}
            onTrySample={trySample}
            onFiles={(files) => {
              if (attachReport()) engine.attachFiles(files).then(() => composer.current?.focus());
            }}
          />
          <p className="composer-note tiny muted">
            {t("LabClear gives general health information, not a medical diagnosis. Please talk to a qualified healthcare professional for personal advice.")}{" "}
            <button className="link-btn" type="button" onClick={requestStaff}>
              {t("Talk to our team")}
            </button>
          </p>
        </div>
      </div>
      {canvas ? <Canvas ids={canvas.ids} focus={canvas.focus} onClose={() => setCanvas(null)} /> : null}
      <Dialog open={!!modal} onClose={() => setModal(null)} title={modal?.title || ""} className={"chat-dialog " + (modal?.className || "")}>
        {modal?.node}
      </Dialog>
    </ModalContext.Provider>
  );
}
