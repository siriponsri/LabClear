"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { AccountSlot } from "./AccountSlot";
import { LanguageSwitch, ThemeToggle } from "./Controls";

export function SiteHeader() {
  const { t } = useT();
  const path = usePathname() || "/";
  const [menu, setMenu] = useState(false);
  const [nav, setNav] = useState(false);
  const drop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMenu(false);
    setNav(false);
  }, [path]);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!drop.current?.contains(e.target as Node)) setMenu(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(false);
        setNav(false);
      }
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        window.dispatchEvent(new Event("labclear-search-open"));
      }
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", key);
    };
  }, []);

  const current = (href: string) => (path === href ? { "aria-current": "page" as const } : {});
  return (
    <header className="site-header">
      <div className="nav-bar">
        <Link className="brand" href="/" aria-label={t("LabClear home")}>
          LabClear
        </Link>
        <nav className={"main-nav" + (nav ? " open" : "")} id="main-nav" aria-label={t("Main")}>
          <div className="nav-drop" ref={drop}>
            <button
              className="nav-drop-btn"
              type="button"
              aria-expanded={menu}
              aria-controls="menu-checks"
              onClick={() => setMenu((m) => !m)}
              {...(path.startsWith("/packages") || path === "/compare" ? { "aria-current": "page" as const } : {})}
            >
              {t("Health checks")}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="m7 10 5 5 5-5" />
              </svg>
            </button>
            <div className="nav-menu" id="menu-checks" hidden={!menu}>
              <Link href="/packages?segment=individual&review=excluded">
                <strong>{t("Core health checks")}</strong>
                <span>{t("Annual-style packages you can book directly")}</span>
              </Link>
              <Link href="/packages?segment=individual&review=only">
                <strong>{t("Follow-up tests")}</strong>
                <span>{t("Targeted tests reviewed with our team first")}</span>
              </Link>
              <Link href="/packages?segment=organization">
                <strong>{t("For organizations")}</strong>
                <span>{t("Per-person pricing for 20 or more people")}</span>
              </Link>
              <Link href="/compare">
                <strong>{t("Compare packages")}</strong>
                <span>{t("Up to three, test by test, side by side")}</span>
              </Link>
              <Link href="/packages">
                <strong>{t("All health checks")}</strong>
                <span>{t("Search by test name, price or center")}</span>
              </Link>
            </div>
          </div>
          <Link href="/lab-reports" {...current("/lab-reports")}>
            {t("AI Lab Report")}
          </Link>
          <Link href="/organizations" {...current("/organizations")}>
            {t("Organizations")}
          </Link>
          <Link href="/centers" {...current("/centers")}>
            {t("Centers")}
          </Link>
          <Link href="/sources" {...current("/sources")}>
            {t("Sources")}
          </Link>
          <Link href="/help" {...current("/help")}>
            {t("Help")}
          </Link>
          <Link className="nav-mobile-only" href="/app?view=bookings">
            {t("My appointments")}
          </Link>
          <Link className="nav-mobile-only" href="/app?view=book">
            {t("Request a time")}
          </Link>
          <Link className="nav-mobile-only" href="/app">
            {t("Your account")}
          </Link>
        </nav>
        <div className="nav-actions">
          <LanguageSwitch />
          <button className="icon-btn nav-search" type="button" aria-haspopup="dialog" aria-label={t("Search health checks and pages")} onClick={() => window.dispatchEvent(new Event("labclear-search-open"))}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4 4" />
            </svg>
          </button>
          <ThemeToggle />
          <AccountSlot />
          <Link className="btn primary sm nav-cta" href="/app?view=book">
            {t("Request a time")}
          </Link>
          <button className="icon-btn nav-toggle" type="button" aria-controls="main-nav" aria-expanded={nav} aria-label={nav ? t("Close menu") : t("Open menu")} onClick={() => setNav((n) => !n)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M4 8h16M4 16h16" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
