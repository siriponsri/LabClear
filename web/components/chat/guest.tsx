"use client";
/*
 * Guest privacy (CEO requirement 2): a visitor who is not signed in has a temporary chat that is
 * deleted on refresh or close. The notice says so where they type, offers sign-in that keeps the
 * chat, and the browser asks before leaving while the chat has messages.
 */
import { useEffect } from "react";
import { useT } from "@/lib/i18n/client";
import { useSession } from "@/lib/session";
import { Icon } from "./icons";

export function GuestNote({ messages, onSignedIn, compact = false }: { messages: number; onSignedIn: (kept: number) => void; compact?: boolean }) {
  const { t } = useT();
  const { openSignIn } = useSession();
  return (
    <div className={"guest-note" + (compact ? " compact" : "")} role="note">
      <Icon name="lock" />
      <p>
        {t("Guest mode: this chat is not saved and is deleted when you refresh or close the page.")}{" "}
        <button type="button" className="link-btn" onClick={() => openSignIn({ guestMessages: messages, onDone: (_u, kept) => onSignedIn(kept) })}>
          {t("Sign in to keep your history")}
        </button>
      </p>
    </div>
  );
}

/** Ask before a reload or close would delete a guest chat that has messages. */
export function useLeaveGuard(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const ask = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older browsers need returnValue set to show the prompt.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [active]);
}
