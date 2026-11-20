// The root cause behind each metric, in plain language.
import { formatMetric, formatMs, METRICS, type MetricKey, type Rating } from "./metrics";
import { clsCauses, isThirdParty, scriptName, toNode, type Ctx } from "./fixes";
import type { Diagnosis, FieldData, Finding, MetricValue, Phase } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
const PHASES: Record<string, { label: string; tip: string; audits: string[] }> = {
  timeToFirstByte: {
    label: "Waiting for the server",
    tip: "The time until the first byte of HTML arrives.",
    audits: ["document-latency-insight", "redirects"],
  },
  resourceLoadDelay: {
    label: "Waiting to start the download",
    tip: "The gap between the HTML arriving and the browser starting to download the LCP image. Lazy loading, a low priority or late discovery make it long.",
    audits: ["lcp-discovery-insight", "network-dependency-tree-insight", "render-blocking-insight"],
  },
  resourceLoadDuration: {
    label: "Downloading the image",
    tip: "Downloading the LCP image itself. A large file makes this long.",
    audits: ["image-delivery-insight", "cache-insight"],
  },
  elementRenderDelay: {
    label: "Waiting to be shown",
    tip: "The time between the image or text being ready and it appearing. Render-blocking files and busy JavaScript cause this.",
    audits: ["render-blocking-insight", "bootup-time", "font-display-insight", "third-parties-insight"],
  },
};

function clip(t: string, n = 60) {
  return t.length > n ? `${t.slice(0, n).trimEnd()}…` : t;
}

function table(a: any) {
  return (a?.details?.items ?? []).find((i: any) => i.type === "table")?.items ?? [];
}

function linked(ids: string[], findings: Finding[]) {
  const have = new Set(findings.map((f) => f.auditId));
  return [...new Set(ids)].filter((id) => have.has(id));
}

function lcp(c: Ctx, m: MetricValue | undefined, findings: Finding[]): Diagnosis | null {
  if (!m) return null;
  const br = c.audits["lcp-breakdown-insight"];
  const node = toNode((br?.details?.items ?? []).find((i: any) => i.type === "node")) ?? toNode((c.audits["lcp-discovery-insight"]?.details?.items ?? []).find((i: any) => i.type === "node"));
  const raw = table(br).filter((r: any) => typeof r.duration === "number" && PHASES[r.subpart]);
  const total = raw.reduce((s: number, r: any) => s + r.duration, 0) || 1;
  const biggest = raw.reduce((x: any, r: any) => (!x || r.duration > x.duration ? r : x), null);
  const phases: Phase[] = raw.map((r: any) => ({
    label: PHASES[r.subpart].label,
    ms: r.duration,
    share: r.duration / total,
    tip: PHASES[r.subpart].tip,
    main: r === biggest,
  }));
  const isImage = /^<(img|image|video|svg)\b/i.test(node?.snippet ?? "") || raw.some((r: any) => r.subpart === "resourceLoadDuration");
  const what = node ? (isImage ? "the main image" : `the text "${clip(node.label || "")}"`) : "the largest element";
  let headline = `LCP is ${m.display}. Google measures it on ${what}.`;
  let detail = "";
  const disc = (c.audits["lcp-discovery-insight"]?.details?.items ?? []).find((i: any) => i.type === "checklist")?.items ?? {};
  if (biggest && m.rating !== "good") {
    const pct = Math.round((biggest.duration / total) * 100);
    switch (biggest.subpart) {
      case "timeToFirstByte":
        headline = `The server is the main cause: ${pct}% of the LCP time is spent waiting for the HTML.`;
        detail = "Speeding up the server response (caching, a CDN, fewer redirects) moves LCP and every other metric.";
        break;
      case "resourceLoadDelay": {
        const why = disc.eagerlyLoaded?.value === false ? 'because it has loading="lazy"' : disc.requestDiscoverable?.value === false ? "because it isn't in the HTML the server sends" : disc.priorityHinted?.value === false ? "because it isn't marked as high priority" : "because it's found late";
        headline = `The browser starts downloading ${what} too late, ${why}. That wait is ${pct}% of the LCP time.`;
        detail = "The image file isn't the problem here; the browser simply doesn't ask for it soon enough.";
        break;
      }
      case "resourceLoadDuration":
        headline = `${what[0].toUpperCase() + what.slice(1)} takes too long to download: ${pct}% of the LCP time is the download itself.`;
        detail = "Make the file smaller: the right dimensions, WebP or AVIF, and a CDN.";
        break;
      case "elementRenderDelay":
        headline = `${what[0].toUpperCase() + what.slice(1)} is ready but isn't shown: ${pct}% of the LCP time is spent waiting on CSS, fonts or JavaScript.`;
        detail = "Render-blocking files and long JavaScript tasks are holding back the paint.";
        break;
    }
  } else if (m.rating === "good") detail = "No action needed. Keep the main element in the server HTML and avoid lazy loading it.";
  const ids = biggest && m.rating !== "good" ? [...PHASES[biggest.subpart].audits, "lcp-discovery-insight", "image-delivery-insight", "render-blocking-insight", "document-latency-insight"] : ["lcp-discovery-insight", "image-delivery-insight"];
  return { metric: "LCP", rating: m.rating, value: m.display, headline, detail, node, phases: phases.length ? phases : undefined, findingIds: linked(ids, findings) };
}

