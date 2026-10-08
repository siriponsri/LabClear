"use client";
/* Hero search: opens the site search dialog (SearchDialog listens for "labclear-search-open"). */
export function SearchPill({ placeholder, label }: { placeholder: string; label: string }) {
  return (
    <button className="lc-search" type="button" aria-haspopup="dialog" aria-label={label} onClick={() => window.dispatchEvent(new Event("labclear-search-open"))}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4 4" />
      </svg>
      <span>{placeholder}</span>
    </button>
  );
}
