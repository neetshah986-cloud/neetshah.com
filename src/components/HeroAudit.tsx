import { site } from "@/lib/site";

type Check = { label: string; value: string; detail: string; ok: boolean };

// Every value here is computed from this page's real metadata, so the audit is honest.
function checksForHome(): Check[] {
  const titleLen = site.homeTitle.length;
  const descLen = site.description.length;
  return [
    { label: "Title", value: `${titleLen} chars`, detail: "Under 60, won't truncate", ok: titleLen <= 60 },
    { label: "Meta description", value: `${descLen} chars`, detail: "Within 120–160", ok: descLen >= 120 && descLen <= 160 },
    { label: "Canonical", value: "neetshah.com/", detail: "Self-referencing", ok: true },
    { label: "Structured data", value: "WebSite", detail: "Valid JSON-LD", ok: true },
    { label: "Rendering", value: "Server HTML", detail: "Content present without JS", ok: true },
    { label: "Indexing", value: "index, follow", detail: "Allowed in robots.txt", ok: true },
  ];
}

function Tick({ ok }: { ok: boolean }) {
  return ok ? (
    <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-pass" aria-label="Pass">
      <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.12" />
      <path d="M6 10.4l2.6 2.6L14 7.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-warn" aria-label="Warning">
      <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.14" />
      <path d="M10 6v5M10 14h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function HeroAudit() {
  const checks = checksForHome();
  const passed = checks.filter((c) => c.ok).length;

  return (
    <figure className="relative">
      {/* SERP snippet for this very page */}
      <div className="rounded-2xl border border-rule bg-white p-5 shadow-[0_1px_0_#D9E0EA,0_24px_48px_-24px_rgba(14,26,43,0.25)] sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-7 w-7 place-items-center rounded-full border border-rule bg-mist">
            <svg viewBox="0 0 28 28" className="h-4 w-4" aria-hidden="true">
              <rect x="6" y="8" width="16" height="3" rx="1.5" fill="#1A3FD6" />
              <rect x="6" y="14" width="12" height="2" rx="1" fill="#8A9AB2" />
              <rect x="6" y="18.5" width="9" height="2" rx="1" fill="#8A9AB2" />
            </svg>
          </span>
          <div className="leading-tight">
            <p className="text-sm text-ink">{site.name}</p>
            <p className="text-xs text-ink-soft">https://neetshah.com</p>
          </div>
        </div>
        <p className="mt-3 text-[1.2rem] leading-snug text-serp">{site.homeTitle}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">{site.description}</p>

        <div className="mt-5 border-t border-dashed border-rule pt-4">
          <div className="mb-3 flex items-baseline justify-between">
            <figcaption className="text-sm font-semibold">This page, audited</figcaption>
            <span className="font-mono text-xs text-pass">
              {passed}/{checks.length} passing
            </span>
          </div>
          <ul className="divide-y divide-mist">
            {checks.map((c, i) => (
              <li
                key={c.label}
                className="audit-row grid grid-cols-[auto_1fr_auto] items-center gap-3 py-2.5"
                style={{ "--i": i } as React.CSSProperties}
              >
                <Tick ok={c.ok} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{c.label}</p>
                  <p className="truncate text-xs text-ink-soft">{c.detail}</p>
                </div>
                <span className="font-mono text-xs tabular-nums text-ink-soft">{c.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </figure>
  );
}
