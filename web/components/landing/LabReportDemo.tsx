"use client";
/*
 * Signature interaction: a synthetic lab report. Choosing a row shows what the real assistant does
 * with a confirmed value: put it on the range printed on the report (code compares the numbers),
 * then explain it in plain words with numbered citations to records in the knowledge base.
 * Keyboard: the rows are a vertical tab list (roving tabindex, arrows, Home, End). Works on touch.
 * Without JavaScript the first row and its explanation are already rendered.
 */
import { useRef, useState } from "react";

export type DemoSource = { n: number; title: string; publisher: string; url: string };
export type DemoRow = {
  id: string;
  test: string;
  note: string;
  value: string;
  unit: string;
  range: string;
  status: "above" | "within" | "below";
  statusShort: string;
  verdict: string;
  rulerLabel: string;
  band: { from: number; to: number };
  at: number;
  ticks: { at: number; label: string }[];
  sentences: { text: string; cite?: number }[];
  sources: DemoSource[];
};
export type DemoCopy = {
  listLabel: string;
  test: string;
  result: string;
  range: string;
  status: string;
  confirmed: string;
  explained: string;
  compares: string;
  sourcesTitle: string;
  newTab: string;
};

const tone = (s: DemoRow["status"]) => (s === "within" ? "ok" : "warn");

export function LabReportDemo({ rows, copy, children }: { rows: DemoRow[]; copy: DemoCopy; children?: React.ReactNode }) {
  const [index, setIndex] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const panel = useRef<HTMLDivElement>(null);
  const row = rows[index];

  const select = (i: number, focus: boolean) => {
    const next = (i + rows.length) % rows.length;
    setIndex(next);
    if (focus) tabs.current[next]?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    const map: Record<string, number> = { ArrowDown: index + 1, ArrowRight: index + 1, ArrowUp: index - 1, ArrowLeft: index - 1, Home: 0, End: rows.length - 1 };
    if (!(e.key in map)) return;
    e.preventDefault();
    select(map[e.key], true);
  };

  const onPick = (i: number) => {
    select(i, false);
    // On a phone the explanation sits below the report: bring it into view if it is off-screen.
    const el = panel.current;
    if (!el || !matchMedia("(max-width: 900px)").matches) return;
    const r = el.getBoundingClientRect();
    if (r.top > innerHeight - 120) {
      const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "nearest", behavior: smooth ? "smooth" : "auto" });
    }
  };

  return (
    <div className="lc-demo-grid">
      <div className="lc-paper">
        {children}
        <div className="lc-rows" role="tablist" aria-orientation="vertical" aria-label={copy.listLabel} onKeyDown={onKey}>
          <div className="lc-row lc-row-head" aria-hidden="true">
            <span>{copy.test}</span>
            <span>{copy.result}</span>
            <span>{copy.range}</span>
            <span className="lc-row-flag">{copy.status}</span>
          </div>
          {rows.map((r, i) => (
            <button
              key={r.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              id={`lc-row-${r.id}`}
              className="lc-row"
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-controls="lc-explain"
              tabIndex={i === index ? 0 : -1}
              onClick={() => onPick(i)}
            >
              <span className="lc-row-test">
                {r.test}
                <small>{r.note}</small>
              </span>
              <span className="lc-row-value num">
                {r.value}
                <small>{r.unit}</small>
              </span>
              <span className="lc-row-range num">{r.range}</span>
              <span className="lc-row-flag">
                <span className={`badge ${tone(r.status)}`}>{r.statusShort}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="lc-explain" id="lc-explain" role="tabpanel" aria-labelledby={`lc-row-${row.id}`} ref={panel}>
        <ol className="lc-trail">
          <li>
            <Check />
            <span>
              {copy.confirmed} <strong className="num">{row.value} {row.unit}</strong>
            </span>
          </li>
          <li>
            <Check />
            <span>{copy.explained}</span>
          </li>
        </ol>

        <div className="lc-explain-head">
          <h3>{row.test}</h3>
          <span className={`badge ${tone(row.status)}`}>{row.verdict}</span>
        </div>

        <div className="lc-ruler" role="img" aria-label={row.rulerLabel}>
          <div className="lc-ruler-track">
            <span className="lc-ruler-band" style={{ transform: `translateX(${row.band.from}%) scaleX(${(row.band.to - row.band.from) / 100})` }} />
            {[0, 1].map((k) => {
              const tick = row.ticks[k];
              return (
                <span key={k} className="lc-ruler-tick" style={{ transform: `translateX(${tick ? tick.at : 0}%)`, opacity: tick ? 1 : 0 }}>
                  <span>{tick?.label}</span>
                </span>
              );
            })}
            <span className="lc-ruler-pos" data-status={row.status} style={{ transform: `translateX(${row.at}%)` }}>
              <span className="lc-ruler-mark">
                <b className="num">{row.value}</b>
              </span>
            </span>
          </div>
        </div>
        <p className="lc-compares">{copy.compares}</p>

        <p className="lc-explain-text">
          {row.sentences.map((s, i) => (
            <span key={i}>
              {s.text}
              {s.cite ? (
                <a className="cite" href={`#lc-src-${row.id}-${s.cite}`} aria-label={`${copy.sourcesTitle} ${s.cite}`}>
                  {s.cite}
                </a>
              ) : null}{" "}
            </span>
          ))}
        </p>

        <div className="lc-cites">
          <p className="lc-cites-title">{copy.sourcesTitle}</p>
          <ol>
            {row.sources.map((s) => (
              <li key={s.n} id={`lc-src-${row.id}-${s.n}`}>
                <span className="cite" aria-hidden="true">
                  {s.n}
                </span>
                <span>
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.title}
                    <span className="sr-only"> ({copy.newTab})</span>
                  </a>
                  <span className="lc-cite-pub">{s.publisher}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6.6" />
      <path d="m5.4 8.2 1.8 1.8 3.4-3.6" />
    </svg>
  );
}
