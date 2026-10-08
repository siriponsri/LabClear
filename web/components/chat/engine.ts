"use client";
/*
 * The chat engine shared by /app and the website dock: sending, streamed steps, Stop, Retry,
 * report cards and files attached to the next message. Ported from static/js/workspace.js
 * (send/runTurn/finishTurn/attachFiles). Nothing here touches browser storage: drafts, previews
 * and the live turn live in React state only (CEO requirement 2).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ApiError, type Step } from "@/lib/api/client";
import { useT } from "@/lib/i18n/client";
import { useSession } from "@/lib/session";
import type { Attachment, Draft, DraftSample, LiveStep, LiveTurn, PageContext, ReportField, WorkspaceState } from "./types";

export type ChatHost = {
  surface: "app" | "dock";
  state: WorkspaceState | null;
  refresh: () => Promise<WorkspaceState | null>;
  page: () => PageContext;
  /** Show the LabClear Plus dialog with a reason. */
  upgrade: (reason: string) => void;
  /** Called before a message goes out (the workspace switches to the chat view). */
  beforeSend?: () => void;
  /** Called when a turn has finished and the chat was reloaded. */
  afterTurn?: () => void;
};

export const MAX_FILE = 3 * 1024 * 1024;
const EMPTY_DRAFT: Draft = { files: [], sample: null };
const isAbort = (e: unknown) => (e as Error)?.name === "AbortError";

export function planOf(state: WorkspaceState | null) {
  return state?.plan || { plan: "free", images_per_read: 1, can_read: true };
}

const readPreview = (file: File) =>
  new Promise<string>((done) => {
    if (!file.type.startsWith("image/")) return done("");
    const r = new FileReader();
    r.onload = () => done(String(r.result || ""));
    r.onerror = () => done("");
    r.readAsDataURL(file);
  });

