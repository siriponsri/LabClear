"use client";
/* The list of turns. Messages keep their object identity across polls when unchanged, so the
   memoised turns skip re-rendering; the view follows new content only when the reader is near
   the bottom (or has just sent something). */
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { HandlersContext, LiveTurnView, MessageTurn, PendingUserTurn, type TurnHandlers } from "./Turn";
import type { ChatMessage, LiveTurn } from "./types";

/** Reuse the previous object for every message whose content did not change. */
export function useStableMessages(list: ChatMessage[] | undefined) {
  const cache = useRef(new Map<string, { key: string; m: ChatMessage }>());
  return useMemo(() => {
    const next = new Map<string, { key: string; m: ChatMessage }>();
    const out = (list || []).map((m) => {
      const key = JSON.stringify(m);
      const old = cache.current.get(m.id);
      const keep = old && old.key === key ? old : { key, m };
      next.set(m.id, keep);
      return keep.m;
    });
    cache.current = next;
    return out;
  }, [list]);
}

export function Feed({
  className,
  messages,
  live,
  handlers,
  empty,
  after,
  label,
}: {
  className: string;
  messages: ChatMessage[];
  live: LiveTurn | null;
  handlers: TurnHandlers;
  empty?: React.ReactNode;
  after?: React.ReactNode;
  label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const toBottom = () => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  // Follow growth (new turns, streamed steps, images loading) while the reader is at the bottom.
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // The welcome screen (no turns) is read from the top.
    const ro = new ResizeObserver(() => stick.current && el.querySelector(".turn") && toBottom());
    ro.observe(el);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);

  // Sending always brings the new turn into view.
  const started = !!live;
  useLayoutEffect(() => {
    if (started) {
      stick.current = true;
      toBottom();
    }
  }, [started]);

  const showEmpty = !messages.length && !live;
  return (
    <div
      ref={box}
      className={className}
      aria-label={label}
      aria-live="polite"
      aria-relevant="additions"
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
      }}
    >
      <div ref={inner} className="feed">
        <HandlersContext.Provider value={handlers}>
          {showEmpty ? empty : null}
          {messages.map((m, i) => (
            <MessageTurn key={m.id} m={m} last={!live && i === messages.length - 1} />
          ))}
          {live?.user ? <PendingUserTurn content={live.user.content} attachments={live.user.attachments} /> : null}
          {live && !live.human ? <LiveTurnView live={live} /> : null}
        </HandlersContext.Provider>
        {after}
      </div>
    </div>
  );
}

/** One handlers object for the life of the surface; each call goes to the latest implementation. */
export function useStableHandlers(current: TurnHandlers): TurnHandlers {
  const ref = useRef(current);
  ref.current = current;
  return useMemo<TurnHandlers>(
    () => ({
      get interactive() {
        return ref.current.interactive;
      },
      retry: (id) => ref.current.retry(id),
      cardRetry: (id) => ref.current.cardRetry(id),
      followup: (q) => ref.current.followup(q),
      staff: () => ref.current.staff(),
      followupCheck: () => ref.current.followupCheck(),
      shortcut: (cmd) => ref.current.shortcut(cmd),
      confirmAction: (m) => ref.current.confirmAction(m),
      confirmCard: (id) => ref.current.confirmCard(id),
      editCard: (m) => ref.current.editCard(m),
      discardCard: (id) => ref.current.discardCard(id),
      openImage: (src, name) => ref.current.openImage(src, name),
      isBusy: () => ref.current.isBusy(),
    }),
    [],
  );
}
