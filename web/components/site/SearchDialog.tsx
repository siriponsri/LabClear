"use client";
/*
 * Site search (Ctrl/⌘ K, "/" or the header button). Searches packages by name, test and Thai
 * everyday words ("น้ำตาล" finds glucose tests), individual tests and site pages. Arrow keys
 * move, Enter opens, Escape closes. The catalog is read once from /api/business/site/common.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { money } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import type { Common, Package } from "@/lib/types";
import { matchTests, parseQuery, scorePackage, uniqueTests } from "@/components/public/search";
import "@/app/styles/public.css";

const PAGES: { title: string; href: string; keys: string }[] = [
  { title: "Health checks", href: "/packages", keys: "packages catalog tests price แพ็กเกจ ตรวจสุขภาพ รายการตรวจ ราคา" },
  { title: "Compare packages", href: "/compare", keys: "compare side by side เปรียบเทียบ เทียบ" },
  { title: "AI Lab Report", href: "/lab-reports", keys: "lab report ai read result ผลแล็บ ผลตรวจ อ่านผล ใบรายงาน" },
  { title: "Lab dashboard", href: "/app?view=labs", keys: "dashboard trends results over time แดชบอร์ด แนวโน้ม" },
  { title: "Plans and Plus", href: "/app?view=plan", keys: "plan plus subscription 355 แผน พลัส สมัครสมาชิก" },
  { title: "Organizations", href: "/organizations", keys: "company team employees quotation hospital documents องค์กร บริษัท พนักงาน ใบเสนอราคา โรงพยาบาล เอกสาร" },
  { title: "Centers", href: "/centers", keys: "center branch location hours map ศูนย์ สาขา เวลาเปิด แผนที่" },
  { title: "Help and policies", href: "/help", keys: "help faq refund cancel payment policy fasting ช่วยเหลือ คำถาม ยกเลิก คืนเงิน ชำระเงิน งดอาหาร นโยบาย" },
  { title: "Medical sources", href: "/sources", keys: "sources references evidence แหล่งอ้างอิง เอกสารอ้างอิง" },
  { title: "Request a time", href: "/app?view=book", keys: "book appointment time จอง นัด นัดหมาย" },
  { title: "My appointments", href: "/app?view=bookings", keys: "appointments booking pay การนัดหมาย นัดของฉัน" },
  { title: "Privacy", href: "/privacy", keys: "privacy data guest ความเป็นส่วนตัว ข้อมูล" },
];

type Item = { kind: string; title: string; sub?: string; href: string };

let catalogCache: Package[] | null = null;

export function SearchDialog() {
  const { t, tf } = useT();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [packages, setPackages] = useState<Package[] | null>(catalogCache);
  const [failed, setFailed] = useState(false);
  const [sel, setSel] = useState({ q: "", i: 0 });
  const q = useDeferredValue(query);

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    const slash = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (el && (/^(input|textarea|select)$/i.test(el.tagName) || el.isContentEditable)) return;
      if (document.querySelector("dialog[open]")) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener("labclear-search-open", toggle);
    document.addEventListener("keydown", slash);
    return () => {
      window.removeEventListener("labclear-search-open", toggle);
      document.removeEventListener("keydown", slash);
    };
  }, []);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      input.current?.focus();
      if (!catalogCache) {
        api
          .get<Common>("/site/common")
          .then((c) => {
            catalogCache = c.catalog.packages.filter((p) => p.active !== false);
            setPackages(catalogCache);
            setFailed(false);
          })
          .catch(() => setFailed(true));
      }
    }
    if (!open && d.open) d.close();
  }, [open]);

  // Build the result list during render (no effect): packages, tests, ask, pages.
  const parsed = parseQuery(q);
  const text = q.trim();
  const lower = text.toLowerCase();
  const items: Item[] = [];
  if (text && packages) {
    packages
      .map((p, order) => ({ p, order, score: scorePackage(p, parsed) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.order - b.order)
      .slice(0, 5)
      .forEach(({ p }) => items.push({ kind: t("Package"), title: p.name, sub: money(p.price_thb) + " · " + p.services.slice(0, 3).map((x) => t(x)).join(", "), href: "/packages/" + encodeURIComponent(p.id) }));
    matchTests(uniqueTests(packages), parsed)
      .slice(0, 4)
      .forEach((test) => items.push({ kind: t("Test"), title: test, sub: t("Health checks that include this test"), href: "/packages?q=" + encodeURIComponent(test) }));
  }
  const packageHits = items.length;
  if (text) items.push({ kind: t("Ask"), title: tf("Ask the assistant: “{q}”", { q: text.slice(0, 60) }), sub: t("Answers with sources"), href: "/app?q=" + encodeURIComponent(text) });
  PAGES.filter((p) => {
    if (!text) return true;
    // Translations may hold invisible word joiners (U+2060) that keep Thai words on one line.
    const hay = (t(p.title) + " " + p.title + " " + p.keys).replace(/\u2060/g, "").toLowerCase();
    return hay.includes(lower) || p.keys.split(" ").some((k) => k.length >= 2 && lower.includes(k.toLowerCase()));
  })
    .slice(0, text ? 4 : 6)
    .forEach((p) => items.push({ kind: t("Page"), title: t(p.title), href: p.href }));

  const active = Math.min(sel.q === q ? sel.i : 0, Math.max(0, items.length - 1));
  const setActive = (i: number) => setSel({ q, i });

  useEffect(() => {
    if (open) document.getElementById("sr-" + active)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function go(item: Item | undefined) {
    if (!item) return;
    setOpen(false);
    router.push(item.href);
  }

  return (
    <dialog
      ref={dialog}
      className="search-dialog"
      aria-label={t("Search")}
      onClose={() => {
        setOpen(false);
        setQuery("");
      }}
      onClick={(e) => {
        if (e.target === dialog.current) setOpen(false);
      }}
    >
      <form
        className="search-head"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go(items[active]);
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
        <label className="sr-only" htmlFor="search-input">
          {t("Search health checks, tests and pages")}
        </label>
        <input
          id="search-input"
          ref={input}
          type="search"
          role="combobox"
          autoComplete="off"
          maxLength={80}
          placeholder={t("Search a test, a package or a page, e.g. น้ำตาล")}
          value={query}
          aria-expanded={open && items.length > 0}
          aria-controls="search-results"
          aria-autocomplete="list"
          aria-activedescendant={items.length ? "sr-" + active : undefined}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive(Math.min(items.length - 1, active + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive(Math.max(0, active - 1));
            } else if (e.key === "Home" && items.length && !query) {
              setActive(0);
            } else if (e.key === "End" && items.length && !query) {
              setActive(items.length - 1);
            }
          }}
        />
        <kbd>Esc</kbd>
      </form>
      {open ? (
        <>
          <div className="search-results" id="search-results" role="listbox" aria-label={t("Results")}>
            {items.map((item, i) => (
              <Link
                key={item.kind + item.href + i}
                id={"sr-" + i}
                role="option"
                aria-selected={i === active}
                className="search-item"
                href={item.href}
                tabIndex={-1}
                onClick={() => setOpen(false)}
              >
                <span className="search-kind tiny">{item.kind}</span>
                <strong>{item.title}</strong>
                {item.sub ? <span className="tiny muted">{item.sub}</span> : null}
              </Link>
            ))}
          </div>
          {text && packages && !packageHits ? (
            <p className="search-empty small muted">
              {tf("No package matches “{q}”. Try a test name such as {examples}.", { q: text.slice(0, 40) })
                .split("{examples}")
                .map((part, i) => (
                  <span key={i}>
                    {i ? (
                      <>
                        HbA1c, <span lang="th">ไขมัน</span> {t("or")} <span lang="th">น้ำตาล</span>
                      </>
                    ) : null}
                    {part}
                  </span>
                ))}
            </p>
          ) : null}
          {text && failed ? <p className="search-empty small muted">{t("Package search is unavailable right now.")}</p> : null}
          {text && !packages && !failed ? (
            <p className="search-empty small muted" role="status">
              {t("Loading packages…")}
            </p>
          ) : null}
        </>
      ) : null}
      <p className="search-foot tiny muted">{t("Enter opens the highlighted result. Arrow keys move. Press Ctrl K or ⌘ K anywhere to search.")}</p>
    </dialog>
  );
}
