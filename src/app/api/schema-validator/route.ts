import { fetchArchived, waybackDate } from "@/lib/archive";
import { FetchError, fetchPage, rateLimited, type FetchedPage } from "@/lib/safe-fetch";
import { analyse } from "@/lib/schema";
import { inspectGtm } from "@/lib/schema/gtm";

const MAX_CODE = 1024 * 1024;

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  if (rateLimited(`schema:${ip}`, 40)) return Response.json({ error: "Too many checks in a minute. Wait a moment and try again." }, { status: 429 });

  let body: { mode?: string; url?: string; code?: string; lite?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request wasn't valid JSON." }, { status: 400 });
  }

  try {
    if (body.mode === "code") {
      const code = String(body.code ?? "");
      if (!code.trim()) return Response.json({ error: "Paste some JSON-LD or HTML to check." }, { status: 400 });
      if (code.length > MAX_CODE) return Response.json({ error: "That's more than 1 MB of code. Paste a smaller part." }, { status: 413 });
      return Response.json(analyse(code, { kind: "code" }));
    }

    const url = String(body.url ?? "").trim();
    if (!url) return Response.json({ error: "Enter a URL to check." }, { status: 400 });
    const started = Date.now();
    const BLOCKED = [202, 401, 403, 406, 429, 503];
    let page: FetchedPage | null = null;
    let reason = "";
    try {
      page = await fetchPage(url, { timeoutMs: 10_000 });
      if (BLOCKED.includes(page.status) && !/application\/ld\+json|itemscope|typeof=/i.test(page.html)) reason = `returned HTTP ${page.status} to this tool`;
    } catch (e) {
      // Timeouts and dropped connections are how many bot walls answer automated requests.
      if (!(e instanceof FetchError) || e.status !== 504) throw e;
      reason = "didn't respond to this tool";
    }

    // The site blocked us: check the Internet Archive's latest copy instead.
    let archived: Awaited<ReturnType<typeof fetchArchived>> = null;
    if (reason) {
      archived = await fetchArchived(url);
      if (!archived) {
        if (page) {
          // fall through and report the block on the page we did get
        } else
          throw new FetchError(
            "This site blocks automated requests, and the Internet Archive doesn't have a copy of this page to check instead. Use Paste code with the page source, or try again later.",
            504,
          );
      }
    }
    const checked = archived?.page ?? page!;
    const report = analyse(checked.html, {
      kind: "url",
      url,
      finalUrl: archived ? (page?.finalUrl ?? (/^https?:\/\//i.test(url) ? url : `https://${url}`)) : checked.finalUrl,
      status: checked.status,
      bytes: checked.bytes,
      ms: Date.now() - started,
      archived: archived
        ? {
            date: waybackDate(archived.timestamp),
            ageDays: Math.max(0, Math.round((Date.now() - Date.parse(waybackDate(archived.timestamp))) / 86_400_000)),
            snapshotUrl: archived.snapshotUrl,
            reason,
          }
        : undefined,
    });
    if (report.rendering?.tagManager) report.rendering.gtm = await inspectGtm(checked.html);
    const looksBlocked = !archived && BLOCKED.includes(checked.status) && Object.keys(report.items).length === 0;
    if (looksBlocked) {
      report.counts.warnings++;
      report.issues = report.issues.filter((i) => i.code !== "none-found");
      report.issues.unshift({
        severity: "warning",
        code: "blocked",
        message: `The site didn't return the page to this tool (HTTP ${checked.status}), and the Internet Archive has no copy of it.`,
        hint: "It probably blocks automated requests. Use Paste code with the page source instead.",
      });
      report.counts.warnings = report.issues.filter((i) => i.severity === "warning").length;
    } else if (checked.status >= 400) {
      report.counts.warnings++;
      report.issues.unshift({
        severity: "warning",
        code: "http-status",
        message: `The page returned HTTP ${checked.status}.`,
        hint: "Search engines don't index pages that return an error, so their structured data isn't used.",
      });
    }
    // Comparisons and Search Console checks don't need the page source or the content match.
    if (body.lite) return Response.json({ ...report, html: "", content: null, graph: { nodes: [], edges: [] }, blocks: report.blocks.map((b) => ({ ...b, raw: undefined })) });
    return Response.json(report);
  } catch (e) {
    if (e instanceof FetchError) return Response.json({ error: e.message }, { status: e.status });
    console.error("schema-validator", e);
    return Response.json({ error: "Something went wrong while checking that page. Try again, or paste the code instead." }, { status: 500 });
  }
}
