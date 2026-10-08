"use client";
/*
 * Loads the three.js helix only after the page has painted and the browser is idle, and only when
 * WebGL works and the visitor has not asked to save data. Until then (and as the permanent fallback)
 * the server-rendered SVG helix passed as children is shown. The hero text never waits for this.
 */
import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";

const HeroHelix = dynamic(() => import("@/components/three/HeroHelix"), { ssr: false, loading: () => null });

class Guard extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

type Phase = "wait" | "load" | "live" | "off";

export function HeroBackdrop({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("wait");

  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData || !webglAvailable()) {
      setPhase("off");
      return;
    }
    let idle = 0;
    let timer = 0;
    const start = () => {
      const go = () => setPhase((p) => (p === "wait" ? "load" : p));
      if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(go, { timeout: 1200 });
      else timer = globalThis.setTimeout(go, 200) as unknown as number;
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      window.removeEventListener("load", start);
      if (idle) window.cancelIdleCallback(idle);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <div className="lc-hero-art" data-gl={phase} aria-hidden="true">
      {children}
      {(phase === "load" || phase === "live") && (
        <Guard onError={() => setPhase("off")}>
          <HeroHelix onReady={() => setPhase("live")} onFail={() => setPhase("off")} />
        </Guard>
      )}
    </div>
  );
}
