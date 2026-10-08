"use client";
/* Notifications for the team: created by real events (requests, payments, documents to review). */
import { api } from "@/lib/api/client";
import { when } from "@/lib/format";
import { ActionButton, Empty, Intro } from "@/components/workspace/ui";
import { isViewId, useStaff } from "../context";
import { Loaded, useLoad } from "../parts";

type Notice = { id: string; state: "unread" | "read"; title: string; body: string; at: number; link?: string };

export function Notifications() {
  const { t, lang, navigate, notice, fail, setUnread } = useStaff();
  const state = useLoad(async () => {
    const d = await api.get<{ notifications: Notice[]; unread: number }>("/staff/notifications");
    setUnread(d.unread || 0);
    return d;
  }, []);

  const open = async (n: Notice) => {
    try {
      await api.post("/staff/notifications/read", { ids: [n.id] });
    } catch {
      /* opening still works */
    }
    const u = new URL(n.link!, location.origin);
    if (u.origin !== location.origin || !["/app", "/staff"].includes(u.pathname)) {
      notice(t("This notification link is unavailable."), "bad");
      return;
    }
    if (u.pathname === "/staff") {
      const v = u.searchParams.get("view");
      const p = Object.fromEntries(u.searchParams.entries());
      delete p.view;
      navigate(isViewId(v) ? v : "overview", p);
    } else location.href = u.href;
  };

  return (
    <div>
      <Intro title={t("Notifications")}>{t("Updates created by real events: requests, confirmations, payments, quotations, documents to review and replies.")}</Intro>
      <div className="toolbar">
        <ActionButton
          className="btn sm"
          onError={fail}
          run={async () => {
            await api.post("/staff/notifications/read", {});
            setUnread(0);
            await state.reload();
          }}
        >
          {t("Mark all as read")}
        </ActionButton>
      </div>
      <Loaded state={state}>
        {(d) =>
          d.notifications.length ? (
            <div className="record-list">
              {d.notifications.map((n) => (
                <article key={n.id} className={"notice-item" + (n.state === "unread" ? " unread" : "")}>
                  <strong>
                    {n.state === "unread" ? <span className="sr-only">{t("Unread")}: </span> : null}
                    {t(n.title)}
                  </strong>
                  <span className="small">{n.body}</span>
                  <time dateTime={new Date(n.at * 1000).toISOString()}>{when(n.at, lang)}</time>
                  {n.link ? (
                    <button type="button" className="link-btn small" onClick={() => open(n)}>
                      {t("Open")}
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <Empty title={t("No notifications yet")}>{t("You will see updates here when something changes.")}</Empty>
          )
        }
      </Loaded>
    </div>
  );
}
