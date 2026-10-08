"use client";
import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n/client";

/** Native <dialog> (focus trap, Esc, backdrop) styled by the 3.x .rs-dialog rules. */
export function Dialog({ open, onClose, title, children, className = "", labelledBy }: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useT();
  const id = labelledBy || "dlg-title-" + String(title).slice(0, 12).replace(/\W+/g, "-");
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={"rs-dialog " + className}
      aria-labelledby={id}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open ? (
        <>
          <div className="dialog-head">
            <h2 id={id}>{title}</h2>
            <button className="icon-btn" type="button" aria-label={t("Close dialog")} onClick={onClose}>
              ×
            </button>
          </div>
          <div className="dialog-body">{children}</div>
        </>
      ) : null}
    </dialog>
  );
}
