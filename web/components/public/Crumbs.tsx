import { Fragment } from "react";

/** Breadcrumb trail; the last item is the current page (aria-current). */
export function Crumbs({ label, items, current }: { label: string; items: React.ReactNode[]; current: React.ReactNode }) {
  return (
    <nav className="crumbs small" aria-label={label}>
      {items.map((item, i) => (
        <Fragment key={i}>
          {item} /{" "}
        </Fragment>
      ))}
      <span aria-current="page">{current}</span>
    </nav>
  );
}
