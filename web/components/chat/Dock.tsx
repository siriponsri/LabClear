"use client";
/*
 * "ถาม LabClear" on every website page (port of static/js/dock.js). Only the launcher ships with
 * the page; the chat panel (Markdown, engine, turns) loads when the visitor opens it or hovers
 * the launcher. The panel stays mounted after the first open so a reply in progress survives
 * closing it and client navigation between website pages.
 *
 * Other components can open it: any element with [data-open-dock] (optional data-dock-prompt),
 * or window.dispatchEvent(new CustomEvent("labclear:open-dock", { detail: { text, send } })).
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/client";

const load = () => import("./DockPanel");
const DockPanel = dynamic(load, { ssr: false, loading: () => <DockLoading /> });

function DockLoading() {
  const { t } = useT();
  return (
    <section className="dock dock-loading" aria-busy="true" aria-label={t("Ask LabClear")}>
      <div className="skeleton" />
    </section>
  );
}

export type DockSeed = { text: string; send: boolean; n: number } | null;

/** Print-style pages (a Lab Report, the payment simulator) keep the screen to themselves, as in 3.x. */
export function Dock() {
  const path = usePathname() || "/";
  if (/^\/(lab-report|pay\/sim)\//.test(path)) return null;
  return <DockLauncher />;
}

function DockLauncher() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [seed, setSeed] = useState<DockSeed>(null);
  const launcher = useRef<HTMLButtonElement>(null);

  const show = useCallback((text = "", send = false) => {
    setSeed(text ? { text, send, n: Date.now() } : null);
    setMounted(true);
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => launcher.current?.focus());
  }, []);

  useEffect(() => {
    document.body.classList.toggle("dock-open", open);
    return () => document.body.classList.remove("dock-open");
  }, [open]);

  useEffect(() => {
    const click = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-open-dock]");
      if (!el) return;
      e.preventDefault();
      show(el.getAttribute("data-dock-prompt") || "");
    };
    const event = (e: Event) => {
      const d = ((e as CustomEvent).detail || {}) as { text?: string; send?: boolean };
      show(d.text || "", !!d.send);
    };
    document.addEventListener("click", click);
    window.addEventListener("labclear:open-dock", event);
    return () => {
      document.removeEventListener("click", click);
      window.removeEventListener("labclear:open-dock", event);
    };
  }, [show]);

  return (
    <>
      <button
        ref={launcher}
        type="button"
        className="dock-launch"
        aria-haspopup="dialog"
        aria-expanded={open}
        hidden={open}
        onClick={() => show()}
        onPointerEnter={() => void load()}
        onFocus={() => void load()}
      >
        <span className="speaker-dot" aria-hidden="true" />
        {t("Ask LabClear")}
      </button>
      {mounted ? <DockPanel open={open} onClose={close} seed={seed} /> : null}
    </>
  );
}
