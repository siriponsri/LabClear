"use client";
/* Chats and projects beside the conversation; an off-canvas drawer below 980 px.
   Guests have one temporary chat, so they see a short explanation instead. */
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { ago } from "@/lib/format";
import { Icon, MoreIcon } from "./icons";

export type ChatSummary = { id: string; title: string; project_id: string; updated: number; messages: number; active: boolean };
export type ProjectSummary = { id: string; name: string; created: number };
export type ChatListing = { active: string; active_project: string; chats: ChatSummary[]; projects: ProjectSummary[] };

type Props = {
  list: ChatListing | null;
  registered: boolean;
  open: boolean;
  drawer: boolean;
  onClose: () => void;
  onNew: (projectId: string) => void;
  onOpen: (chat: ChatSummary) => void;
  onEditChat: (chat: ChatSummary) => void;
  onEditProject: (project?: ProjectSummary) => void;
  onSignIn: () => void;
  expanded: Record<string, boolean>;
  setExpanded: (id: string, open: boolean) => void;
};

function ChatRow({ c, onOpen, onEdit }: { c: ChatSummary; onOpen: () => void; onEdit: () => void }) {
  const { t, tf, lang } = useT();
  const title = t(c.title);
  return (
    <div className={"cl-item" + (c.active ? " active" : "")}>
      <button type="button" className="cl-open" aria-current={c.active ? "true" : undefined} onClick={onOpen}>
        <span className="cl-name">{title}</span>
        <span className="cl-time">{ago(c.updated, lang)}</span>
      </button>
      <button type="button" className="icon-btn cl-more" aria-label={tf("Options for chat {title}", { title })} onClick={onEdit}>
        <MoreIcon />
      </button>
    </div>
  );
}

export function ChatList({ list, registered, open, drawer, onClose, onNew, onOpen, onEditChat, onEditProject, onSignIn, expanded, setExpanded }: Props) {
  const { t, tf } = useT();
  const ref = useRef<HTMLElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open || !drawer) return;
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open, drawer, onClose]);

  const projects = list?.projects || [];
  const chats = list?.chats || [];
  const loose = chats.filter((c) => !c.project_id || !projects.some((p) => p.id === c.project_id));

  return (
    <>
      <aside ref={ref} id="chat-list" className={"chat-list" + (open ? " open" : "")} aria-label={t("Chats and projects")} inert={mounted && drawer && !open ? true : undefined}>
        <div className="cl-top">
          <button type="button" className="btn sm cl-new" onClick={() => onNew("")}>
            <Icon name="plus" />
            {t("New chat")}
          </button>
          {!registered ? (
            <>
              <p className="tiny muted">{t("Guest mode keeps one temporary chat. Refreshing or closing the page deletes it. Sign in to keep your chats and group them into projects.")}</p>
              <button type="button" className="btn sm" onClick={onSignIn}>
                {t("Sign in to keep your history")}
              </button>
            </>
          ) : null}
        </div>
        {registered ? (
          <>
            <section className="cl-group" aria-labelledby="cl-projects">
              <div className="cl-head">
                <h2 id="cl-projects">{t("Projects")}</h2>
                <button type="button" className="icon-btn cl-add" aria-label={t("New project")} onClick={() => onEditProject()}>
                  <Icon name="plus" />
                </button>
              </div>
              {!projects.length ? <p className="tiny muted cl-empty">{t("Group chats by topic, for example a yearly check-up.")}</p> : null}
              {projects.map((p) => {
                const inside = chats.filter((c) => c.project_id === p.id);
                const isOpen = p.id in expanded ? expanded[p.id] : list?.active_project === p.id;
                return (
                  <div key={p.id} className={"cl-project" + (isOpen ? " open" : "")}>
                    <div className="cl-item">
                      <button type="button" className="cl-open" aria-expanded={isOpen} onClick={() => setExpanded(p.id, !isOpen)}>
                        <Icon name="folder" />
                        <span className="cl-name">{p.name}</span>
                        <span className="cl-count">{inside.length}</span>
                      </button>
                      <button type="button" className="icon-btn cl-more" aria-label={tf("Options for project {name}", { name: p.name })} onClick={() => onEditProject(p)}>
                        <MoreIcon />
                      </button>
                    </div>
                    {isOpen ? (
                      <div className="cl-children">
                        {inside.map((c) => (
                          <ChatRow key={c.id} c={c} onOpen={() => onOpen(c)} onEdit={() => onEditChat(c)} />
                        ))}
                        <button type="button" className="cl-sub" onClick={() => onNew(p.id)}>
                          <Icon name="plus" />
                          {tf("New chat in {name}", { name: p.name })}
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </section>
            <section className="cl-group" aria-labelledby="cl-chats">
              <div className="cl-head">
                <h2 id="cl-chats">{t("Chats")}</h2>
              </div>
              {!loose.length ? <p className="tiny muted cl-empty">{t("Your chats appear here.")}</p> : null}
              {loose.map((c) => (
                <ChatRow key={c.id} c={c} onOpen={() => onOpen(c)} onEdit={() => onEditChat(c)} />
              ))}
            </section>
          </>
        ) : null}
      </aside>
      <div className={"chat-list-scrim" + (open && drawer ? " show" : "")} hidden={!open || !drawer} onClick={onClose} />
    </>
  );
}