function cls(c: Ctx, m: MetricValue | undefined, findings: Finding[]): Diagnosis | null {
  if (!m) return null;
  const shifts = clsCauses(c);
  const top = shifts[0];
  const cause = top?.causes[0];
  let headline = `CLS is ${m.display}.`;
  let detail = m.rating === "good" ? "No action needed. The layout stays stable while the page loads." : "";
  if (m.rating !== "good" && top) {
    const moved = top.node?.label || top.node?.selector || "An element";
    headline = cause
      ? `"${clip(moved)}" jumps while the page loads. Cause: ${cause.text.toLowerCase()}${cause.node ? ` (${cause.node.selector})` : ""}.`
      : `"${clip(moved)}" jumps while the page loads, because something above it appears or changes size after it's shown.`;
    detail = "Reserve space for anything that loads late: images need width and height, ads and embeds need a fixed slot, and fonts need a matching fallback.";
  }
  return {
    metric: "CLS",
    rating: m.rating,
    value: m.display,
    headline,
    detail,
    node: top?.node,
    causes: shifts.slice(0, 5).map((s) => ({ node: s.node, score: s.score, text: s.causes.map((x) => x.text).filter(Boolean).join(", ") || "Content above it changed size or was added late" })),
    findingIds: linked(["cls-culprits-insight", "unsized-images", "font-display-insight", "non-composited-animations"], findings),
  };
}

function scripts(c: Ctx) {
  return (c.audits["bootup-time"]?.details?.items ?? [])
    .filter((i: any) => i.url && i.url !== "Unattributable")
    .slice(0, 5)
    .map((i: any) => ({ url: scriptName(i.url, c), ms: i.total, thirdParty: isThirdParty(i.url, c.origin) }));
}

function tbt(c: Ctx, m: MetricValue | undefined, findings: Finding[], key: "TBT" | "INP" = "TBT"): Diagnosis | null {
  if (!m) return null;
  const list = scripts(c);
  const top = list[0];
  const tp = list.filter((s: any) => s.thirdParty).reduce((s: number, x: any) => s + x.ms, 0);
  const all = list.reduce((s: number, x: any) => s + x.ms, 0) || 1;
  let headline = key === "INP" ? `Real visitors wait ${m.display} for the page to react to a tap or click.` : `JavaScript blocks the page for ${m.display}.`;
  let detail = m.rating === "good" ? "No action needed. The page stays responsive." : "";
  if (m.rating !== "good" && top) {
    headline += /^Inline/.test(top.url) ? ` The biggest cause is the inline JavaScript in the page HTML, which runs for ${formatMs(top.ms)}.` : ` The biggest cause is ${top.url}, which runs for ${formatMs(top.ms)}.`;
    detail = tp / all > 0.4 ? `Third-party scripts account for ${Math.round((tp / all) * 100)}% of the script time, so start with tags you can remove or delay.` : "Most of the script time is your own code: defer what isn't needed for the first screen and split large bundles.";
    if (key === "INP") detail += " INP is measured on real interactions, so the lab shows the scripts most likely to be in the way.";
  }
  return { metric: key, rating: m.rating, value: m.display, headline, detail, scripts: list, findingIds: linked(["bootup-time", "third-parties-insight", "unused-javascript", "legacy-javascript-insight", "duplicated-javascript-insight", "dom-size-insight", "forced-reflow-insight", "viewport-insight"], findings) };
}

