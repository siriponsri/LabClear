import "server-only";
import { cookies } from "next/headers";
import { isLang, LANG_COOKIE, makeT, type Lang } from "./shared";

export async function getLang(): Promise<Lang> {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(value) ? value : "th";
}

export async function getT() {
  return makeT(await getLang());
}
