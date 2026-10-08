"use client";
/*
 * "Five checks before every answer": the same steps the chat streams (services/business_agent.py),
 * played once when the list scrolls into view. The server renders the finished state, so the list is
 * complete without JavaScript, under reduced motion, and when the section is already on screen.
 */
import { useEffect, useRef, useState } from "react";

export type StreamStep = { id: string; running: string; done: string; detail: string; layer: string | null };
type Copy = { question: string; answer: string; replay: string };

const STEP_MS = 560;
const RUN_MS = 380;

/** phase: -1 finished, -2 waiting (all pending); otherwise step i runs at 2i and is done at 2i+1. */
export function CheckStream({ steps, copy }: { steps: StreamStep[]; copy: Copy }) {
  const root = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const [phase, setPhase] = useState(-1);
  const [armed, setArmed] = useState(false);

  const clear = () => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
  };

  const play = () => {
    clear();
    setPhase(0);
    steps.forEach((_, i) => {
      timers.current.push(window.setTimeout(() => setPhase(2 * i + 1), i * STEP_MS + RUN_MS));
      if (i + 1 < steps.length) timers.current.push(window.setTimeout(() => setPhase(2 * (i + 1)), (i + 1) * STEP_MS));
    });
    timers.current.push(window.setTimeout(() => setPhase(-1), steps.length * STEP_MS + 120));
  };

  useEffect(() => {
    const el = root.current;
    if (!el || !document.documentElement.classList.contains("motion") || !("IntersectionObserver" in window)) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setArmed(true);
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight && r.bottom > 0) return; // already visible: keep the finished list
    setPhase(-2);
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        play();
      },
      { threshold: 0.45 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clear();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- play only reads refs and props that never change

  const state = (i: number) => {
    if (phase === -2) return "pending";
    if (phase === -1) return "done";
    if (phase >= 2 * i + 1) return "done";
    if (phase === 2 * i) return "running";
    return "pending";
  };
  const finished = phase === -1;

  return (
    <div className="lc-stream" ref={root}>
      <p className="lc-stream-q">{copy.question}</p>
      <ol className="lc-steps">
        {steps.map((s, i) => {
          const st = state(i);
          return (
            <li key={s.id} className="lc-step" data-state={st}>
              <span className="lc-step-icon" aria-hidden="true">
                {st === "done" ? (
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m4.2 8.3 2.5 2.5 5-5.3" />
                  </svg>
                ) : null}
              </span>
              <span className="lc-step-body">
                <span className="lc-step-label">{st === "done" ? s.done : s.running}</span>
                <span className="lc-step-detail">{s.detail}</span>
              </span>
              {s.layer ? <span className="lc-step-layer">{s.layer}</span> : null}
            </li>
          );
        })}
      </ol>
      <div className="lc-stream-out" data-shown={finished}>
        <span className="speaker-dot" aria-hidden="true" />
        <span>{copy.answer}</span>
        {armed && finished ? (
          <button className="btn ghost sm lc-replay" type="button" onClick={play}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2.8 8a5.2 5.2 0 1 0 1.6-3.8" />
              <path d="M2.6 2.6v2.8h2.8" />
            </svg>
            {copy.replay}
          </button>
        ) : null}
      </div>
    </div>
  );
}