export function useChatEngine(host: ChatHost) {
  const { t } = useT();
  const { notice, fail } = useSession();
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<LiveTurn | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const busyRef = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const hostRef = useRef(host);
  hostRef.current = host;
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Leaving the page or signing in/out abandons the turn in progress.
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    let who = api.user?.id || "";
    const off = api.subscribe(() => {
      const now = api.user?.id || "";
      if (now === who) return;
      const switched = !!who;
      who = now;
      if (!switched) return;
      controller.current?.abort();
      setDraft(EMPTY_DRAFT);
      // The turn in progress belonged to the previous identity: drop it from the screen too.
      busyRef.current = false;
      setBusy(false);
      setLive(null);
    });
    return () => {
      off();
    };
  }, []);

  const onStep = useCallback((ev: Step) => {
    setLive((l) => {
      if (!l) return l;
      const steps: LiveStep[] = l.steps.filter((s) => s.id !== "send");
      const i = steps.findIndex((s) => s.id === ev.id);
      if (i >= 0) steps[i] = ev;
      else steps.push(ev);
      return { ...l, steps };
    });
  }, []);

  const failLive = useCallback((message: string) => {
    setLive((l) => (l ? { ...l, stopped: true, note: message, steps: l.steps.map((s) => (s.state === "running" ? { ...s, state: "failed" as const } : s)) } : l));
  }, []);

  const begin = useCallback((user: LiveTurn["user"], human: boolean) => {
    busyRef.current = true;
    setBusy(true);
    controller.current = new AbortController();
    setLive({ user, human, stopped: false, note: "", steps: human ? [] : [{ type: "step", id: "send", state: "running", label: "Sending", detail: "" }] });
    return controller.current.signal;
  }, []);

  const finish = useCallback(async () => {
    controller.current = null;
    try {
      await hostRef.current.refresh();
    } catch {
      /* the next poll retries */
    }
    busyRef.current = false;
    setBusy(false);
    setLive(null);
    hostRef.current.afterTurn?.();
  }, []);

  const report = useCallback(
    (e: unknown) => {
      if (isAbort(e)) return;
      const err = e as ApiError;
      failLive(t(err.message));
      if (err.code === "subscription_required") hostRef.current.upgrade(err.message);
      else fail(e);
    },
    [fail, failLive, t],
  );

  /**
   * Send a message, with the attached files or sample report if any. Returns false at once when
   * nothing was sent (busy, empty, or our team has the chat and a report was attached).
   */
  const send = useCallback(
    (raw: string): boolean => {
      const text = (raw || "").trim();
      const { files, sample } = draftRef.current;
      const withReport = files.length > 0 || !!sample;
      if (busyRef.current || (!text && !withReport)) return false;
      const h = hostRef.current;
      const human = !!h.state && h.state.conversation.mode !== "bot";
      if (withReport && human) {
        notice(t("Our team has this conversation. Add the report on My reports instead."), "bad");
        return false;
      }
      h.beforeSend?.();
      const question = text || (withReport ? t("Please read and explain this lab report.") : "");
      const attachments: Attachment[] = files.map((f) => ({ preview: f.preview, name: f.name })).concat(sample ? [{ preview: sample.preview, name: sample.title }] : []);
      const signal = begin({ content: question, attachments }, human);
      if (withReport) setDraft(EMPTY_DRAFT);
      (async () => {
        try {
          if (withReport) {
            const form = new FormData();
            files.forEach((f) => form.append("files", f.file));
            form.append("message", question);
            if (sample) form.append("demo_id", sample.id);
            await api.stream("/chat/report", form, onStep, signal);
          } else {
            await api.stream("/chat", { message: question, page: h.page() }, onStep, signal);
          }
        } catch (e) {
          report(e);
        } finally {
          await finish();
        }
      })();
      return true;
    },
    [begin, finish, notice, onStep, report, t],
  );

  /** Retries and report confirmations: no new user message; the steps follow the last turn. */
  const runTurn = useCallback(
    async (path: string, body: unknown) => {
      if (busyRef.current) return;
      const signal = begin(null, false);
      try {
        await api.stream(path, body, onStep, signal);
      } catch (e) {
        report(e);
      } finally {
        await finish();
      }
    },
    [begin, finish, onStep, report],
  );

  const retry = useCallback((id: string) => runTurn("/chat/retry", { message_id: id }), [runTurn]);
  const cardRetry = useCallback((id: string) => runTurn("/chat/report/answer", { message_id: id }), [runTurn]);
  const confirmCard = useCallback(
    (id: string, fields?: ReportField[]) => runTurn("/chat/report/confirm", fields ? { message_id: id, fields } : { message_id: id }),
    [runTurn],
  );
  const discardCard = useCallback(
    async (id: string) => {
      try {
        await api.post("/chat/report/discard", { message_id: id });
        await hostRef.current.refresh();
      } catch (e) {
        fail(e);
      }
    },
    [fail],
  );

  const stop = useCallback(async () => {
    controller.current?.abort();
    try {
      await api.post("/stop");
      notice(t("Stopped. A late answer will not be added."));
    } catch (e) {
      fail(e);
    }
  }, [fail, notice, t]);

  /** Check and attach report files to the next message (JPG, PNG or PDF up to 3 MB; Plus up to 3). */
  const attachFiles = useCallback(
    async (list: File[]) => {
      if (!list.length) return;
      const plan = planOf(hostRef.current.state);
      if (!plan.can_read) {
        hostRef.current.upgrade(t("Your free AI report reading has been used. Synthetic samples stay free."));
        return;
      }
      const limit = plan.images_per_read || 1;
      if (draftRef.current.files.length + list.length > limit) {
        if (limit === 1) hostRef.current.upgrade(t("The Free plan reads one image at a time. LabClear Plus reads up to three pages or images together."));
        else notice(t("Attach up to three files."), "bad");
        return;
      }
      for (const f of list) {
        if (f.size > MAX_FILE) return notice(t("Choose files under 3 MB each."), "bad");
        if (!/\.(pdf|png|jpe?g)$/i.test(f.name)) return notice(t("Use PDF, PNG or JPEG files."), "bad");
      }
      const added = await Promise.all(list.map(async (file) => ({ file, name: file.name, preview: await readPreview(file) })));
      setDraft((d) => ({ files: [...d.files, ...added], sample: null }));
    },
    [notice, t],
  );
  const setSample = useCallback((sample: DraftSample | null) => setDraft({ files: [], sample }), []);
  const removeFile = useCallback((index: number) => setDraft((d) => ({ ...d, files: d.files.filter((_, i) => i !== index) })), []);
  const clearDraft = useCallback(() => setDraft(EMPTY_DRAFT), []);

  return { busy, busyRef, live, draft, send, retry, cardRetry, confirmCard, discardCard, stop, attachFiles, setSample, removeFile, clearDraft };
}

export type ChatEngine = ReturnType<typeof useChatEngine>;
