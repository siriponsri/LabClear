"use client";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";

export function LanguageSwitch() {
  const { lang, setLang } = useT();
  return (
    <div className="language-switch" role="group" aria-label="ภาษา / Language">
      <button type="button" aria-pressed={lang === "th"} onClick={() => setLang("th")} lang="th">
        TH
      </button>
      <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")} lang="en">
        EN
      </button>
    </div>
  );
}

const current = () =>
  (document.documentElement.dataset.theme as "light" | "dark" | undefined) || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

export function ThemeToggle() {
  const { t } = useT();
  // The server cannot know the visitor's theme, so the label is generic until mounted (no hydration mismatch).
  const [tick, force] = useState(0);
  useEffect(() => force(1), []);
  const next = tick === 0 ? null : current() === "dark" ? "light" : "dark";
  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={next === null ? t("Switch theme") : next === "dark" ? t("Switch to dark theme") : t("Switch to light theme")}
      title={next === null ? t("Switch theme") : next === "dark" ? t("Switch to dark theme") : t("Switch to light theme")}
      onClick={() => {
        const n = current() === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = n;
        try {
          localStorage.setItem("rs-theme", n);
        } catch {
          /* the choice lasts for this page only */
        }
        force((x) => x + 1);
        window.dispatchEvent(new Event("labclear-theme"));
      }}
    >
      <svg className="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
      </svg>
      <svg className="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
      </svg>
    </button>
  );
}
