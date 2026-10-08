"use client";
import { useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { useSession } from "@/lib/session";
import { MAX_COMPARE, parseCompare, queryString, withCompare } from "./compare";

/** Read and change the comparison held in ?compare= without a server round trip. */
export function useCompare() {
  const params = useSearchParams();
  const { t } = useT();
  const { notice } = useSession();
  const ids = parseCompare(params.get("compare"));

  function write(next: string[]) {
    const url = new URL(window.location.href);
    if (next.length) url.searchParams.set("compare", next.join(","));
    else url.searchParams.delete("compare");
    window.history.replaceState(null, "", url.pathname + queryString(url.searchParams) + url.hash);
  }

  /** Returns false when the tray is already full. */
  function toggle(id: string, on: boolean): boolean {
    if (!on) {
      write(ids.filter((x) => x !== id));
      return true;
    }
    if (ids.includes(id)) return true;
    if (ids.length >= MAX_COMPARE) {
      notice(t("You can compare up to three health checks. Remove one first."), "bad");
      return false;
    }
    write([...ids, id]);
    return true;
  }

  return { ids, toggle, clear: () => write([]), link: (href: string) => withCompare(href, ids) };
}
