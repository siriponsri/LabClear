/* Shapes the chat reads from /api/business (routers/business.py turn(), read_into_chat()). */
import type { Message, Source, Step } from "@/lib/api/client";
import type { WorkspaceState } from "@/components/workspace/context";

export type Attachment = { report_id?: string; page?: number; name?: string; kind?: string; sample?: boolean; preview?: string };
export type Observation = { field_id?: string; name?: string; value: string; unit?: string; reference?: string; status?: string };
export type Shortcut = { type: string; args?: Record<string, any> };
export type ReportField = { id?: string; name: string; value: string; unit?: string; reference?: string; printed_flag?: string; status?: string };
export type ActionPreview = {
  type: "book" | "quote" | "pay" | "handoff" | "link" | string;
  quote?: { items: { name: string }[]; total_thb: number; package_ids?: string[] };
  branch_id?: string;
  date?: string;
  time?: string;
  summary?: string;
};
export type Checks = { citations_validated?: number; observations?: number; [k: string]: unknown };
export type TraceRow = { id?: string; label: string; detail?: string };

export type ChatMessage = Message & {
  attachments?: Attachment[];
  observations?: Observation[];
  followups?: string[];
  ui?: Shortcut[];
  action?: ActionPreview | null;
  action_id?: string;
  dot?: { id: string; name: string } | null;
  checks?: Checks | null;
  trace?: TraceRow[];
  // report_read cards
  report_id?: string;
  fields?: ReportField[];
  warnings?: string[];
  state?: "draft" | "confirmed" | "discarded";
  sample?: boolean;
  critical_note?: string;
};

export type { Source, Step, WorkspaceState };

/** Files attached to the next message (kept in memory only). */
export type DraftFile = { file: File; name: string; preview: string };
export type DraftSample = { id: string; title: string; preview: string };
export type Draft = { files: DraftFile[]; sample: DraftSample | null };

/** The turn being prepared: the message just sent and the steps streaming in. */
export type LiveStep = Omit<Step, "state"> & { state: "running" | "done" | "failed" };
export type LiveTurn = {
  user: { content: string; attachments: Attachment[] } | null;
  steps: LiveStep[];
  human: boolean;
  stopped: boolean;
  note: string;
};

/** PageContext in routers/business.py. */
export type PageContext = { path: string; package_id?: string; compare_ids?: string[]; view?: string };
