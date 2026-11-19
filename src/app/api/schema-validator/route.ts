import { FetchError, fetchPage, rateLimited } from "@/lib/safe-fetch";
import { analyse } from "@/lib/schema";

const MAX_CODE = 1024 * 1024;

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  if (rateLimited(ip)) return Response.json({ error: "Too many checks in a minute. Wait a moment and try again." }, { status: 429 });

  let body: { mode?: string; url?: string; code?: string };
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
    const page = await fetchPage(url);
    const report = analyse(page.html, { kind: "url", url, finalUrl: page.finalUrl, status: page.status, bytes: page.bytes, ms: page.ms });
    if (page.status >= 400) {
      report.counts.warnings++;
      report.issues.unshift({
        severity: "warning",
        code: "http-status",
        message: `The page returned HTTP ${page.status}.`,
        hint: "Search engines don't index pages that return an error, so their structured data isn't used.",
      });
    }
    return Response.json(report);
  } catch (e) {
    if (e instanceof FetchError) return Response.json({ error: e.message }, { status: e.status });
    console.error("schema-validator", e);
    return Response.json({ error: "Something went wrong while checking that page. Try again, or paste the code instead." }, { status: 500 });
  }
}
