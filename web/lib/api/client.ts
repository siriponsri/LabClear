"use client";
/*
 * Browser client for the LabClear API (same origin, /api/business/...).
 *
 * Guest privacy (CEO request 2): a visitor who has not signed in gets a temporary guest token
 * that lives ONLY in this module's memory — never in cookies, localStorage or sessionStorage.
 * Refreshing or closing the page drops the token, a beacon tells the server to delete the
 * temporary chat immediately, and a back/forward cache restore reloads the page. Signed-in
 * customers use the httpOnly session cookie, so their chats are saved in the account.
 */
import type { Lang } from "@/lib/i18n/shared";

export type ApiError = Error & { code?: string; status?: number; detail?: unknown };
export type User = { id: string; email: string; role: string; branch: string; registered: boolean; verified_email: boolean; demo: boolean };
export type Step = { type: "step"; id: string; state: "running" | "done"; label: string; detail: string };
export type Session = {
  user: User;
  csrf: string;
  guest_token: string;
  conversation: Conversation;
  simulation: boolean;
  version: string;
  google: boolean;
  external_business_enabled?: boolean;
};
export type Message = {
  id: string;
  role: "user" | "assistant" | "staff";
  content: string;
  at: number;
  kind?: string;
  sources?: Source[];
  failed?: boolean;
  error?: string;
  error_message?: string;
  retryable?: boolean;
  [key: string]: unknown;
};
export type Source = { id: string; title: string; url: string; publisher: string; data_class: string };
export type Conversation = {
  messages: Message[];
  report_id: string;
  compare_report_id?: string;
  mode: "bot" | "waiting" | "staff";
  version: number;
  chat_id: string;
  title: string;
  project_id: string;
  org_id?: string;
  busy_until?: number;
  [key: string]: unknown;
};

const BASE = "/api/business";
const STAFF_ROLES = ["staff", "manager", "clinical"];

type Listener = () => void;

class LabClearApi {
  csrf = "";
  guestToken = "";
  user: User | null = null;
  google = false;
  version = "";
  lang: Lang = "th";
  accessCode = "";
  private pending: Promise<Session> | null = null;
  private listeners = new Set<Listener>();
  private bound = false;

  /** Subscribe to user/session changes (sign-in, sign-out). */
  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  get isGuest() {
    return !this.user?.registered;
  }
  get isStaff() {
    return STAFF_ROLES.includes(this.user?.role || "");
  }
  get isManager() {
    return this.user?.role === "manager";
  }

  private bindPageLifecycle() {
    if (this.bound || typeof window === "undefined") return;
    this.bound = true;
    // Refresh, close or navigate away: release the temporary chat on the server right away.
    window.addEventListener("pagehide", () => this.closeGuest());
    // A page restored from the back/forward cache must not show an old guest chat.
    window.addEventListener("pageshow", (e) => {
      if (e.persisted) window.location.reload();
    });
  }

  closeGuest() {
    if (!this.guestToken) return;
    const body = JSON.stringify({ guest_token: this.guestToken, csrf: this.csrf });
    try {
      navigator.sendBeacon(BASE + "/guest/close", new Blob([body], { type: "application/json" }));
    } catch {
      /* the server forgets idle guests after 20 minutes anyway */
    }
    this.guestToken = "";
    this.csrf = "";
    this.user = null;
  }

  headers(extra: Record<string, string> = {}, json = false): Record<string, string> {
    return {
      "X-LabClear-Language": this.lang,
      "X-Business-CSRF": this.csrf,
      ...(this.guestToken ? { "X-LabClear-Guest": this.guestToken } : {}),
      ...(this.accessCode ? { "X-LabClear-Access": this.accessCode } : {}),
      ...(json ? { "Content-Type": "application/json" } : {}),
      ...extra,
    };
  }

