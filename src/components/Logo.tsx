// A search result reduced to its parts: a blue title line over grey snippet lines.
export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden="true">
      <rect width="28" height="28" rx="7" fill="#0E1A2B" />
      <rect x="6" y="8" width="16" height="3" rx="1.5" fill="#6F8CFF" />
      <rect x="6" y="14" width="12" height="2" rx="1" fill="#8A9AB2" />
      <rect x="6" y="18.5" width="9" height="2" rx="1" fill="#8A9AB2" />
    </svg>
  );
}
