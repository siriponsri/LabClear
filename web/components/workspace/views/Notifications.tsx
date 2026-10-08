"use client";
/* Notifications created by real events in the account (GET /notifications, POST /notifications/read). */
import { useEffect } from "react";
import { when } from "@/lib/format";
import type { T, TF } from "@/lib/i18n/shared";
import { useWorkspace, type ViewId } from "../context";
import { Empty } from "../ui";
import { Act, LoadError, Loading, useLoad } from "./shared";

type Notice = { id: string; state: string; title: string; body: string; at: number; link?: string; ref?: string };

/** Server notifications are English sentences, some with a date or amount inside; show them in Thai. */
function localize(text: string, t: T, tf: TF): string {
  const exact = t(text);
  if (exact !== text) return exact;
  const rules: [RegExp, string][] = [
    [/^Plus runs until (.+)\. Test payment, no real money moved\.$/, "Plus runs until {a}. Test payment, no real money moved."],
    [/^(.+) THB was recorded by the payment simulator\. No real money moved\.$/, "{a} THB was recorded by the payment simulator. No real money moved."],
    [/^(.+) on (\d{4}-\d{2}-\d{2}) at (\d{2}:\d{2})\. Our team will confirm it\.$/, "{a} on {b} at {c}. Our team will confirm it."],
    [/^(\d{4}-\d{2}-\d{2}) at (\d{2}:\d{2})\. You can now pay by test payment or at the center, or add it to your calendar\.$/, "{a} at {b}. You can now pay by test payment or at the center, or add it to your calendar."],
    [/^Quotation version (\d+) is ready$/, "Quotation version {a} is ready"],
    [/^Test payment (\w+)$/, "Test payment {a}"],
    [/^Plus payment (\w+)$/, "Plus payment {a}"],
    [/^(.*) Choose another time or contact our team\.$/, "{a} Choose another time or contact our team."],
  ];
  for (const [re, key] of rules) {
    const m = text.match(re);
    if (m) return tf(key, { a: t(m[1]), b: m[2] || "", c: m[3] || "" });
  }
  return text;
}

export function NotificationsView() {
  const { api, t, tf, lang, navigate, notice, setUnread } = useWorkspace();
  const res = useLoad(() => api.get<{ notifications: Notice[]; unread: number }>("/notifications"));
  const unread = res.data?.unread;
  useEffect(() => {
    if (unread !== undefined) setUnread(unread);
  }, [unread, setUnread]);

  const open = async (n: Notice) => {
    await api.post("/notifications/read", { ids: [n.id] }).catch(() => null);
    const u = new URL(n.link!, location.origin);
    if (u.origin !== location.origin || !["/app", "/staff"].includes(u.pathname)) {
      notice(t("This notification link is unavailable."), "bad");
      return;
    }
    if (u.pathname === "/app") {
      const q = Object.fromEntries(u.searchParams);
      const view = (q.view || "chat") as ViewId;
      delete q.view;
      navigate(view, q);
      setUnread(Math.max(0, (unread || 1) - (n.state === "unread" ? 1 : 0)));
    } else location.href = u.href;
  };

  const intro = (
    <div className="view-intro">
      <h2>{t("Notifications")}</h2>
      <p>{t("Updates created by real events in your account: requests, confirmations, payments, quotations and replies.")}</p>
    </div>
  );
  if (res.error) return (<div>{intro}<LoadError error={res.error} retry={() => res.reload()} /></div>);
  if (!res.data) return (<div>{intro}<Loading rows={3} /></div>);
  const list = res.data.notifications;
  return (
    <div>
      {intro}
      <div className="toolbar">
        <Act
          className="btn sm"
          disabled={!res.data.unread}
          run={async () => {
            await api.post("/notifications/read", {});
            setUnread(0);
            await res.reload(true);
          }}
        >
          {t("Mark all as read")}
        </Act>
        <Act className="btn ghost sm" run={() => res.reload(true)}>
          {t("Refresh")}
        </Act>
      </div>
      {!list.length ? (
        <Empty title={t("No notifications yet")}>{t("You will see updates here when something changes.")}</Empty>
      ) : (
        <div className="record-list" aria-busy={res.loading || undefined}>
          {list.map((n) => (
            <article key={n.id} className={"notice-item" + (n.state === "unread" ? " unread" : "")}>
              <strong>
                {n.state === "unread" ? <span className="sr-only">{t("Unread")}: </span> : null}
                {localize(n.title, t, tf)}
              </strong>
              <span className="small">{localize(n.body, t, tf)}</span>
              <time dateTime={new Date(n.at * 1000).toISOString()}>{when(n.at, lang)}</time>
              {n.link ? (
                <Act className="link-btn small" run={() => open(n)}>
                  {t("Open")}
                </Act>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