  async request(path: string, init: RequestInit = {}, accept = "application/json"): Promise<Response> {
    const json = !!init.body && !(init.body instanceof FormData);
    try {
      return await fetch(BASE + path, {
        credentials: "same-origin",
        ...init,
        headers: this.headers({ Accept: accept, ...((init.headers as Record<string, string>) || {}) }, json),
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      throw Object.assign(new Error("You appear to be offline. Check your connection and try again."), { code: "network" });
    }
  }

  async read<T>(r: Response): Promise<T> {
    let d: any;
    try {
      d = await r.json();
    } catch {
      throw Object.assign(new Error("The server response could not be read."), { code: "bad_response", status: r.status });
    }
    if (!r.ok) {
      let message = d?.message || (typeof d?.detail === "string" ? d.detail : "The request could not be completed.");
      if (Array.isArray(d?.detail)) message = "Please check: " + d.detail.map((x: any) => (x.loc || []).slice(-1)[0]).filter(Boolean).join(", ") + ".";
      throw Object.assign(new Error(message), { code: d?.code, status: r.status, detail: d?.detail }) as ApiError;
    }
    return d as T;
  }

  async get<T = any>(path: string, init: RequestInit = {}): Promise<T> {
    return this.read<T>(await this.request(path, init));
  }
  async post<T = any>(path: string, body: unknown = {}, init: RequestInit = {}): Promise<T> {
    return this.read<T>(await this.request(path, { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body), ...init }));
  }
  async put<T = any>(path: string, body: unknown = {}): Promise<T> {
    return this.read<T>(await this.request(path, { method: "PUT", body: JSON.stringify(body) }));
  }
  async patch<T = any>(path: string, body: unknown = {}): Promise<T> {
    return this.read<T>(await this.request(path, { method: "PATCH", body: JSON.stringify(body) }));
  }
  async del<T = any>(path: string): Promise<T> {
    return this.read<T>(await this.request(path, { method: "DELETE" }));
  }

  /**
   * A chat turn whose steps stream as they happen (application/x-ndjson): onStep receives every
   * step event, the result (or the error) arrives last.
   */
  async stream<T = any>(path: string, body: unknown, onStep?: (s: Step) => void, signal?: AbortSignal): Promise<T> {
    const r = await this.request(path, { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body), signal }, "application/x-ndjson");
    if (!(r.headers.get("content-type") || "").includes("ndjson")) return this.read<T>(r);
    const reader = r.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let result: T | null = null;
    let failure: ApiError | null = null;
    const line = (text: string) => {
      if (!text.trim()) return;
      const ev = JSON.parse(text);
      if (ev.type === "step") onStep?.(ev);
      else if (ev.type === "done") result = ev.result;
      else if (ev.type === "error") failure = Object.assign(new Error(ev.message), { code: ev.code, status: ev.status });
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        line(buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
    }
    line(buf);
    if (failure) throw failure;
    if (result === null) throw Object.assign(new Error("The reply was interrupted. Please try again."), { code: "interrupted" });
    return result;
  }

  /** Start or resume the session. Without a session cookie this creates a temporary guest. */
  session(): Promise<Session> {
    this.bindPageLifecycle();
    if (!this.pending) {
      this.pending = this.get<Session>("/session")
        .then((s) => {
          this.csrf = s.csrf;
          this.user = s.user;
          this.guestToken = s.guest_token || "";
          this.google = !!s.google;
          this.version = s.version;
          this.emit();
          return s;
        })
        .finally(() => {
          this.pending = null;
        });
    }
    return this.pending;
  }

  /** Who is signed in, without creating a guest (website header). */
  async me(): Promise<User | null> {
    const r = await this.get<{ user: User | null; csrf: string; google: boolean }>("/me");
    this.google = r.google;
    if (r.user) {
      this.user = r.user;
      this.csrf = r.csrf;
      this.emit();
    }
    return r.user;
  }

  /** Sign in or register. keepGuestChat moves this page's temporary chat into the account. */
  async auth(kind: "login" | "register", email: string, password: string, keepGuestChat = false) {
    if (kind === "register" && !this.csrf) await this.session();
    const r = await this.post<{ user: User; csrf: string; kept_messages?: number }>("/" + kind, { email, password, keep_guest_chat: keepGuestChat });
    this.csrf = r.csrf;
    this.user = r.user;
    this.guestToken = "";
    this.emit();
    return r;
  }

  async logout() {
    await this.post("/logout");
    this.user = null;
    this.csrf = "";
    this.emit();
  }

  /** Report page images need the guest header, so fetch them as blobs for <img>. */
  async objectUrl(apiPath: string): Promise<string> {
    const r = await this.request(apiPath.replace(/^\/api\/business/, ""));
    if (!r.ok) throw new Error("Image unavailable");
    return URL.createObjectURL(await r.blob());
  }
}

export const api = new LabClearApi();
