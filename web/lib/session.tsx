"use client";
/*
 * Who is using the page, shared by the website header, the dock chat, /app and /staff.
 * Also hosts the global toast and the sign-in dialog so any component can open them.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api, type User } from "@/lib/api/client";
import type { Lang } from "@/lib/i18n/shared";
import { apiMessage } from "@/lib/i18n/shared";
import { SignInDialog, type SignInOptions } from "@/components/SignInDialog";

type Tone = "" | "bad" | "ok";
type Ctx = {
  user: User | null;
  /** Show a short status message at the bottom of the screen (role=status). */
  notice: (text: string, tone?: Tone) => void;
  /** Translate an API error and show it. */
  fail: (e: unknown) => void;
  openSignIn: (opts?: SignInOptions) => void;
};
const SessionContext = createContext<Ctx | null>(null);

function useApiUser() {
  return useSyncExternalStore(
    (fn) => api.subscribe(fn),
    () => api.user,
    () => null,
  );
}

export function SessionProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  api.lang = lang;
  const user = useApiUser();
  const [toast, setToast] = useState<{ text: string; tone: Tone; n: number } | null>(null);
  const [signIn, setSignIn] = useState<SignInOptions | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.lang = lang;
  }, [lang]);

  const notice = useCallback((text: string, tone: Tone = "") => {
    setToast({ text, tone, n: Date.now() });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 7000);
  }, []);
  const fail = useCallback(
    (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      notice(apiMessage(lang, msg), "bad");
    },
    [lang, notice],
  );
  const openSignIn = useCallback((opts: SignInOptions = {}) => setSignIn(opts), []);
  const value = useMemo(() => ({ user, notice, fail, openSignIn }), [user, notice, fail, openSignIn]);

  return (
    <SessionContext.Provider value={value}>
      {children}
      <div role="status" aria-live="polite" className={"toast" + (toast?.tone === "bad" ? " bad" : "")} hidden={!toast} key={toast?.n}>
        {toast?.text}
      </div>
      <SignInDialog options={signIn} onClose={() => setSignIn(null)} />
    </SessionContext.Provider>
  );
}

export function useSession(): Ctx {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession() needs <SessionProvider>");
  return ctx;
}
