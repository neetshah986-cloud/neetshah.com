import Link from "next/link";
import { person } from "@/lib/site";

export function Initials({
  className = "h-11 w-11 text-sm",
  light = false,
}: {
  className?: string;
  light?: boolean;
}) {
  const tone = light ? "bg-paper text-ink" : "bg-ink text-paper";
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full font-semibold tracking-tight ${tone} ${className}`}
    >
      NS
    </span>
  );
}

export function LinkedInIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.95v5.66H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.8 0 0 .77 0 1.73v20.54C0 23.23.8 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

export function LinkedInLink({ className = "" }: { className?: string }) {
  return (
    <a
      href={person.linkedin}
      target="_blank"
      rel="me noopener"
      className={`inline-flex items-center gap-2 font-medium text-serp hover:underline ${className}`}
    >
      <LinkedInIcon />
      Connect on LinkedIn
    </a>
  );
}

// Small byline used under the hero and at the end of guides.
export function Byline({ verb = "Built by" }: { verb?: string }) {
  return (
    <div className="flex items-center gap-3.5">
      <Initials />
      <div className="leading-snug">
        <p>
          {verb}{" "}
          <Link href="/about" className="font-semibold hover:text-serp">
            {person.name}
          </Link>
        </p>
        <p className="text-sm text-ink-soft">{person.role}</p>
      </div>
    </div>
  );
}
