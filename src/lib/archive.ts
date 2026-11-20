// When a site blocks automated requests, check the Internet Archive's latest copy of the page instead.
// The Wayback Machine is a public archive built for this kind of access, so nothing is bypassed.
import { fetchPage, type FetchedPage } from "@/lib/safe-fetch";

export type Archived = { page: FetchedPage; timestamp: string; snapshotUrl: string };

/** "20261114083012" -> "2026-11-14T08:30:12Z" */
export const waybackDate = (ts: string) => `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10) || "00"}:${ts.slice(10, 12) || "00"}:${ts.slice(12, 14) || "00"}Z`;

export async function fetchArchived(url: string): Promise<Archived | null> {
  try {
    const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const lookup = await fetchPage(`https://archive.org/wayback/available?url=${encodeURIComponent(target)}`, { accept: "json", timeoutMs: 10_000 });
    const closest = JSON.parse(lookup.html)?.archived_snapshots?.closest;
    if (!closest?.available || String(closest.status) !== "200" || !/^\d{14}$/.test(closest.timestamp)) return null;
    const ts: string = closest.timestamp;
    const original = String(closest.url).replace(/^https?:\/\/web\.archive\.org\/web\/\d{14}[a-z_]*\//, "");
    // id_ returns the page exactly as it was archived, without the Wayback toolbar or rewritten links.
    const raw = `https://web.archive.org/web/${ts}id_/${original}`;
    const page = await fetchPage(raw, { timeoutMs: 20_000 });
    if (page.status >= 400) return null;
    return { page, timestamp: ts, snapshotUrl: `https://web.archive.org/web/${ts}/${original}` };
  } catch {
    return null;
  }
}
