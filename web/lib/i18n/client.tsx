"use client";
import { createContext, useCallback, useContext, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LANG_COOKIE, makeT, type Lang, type T, type TF } from "./shared";

type Ctx = { lang: Lang; t: T; tf: TF; setLang: (lang: Lang) => void; switching: boolean };
const LangContext = createContext<Ctx | null>(null);

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const router = useRouter();
  const [switching, start] = useTransition();
  const setLang = useCallback(
    (next: Lang) => {
      if (next === lang) return;
      document.cookie = `${LANG_COOKIE}=${next}; Max-Age=31536000; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
      document.documentElement.lang = next;
      // Server components re-render in the new language; client state (drafts, open chats) stays.
      start(() => router.refresh());
    },
    [lang, router],
  );
  const value = useMemo(() => ({ ...makeT(lang), setLang, switching }), [lang, setLang, switching]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useT(): Ctx {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useT() needs <LangProvider>");
  return ctx;
}
