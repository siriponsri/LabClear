"use client";
import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ gfm: true, breaks: true });

/**
 * Assistant replies are Markdown. The server already removed links, images and HTML
 * (services/conversation_agent.clean_reply); DOMPurify is a second layer. Citation markers
 * like [nlm-a1c] become small numbered chips via onCitation.
 */
export function Markdown({ text, citations = [], className = "message-body" }: { text: string; citations?: string[]; className?: string }) {
  const html = useMemo(() => {
    const index = new Map(citations.map((id, i) => [id, i + 1]));
    const withCites = text.replace(/\[([a-z0-9][a-z0-9_-]+)\]/g, (m, id: string) =>
      index.has(id) ? `<sup class="cite" data-cite="${id}">${index.get(id)}</sup>` : m,
    );
    const raw = marked.parse(withCites, { async: false }) as string;
    if (typeof window === "undefined") return raw.replace(/<(?!\/?(p|ul|ol|li|strong|em|code|br|sup|h[1-6]|blockquote)\b)[^>]*>/g, "");
    return DOMPurify.sanitize(raw, { ALLOWED_TAGS: ["p", "ul", "ol", "li", "strong", "em", "code", "br", "sup", "h3", "h4", "blockquote"], ALLOWED_ATTR: ["class", "data-cite"] });
  }, [text, citations]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
