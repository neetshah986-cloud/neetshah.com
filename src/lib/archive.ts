// When a site blocks automated requests, check the Internet Archive's latest copy of the page instead.
// The Wayback Machine is a public archive built for this kind of access, so nothing is bypassed.
import { fetchPage, type FetchedPage } from "@/lib/safe-fetch";

export type Archived = { page: FetchedPage; timestamp: string; snapshotUrl: string };

/** "20261114083012" -> "2026-11-14T08:30:12Z" */
export const waybackDate = (ts: string) => `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10) || "00"}:${ts.slice(10, 12) || "00"}:${ts.slice(12, 14) || "00"}Z`;

// Newest successful capture, from the CDX index (the availability API doesn't always return the latest).
async function latestFromCdx(target: string): Promise<{ ts: string; original: string } | null> {
  try {
    const q = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(target)}&output=json&fl=timestamp,original,statuscode,mimetype&filter=statuscode:200&filter=mimetype:text/html&limit=-1`;
    const res = await fetchPage(q, { accept: "json", timeoutMs: 8_000 });
    const rows: string[][] = JSON.parse(res.html || "[]");
    const last = rows.length > 1 ? rows[rows.length - 1] : null; // first row is the header
    return last && /^\d{14}$/.test(last[0]) ? { ts: last[0], original: last[1] } : null;
  } catch {
    return null;
  }
}

async function closestFromAvailability(target: string): Promise<{ ts: string; original: string } | null> {
  try {
    const res = await fetchPage(`https://archive.org/wayback/available?url=${encodeURIComponent(target)}`, { accept: "json", timeoutMs: 8_000 });
    const c = JSON.parse(res.html)?.archived_snapshots?.closest;
    if (!c?.available || String(c.status) !== "200" || !/^\d{14}$/.test(c.timestamp)) return null;
    return { ts: c.timestamp, original: String(c.url).replace(/^https?:\/\/web\.archive\.org\/web\/\d{14}[a-z_]*\//, "") };
  } catch {
    return null;
  }
}

export async function fetchArchived(url: string): Promise<Archived | null> {
  try {
    const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const snap = (await latestFromCdx(target)) ?? (await closestFromAvailability(target));
    if (!snap) return null;
    const { ts, original } = snap;
    // id_ returns the page exactly as it was archived, without the Wayback toolbar or rewritten links.
    const raw = `https://web.archive.org/web/${ts}id_/${original}`;
    const page = await fetchPage(raw, { timeoutMs: 20_000 });
    if (page.status >= 400) return null;
    return { page, timestamp: ts, snapshotUrl: `https://web.archive.org/web/${ts}/${original}` };
  } catch {
    return null;
  }
}
