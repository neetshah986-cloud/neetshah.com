import { useState } from "react";
import type { CodeBlock, Tone } from "@/lib/speed/types";

export const TONE_TEXT: Record<Tone, string> = { good: "text-pass", ni: "text-warn", poor: "text-fail" };
export const TONE_LABEL: Record<Tone, string> = { good: "Good", ni: "Needs attention", poor: "Problem" };

export function ToneIcon({ tone, className = "h-4 w-4" }: { tone: Tone; className?: string }) {
  if (tone === "good")
    return (
      <svg viewBox="0 0 20 20" className={`${className} shrink-0 text-pass`} role="img" aria-label="Good">
        <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.15" />
        <path d="M6 10.4l2.6 2.6L14 7.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (tone === "ni")
    return (
      <svg viewBox="0 0 20 20" className={`${className} shrink-0 text-warn`} role="img" aria-label="Needs attention">
        <rect x="2" y="2" width="16" height="16" rx="3" fill="currentColor" opacity="0.15" />
        <path d="M10 5.8v5.2M10 14h.01" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg viewBox="0 0 20 20" className={`${className} shrink-0 text-fail`} role="img" aria-label="Problem">
      <path d="M10 2l8.5 15h-17z" fill="currentColor" opacity="0.15" />
      <path d="M10 7.5v4M10 14.4h.01" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function CopyButton({ text, label = "Copy", className = "" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          /* clipboard blocked */
        }
      }}
      className={`rounded-md border border-rule bg-white px-2.5 py-1 text-xs font-medium text-ink-soft transition-colors hover:border-ink-soft hover:text-ink ${className}`}
    >
      {done ? "Copied" : label}
    </button>
  );
}

export function Code({ block }: { block: CodeBlock }) {
  return (
    <figure className="min-w-0 overflow-hidden rounded-lg border border-rule">
      <figcaption className="flex items-center justify-between gap-3 border-b border-rule bg-mist/60 px-3 py-1.5 text-xs font-medium text-ink-soft">
        <span>{block.label}</span>
        <CopyButton text={block.code} />
      </figcaption>
      <pre className="overflow-x-auto bg-white px-3 py-2.5 font-mono text-[0.8rem] leading-relaxed text-ink">{block.code}</pre>
    </figure>
  );
}

