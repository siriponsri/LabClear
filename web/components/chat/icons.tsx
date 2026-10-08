/* Inline icons for the chat (one stroke width, same paths as 3.x static/js/turns.js). */
const PATHS = {
  source: <><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20z" /><path d="M14 3.5V8h4M10 12h5M10 15.5h5" /></>,
  compare: <path d="M5 19.5V11M10 19.5V5M15 19.5V9M20 19.5V13" />,
  calendar: <><rect x="4" y="5.5" width="16" height="14.5" rx="1.5" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></>,
  staff: <path d="M5 6.5h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-7l-4 3.5v-3.5H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" />,
  open: <path d="M9 5H5.5a.5.5 0 0 0-.5.5v13a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5V15M13 5h6v6M19 5l-8 8" />,
  value: <path d="M4 18h16M7 18V9M12 18V6M17 18v-5" />,
  send: <path d="M12 19V5M6 11l6-6 6 6" />,
  check: <><path d="M12 3.5 5 6.5v5c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9v-5z" /><path d="m9 12 2.2 2.2L15.5 10" /></>,
  attach: <path d="M8.5 12.5 14 7a3 3 0 0 1 4.2 4.2l-7 7a5 5 0 0 1-7-7L11 4.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  folder: <path d="M3.5 7a1 1 0 0 1 1-1h4.6l2 2.2h8.4a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z" />,
  panel: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M9 4.5v15" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="9.5" rx="1.5" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></>,
  building: <><path d="M5 20.5V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v15.5M15 9.5h3a1 1 0 0 1 1 1v10M3.5 20.5h17" /><path d="M8.5 8h3M8.5 11.5h3M8.5 15h3" /></>,
  chevron: <path d="m7 10 5 5 5-5" />,
  stop: <rect x="7" y="7" width="10" height="10" rx="1.5" />,
  expand: <path d="M14 4.5h5.5V10M10 19.5H4.5V14M19.5 4.5 13 11M4.5 19.5 11 13" />,
  person: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></>,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}

export function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <circle cx="6" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="18" cy="12" r="1.5" />
    </svg>
  );
}
