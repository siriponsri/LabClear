"use client";
/*
 * Marks a block for a one-time entrance when it scrolls into view. The finished state is the default:
 * the block is only "armed" (CSS hides the start state) when motion is allowed and it is still below
 * the fold, so nothing is hidden without JavaScript, under reduced motion, or after a jump link.
 */
import { useEffect, useRef } from "react";

export function InView({ as: Tag = "div", className, children, ...rest }: { as?: "div" | "ol" | "ul"; className?: string; children: React.ReactNode } & React.AriaAttributes) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !document.documentElement.classList.contains("motion") || !("IntersectionObserver" in window)) return;
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight * 0.92 && r.bottom > 0) return;
    el.dataset.armed = "";
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        el.dataset.in = "";
        io.disconnect();
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref as React.RefObject<never>} className={className} {...rest}>
      {children}
    </Tag>
  );
}
