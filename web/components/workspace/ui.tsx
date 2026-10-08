"use client";
/* Small building blocks shared by every workspace and staff view (same classes as 3.x). */
import { useState } from "react";

export function Intro({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="view-intro">
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export function Empty({ title, children, actions }: { title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="state-box">
      <h3>{title}</h3>
      {children ? <p className="small muted">{children}</p> : null}
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}

export function Badge({ children, tone = "" }: { children: React.ReactNode; tone?: "" | "ok" | "warn" | "bad" | "neutral" | "accent" }) {
  return <span className={"badge" + (tone ? " " + tone : "")}>{children}</span>;
}

/** A button that shows a busy state while its async action runs and reports errors via onError. */
export function ActionButton({ children, run, className = "btn sm", onError, disabled, type = "button", ...rest }: {
  children: React.ReactNode;
  run: () => Promise<unknown> | unknown;
  className?: string;
  onError?: (e: unknown) => void;
  disabled?: boolean;
  type?: "button" | "submit";
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type">) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      {...rest}
      type={type}
      className={className}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      onClick={async () => {
        setBusy(true);
        try {
          await run();
        } catch (e) {
          onError?.(e);
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, children, id }: { label: string; hint?: string; children: React.ReactNode; id?: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint ? <span className="hint">{hint}</span> : null}
      {children}
    </div>
  );
}

export function Skeleton() {
  return <div className="skeleton" aria-hidden="true" />;
}