function fcp(c: Ctx, m: MetricValue | undefined, findings: Finding[]): Diagnosis | null {
  if (!m) return null;
  const rb = Math.max(0, ...(c.audits["render-blocking-insight"]?.details?.items ?? []).map((i: any) => i.wastedMs ?? 0));
  const ttfb = c.labValue.TTFB ?? 0;
  let headline = `FCP is ${m.display}.`;
  let detail = m.rating === "good" ? "No action needed. Something appears on screen quickly." : "";
  if (m.rating !== "good") {
    if (rb > ttfb && rb > 300) {
      headline = `The screen stays blank mainly because ${(c.audits["render-blocking-insight"]?.details?.items ?? []).length} CSS and JavaScript files must load first; the slowest takes ${formatMs(rb)}.`;
      detail = "Defer scripts and inline the critical CSS so the first screen can be drawn sooner.";
    } else if (ttfb > 600) {
      headline = `The screen stays blank mainly because the server takes ${formatMs(ttfb)} to respond.`;
      detail = "Page caching and a CDN usually fix this.";
    } else detail = "Look at render-blocking files, web fonts and the server response time below.";
  }
  return { metric: "FCP", rating: m.rating, value: m.display, headline, detail, findingIds: linked(["render-blocking-insight", "document-latency-insight", "font-display-insight", "unused-css-rules", "network-dependency-tree-insight"], findings) };
}

function ttfb(c: Ctx, m: MetricValue | undefined, findings: Finding[]): Diagnosis | null {
  if (!m) return null;
  const redirects = Math.max(0, ((c.audits["redirects"]?.details?.items ?? []) as any[]).length - 1);
  const headline =
    m.rating === "good"
      ? `The server responds in ${m.display}.`
      : `The server takes ${m.display} to start sending the page${redirects ? `, after ${redirects} redirect${redirects > 1 ? "s" : ""}` : ""}.`;
  return {
    metric: "TTFB",
    rating: m.rating,
    value: m.display,
    headline,
    detail: m.rating === "good" ? "No action needed." : "Cache full pages, serve them through a CDN and remove redirects. This is also what AI crawlers wait on before they can read anything.",
    findingIds: linked(["document-latency-insight", "redirects"], findings),
  };
}

export function buildDiagnoses(c: Ctx, lab: Partial<Record<MetricKey, MetricValue>>, field: FieldData | null, findings: Finding[]): Diagnosis[] {
  const out: (Diagnosis | null)[] = [lcp(c, lab.LCP, findings), cls(c, lab.CLS, findings)];
  const fieldInp = field?.metrics.INP;
  if (fieldInp) out.push(tbt(c, fieldInp, findings, "INP"));
  out.push(tbt(c, lab.TBT, findings), fcp(c, lab.FCP, findings), ttfb(c, lab.TTFB, findings));
  const order: Record<Rating, number> = { poor: 0, ni: 1, good: 2 };
  return out.filter((d): d is Diagnosis => !!d).sort((a, b) => order[a.rating] - order[b.rating]);
}

export function metricValue(key: MetricKey, value: number, strategy: Ctx["strategy"], rateFn: (k: MetricKey, v: number, s: Ctx["strategy"]) => Rating): MetricValue {
  return { key, value, display: formatMetric(key, value, strategy), rating: rateFn(key, value, strategy) };
}

export { METRICS };
