"use client";
/* The message box: draft attachments, the paperclip menu, Stop and Send. Text stays in this
   component's state (never in storage); other views prefill it through the handle. */
import { useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { Icon } from "./icons";
import type { ChatEngine } from "./engine";

export type ComposerHandle = { set: (text: string) => void; focus: () => void; openAttach: () => void; pickFile: () => void; value: () => string };

const LIMIT = 8000;

export function Composer({
  engine,
  ref,
  surface,
  placeholder,
  maxFiles = 1,
  onAttachReport,
  onTrySample,
  onFiles,
}: {
  engine: ChatEngine;
  ref?: React.Ref<ComposerHandle>;
  surface: "app" | "dock";
  placeholder: string;
  maxFiles?: number;
  /** Opens the file picker (after the plan check). Undefined: no paperclip. */
  onAttachReport?: () => boolean;
  onTrySample?: () => void;
  onFiles?: (files: File[]) => void;
}) {
  const { t, tf } = useT();
  const [text, setText] = useState("");
  const [menu, setMenu] = useState(false);
  const [drop, setDrop] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const attachBtn = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const { busy, draft } = engine;
  const hasDraft = draft.files.length > 0 || !!draft.sample;

  const grow = () => {
    const el = area.current;
    if (!el) return;
    // Empty: one line (a long placeholder must not make the box taller).
    if (!el.value) {
      el.style.height = "";
      return;
    }
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, surface === "dock" ? 120 : 200) + "px";
  };
  useEffect(grow, [text, surface]);

  useImperativeHandle(
    ref,
    () => ({
      set: (v: string) => {
        setText(v.slice(0, LIMIT));
        requestAnimationFrame(() => {
          const el = area.current;
          if (!el) return;
          el.focus({ preventScroll: true });
          el.setSelectionRange(el.value.length, el.value.length);
        });
      },
      focus: () => area.current?.focus({ preventScroll: true }),
      openAttach: () => setMenu(true),
      pickFile: () => file.current?.click(),
      value: () => text,
    }),
    [text],
  );

  // Menu: focus the first item when it opens; close on Escape and outside click.
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector("button")?.focus();
    const outside = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.(".attach-wrap")) setMenu(false);
    };
    document.addEventListener("click", outside);
    return () => document.removeEventListener("click", outside);
  }, [menu]);

  const submit = () => {
    if (engine.send(text)) setText("");
  };
  const files = (list: FileList | File[] | null | undefined) => {
    const arr = Array.from(list || []);
    if (arr.length && onFiles) onFiles(arr);
  };

  return (
    <form
      className={surface === "app" ? "composer" + (drop ? " drop" : "") : "dock-form"}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onDragOver={
        onFiles
          ? (e) => {
              if (Array.from(e.dataTransfer.types).includes("Files")) {
                e.preventDefault();
                setDrop(true);
              }
            }
          : undefined
      }
      onDragLeave={onFiles ? () => setDrop(false) : undefined}
      onDrop={
        onFiles
          ? (e) => {
              e.preventDefault();
              setDrop(false);
              files(e.dataTransfer.files);
            }
          : undefined
      }
    >
      {hasDraft ? (
        <div className="attachments draft" aria-label={t("Files to send")}>
          {draft.files.map((f, i) => (
            <div className="draft-file" key={f.name + i}>
              {f.preview ? <img src={f.preview} alt="" /> : <Icon name="source" />}
              <span className="name">{f.name}</span>
              <button
                type="button"
                className="remove"
                aria-label={tf("Remove {name}", { name: f.name })}
                onClick={() => {
                  engine.removeFile(i);
                  area.current?.focus();
                }}
              >
                ×
              </button>
            </div>
          ))}
          {draft.sample ? (
            <div className="draft-file">
              <img src={draft.sample.preview} alt="" />
              <span className="name">{draft.sample.title}</span>
              <button
                type="button"
                className="remove"
                aria-label={tf("Remove {name}", { name: draft.sample.title })}
                onClick={() => {
                  engine.setSample(null);
                  area.current?.focus();
                }}
              >
                ×
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {onAttachReport ? (
        <div className="attach-wrap">
          <button
            ref={attachBtn}
            type="button"
            className="icon-btn"
            aria-haspopup="menu"
            aria-expanded={menu}
            aria-controls={id + "-menu"}
            aria-label={t("Add a report")}
            onClick={() => setMenu((m) => !m)}
          >
            <Icon name="attach" />
          </button>
          {menu ? (
            <div
              ref={menuRef}
              className="attach-menu"
              id={id + "-menu"}
              role="menu"
              onKeyDown={(e) => {
                const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") || []);
                const i = items.indexOf(document.activeElement as HTMLButtonElement);
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setMenu(false);
                  attachBtn.current?.focus();
                } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
                }
              }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  if (onAttachReport()) file.current?.click();
                }}
              >
                {maxFiles > 1 ? t("Attach up to 3 lab report files (JPG, PNG or PDF, up to 3 MB each)") : t("Attach a lab report (JPG, PNG or PDF, up to 3 MB)")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  onTrySample?.();
                }}
              >
                {t("Try a synthetic sample report")}
              </button>
            </div>
          ) : null}
          <input
            ref={file}
            type="file"
            hidden
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            multiple={maxFiles > 1}
            tabIndex={-1}
            onChange={(e) => {
              files(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      ) : null}
      <label className="sr-only" htmlFor={id}>
        {t("Message LabClear")}
      </label>
      <textarea
        ref={area}
        id={id}
        rows={1}
        maxLength={LIMIT}
        autoComplete="off"
        autoCorrect="on"
        spellCheck
        enterKeyHint="send"
        placeholder={hasDraft ? t("Add a question about this report (optional)") : placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        onPaste={
          onFiles
            ? (e) => {
                const imgs = Array.from(e.clipboardData?.files || []).filter((x) => x.type.startsWith("image/"));
                if (imgs.length) {
                  e.preventDefault();
                  onFiles(imgs);
                }
              }
            : undefined
        }
      />
      {text.length >= 6000 ? (
        <span className={"char-count" + (text.length > 7600 ? " near" : "")} aria-live="polite">
          {new Intl.NumberFormat("en-US").format(text.length)} / 8,000
        </span>
      ) : null}
      {busy ? (
        <button type="button" className="btn sm stop-btn" onClick={() => engine.stop()}>
          <Icon name="stop" />
          {t("Stop")}
        </button>
      ) : null}
      <button type="submit" className="send-btn" aria-label={t("Send message")} disabled={busy || (!text.trim() && !hasDraft)}>
        <Icon name="send" />
      </button>
    </form>
  );
}
