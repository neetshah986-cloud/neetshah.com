import type { Tone } from "@/lib/speed/types";

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
