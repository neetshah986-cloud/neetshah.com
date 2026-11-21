// Head-to-head: your page against a competitor's, with the reasons one is faster.
import { formatBytes, formatMetric, formatMs, type MetricKey } from "./metrics";
import type { SpeedRun } from "./types";

export type Side = "you" | "them" | "tie";

export type VersusRow = {
  group: "Real visitors" | "Lab test" | "What the page loads";
  label: string;
  you: string;
  them: string;
  winner: Side;
  /** Plain difference, e.g. "1.2 s faster". */
  diff?: string;
};

export type Reason = {
  /** Internal: which part of LCP this explains, so it isn't repeated. */
  phase?: "delay" | "download" | "render" | "lcp";
  /** Who is better on this point. */
  side: "you" | "them";
  title: string;
  detail: string;
  /** What to do when you're the one behind. */
  fix?: string;
  /** Lighthouse audits in your report that fix it. */
  auditIds: string[];
  weight: number;
};

export type Versus = {
  winner: Side;
  headline: string;
  rows: VersusRow[];
  behind: Reason[];
  ahead: Reason[];
  thirdParties: { onlyYou: string[]; onlyThem: string[]; both: string[] };
};

export const hostOf = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

const s = (ms: number) => formatMs(Math.abs(ms));
/** Capitalise a sentence, but never a domain name. */
const cap = (t: string) => (/^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(t) ? t : t.charAt(0).toUpperCase() + t.slice(1));

function winnerLow(a: number | undefined, b: number | undefined, tol: number): Side {
  if (a === undefined || b === undefined) return "tie";
  if (Math.abs(a - b) <= tol) return "tie";
  return a < b ? "you" : "them";
}

export function compareRuns(you: SpeedRun, them: SpeedRun): Versus {
  const rows: VersusRow[] = [];
  const yName = "your page";
  const tName = hostOf(them.finalUrl);

  // ---- Real visitors (what Google ranks on) ----
  const yf = you.field ?? you.originField;
  const tf = them.field ?? them.originField;
  if (yf || tf) {
    const cwv = (f: typeof yf) => (f?.passed === true ? "Passed" : f?.passed === false ? "Failed" : "No data");
    const yp = yf?.passed;
    const tp = tf?.passed;
    rows.push({
      group: "Real visitors",
      label: "Core Web Vitals",
      you: cwv(yf),
      them: cwv(tf),
      winner: yp === tp || yp == null || tp == null ? "tie" : yp ? "you" : "them",
    });
    for (const k of ["LCP", "INP", "CLS"] as MetricKey[]) {
      const a = yf?.metrics[k];
      const b = tf?.metrics[k];
      if (!a && !b) continue;
      const tol = k === "CLS" ? 0.01 : k === "INP" ? 20 : 100;
      const w = winnerLow(a?.value, b?.value, tol);
      rows.push({
        group: "Real visitors",
        label: k === "LCP" ? "LCP (real visitors)" : k === "INP" ? "INP (real visitors)" : "CLS (real visitors)",
        you: a?.display ?? "No data",
        them: b?.display ?? "No data",
        winner: w,
        diff: a && b && w !== "tie" ? (k === "CLS" ? `${Math.abs(a.value - b.value).toFixed(2)} lower` : `${s(a.value - b.value)} faster`) : undefined,
      });
    }
  }

  // ---- Lab ----
  rows.push({ group: "Lab test", label: "Performance score", you: String(you.score), them: String(them.score), winner: Math.abs(you.score - them.score) < 3 ? "tie" : you.score > them.score ? "you" : "them", diff: `${Math.abs(you.score - them.score)} points` });
  const labTol: Partial<Record<MetricKey, number>> = { LCP: 150, FCP: 150, SI: 200, TBT: 50, CLS: 0.01, TTFB: 80 };
  const labLabel: Partial<Record<MetricKey, string>> = { LCP: "Largest Contentful Paint", FCP: "First Contentful Paint", TBT: "Total Blocking Time", CLS: "Cumulative Layout Shift", SI: "Speed Index", TTFB: "Server response (TTFB)" };
  for (const k of ["LCP", "FCP", "TBT", "CLS", "SI", "TTFB"] as MetricKey[]) {
    const a = you.lab[k];
    const b = them.lab[k];
    if (!a || !b) continue;
    const w = winnerLow(a.value, b.value, labTol[k] ?? 0);
    rows.push({
      group: "Lab test",
      label: labLabel[k] ?? k,
      you: a.display,
      them: b.display,
      winner: w,
      diff: w === "tie" ? undefined : k === "CLS" ? `${Math.abs(a.value - b.value).toFixed(2)} lower` : `${s(a.value - b.value)} ${k === "TBT" ? "less" : "faster"}`,
    });
  }

  // ---- What the page loads ----
  const fy = you.facts;
  const ft = them.facts;
  if (fy && ft) {
    const byteRow = (label: string, a: number, b: number) => {
      const w = winnerLow(a, b, Math.max(20_000, Math.max(a, b) * 0.1));
      rows.push({ group: "What the page loads", label, you: formatBytes(a), them: formatBytes(b), winner: w, diff: w === "tie" ? undefined : `${formatBytes(Math.abs(a - b))} less` });
    };
    byteRow("Page weight", fy.bytes.total, ft.bytes.total);
    byteRow("JavaScript", fy.bytes.js, ft.bytes.js);
    byteRow("Images", fy.bytes.image, ft.bytes.image);
    const req = winnerLow(fy.requests, ft.requests, Math.max(5, Math.max(fy.requests, ft.requests) * 0.1));
    rows.push({ group: "What the page loads", label: "Requests", you: String(fy.requests), them: String(ft.requests), winner: req, diff: req === "tie" ? undefined : `${Math.abs(fy.requests - ft.requests)} fewer` });
    const rb = winnerLow(fy.renderBlocking.count, ft.renderBlocking.count, 0);
    rows.push({ group: "What the page loads", label: "Render-blocking files", you: String(fy.renderBlocking.count), them: String(ft.renderBlocking.count), winner: rb, diff: rb === "tie" ? undefined : `${Math.abs(fy.renderBlocking.count - ft.renderBlocking.count)} fewer` });
  }
  const yt = you.thirdParty;
  const tt = them.thirdParty;
  if (yt && tt) {
    const w = winnerLow(yt.blockingMs, tt.blockingMs, 50);
    rows.push({ group: "What the page loads", label: "Third-party blocking", you: `${formatMs(yt.blockingMs)} (${yt.list.length})`, them: `${formatMs(tt.blockingMs)} (${tt.list.length})`, winner: w, diff: w === "tie" ? undefined : `${s(yt.blockingMs - tt.blockingMs)} less` });
  }

  // ---- Reasons ----
  const reasons: Reason[] = [];
  const add = (diff: number, threshold: number, scale: number, make: (side: "you" | "them") => Omit<Reason, "side" | "weight">) => {
    if (Math.abs(diff) < threshold) return;
    // diff > 0 means you have more (worse) of it.
    const side = diff > 0 ? "them" : "you";
    const r = make(side);
    reasons.push({ side, weight: Math.abs(diff) / scale, ...r, title: cap(r.title), detail: cap(r.detail) });
  };
  const better = (side: "you" | "them") => (side === "you" ? yName : tName);
  const worse = (side: "you" | "them") => (side === "you" ? tName : yName);
  const yLcp = you.lab.LCP?.value;
  const tLcp = them.lab.LCP?.value;
  if (yLcp !== undefined && tLcp !== undefined)
    add(yLcp - tLcp, 500, 600, (side) => {
      const loser = side === "them" ? you : them;
      const why = loser.diagnoses.find((d) => d.metric === "LCP")?.headline;
      return {
        phase: "lcp",
        title: `${worse(side)}'s main content appears ${s(yLcp - tLcp)} later`,
        detail: `Largest Contentful Paint is ${formatMs(side === "you" ? tLcp : yLcp)} against ${formatMs(side === "you" ? yLcp : tLcp)}.${why ? ` On ${worse(side)}: ${why.charAt(0).toLowerCase() + why.slice(1)}` : ""}`,
        fix: "Open Root causes for the LCP breakdown, then the matching fixes.",
        auditIds: ["lcp-breakdown-insight", "lcp-discovery-insight", "image-delivery-insight"],
      };
    });
  const yTtfb = you.lab.TTFB?.value;
  const tTtfb = them.lab.TTFB?.value;
  if (yTtfb !== undefined && tTtfb !== undefined)
    add(yTtfb - tTtfb, 200, 400, (side) => ({
      title: `${better(side)}'s server answers ${s(yTtfb - tTtfb)} faster`,
      detail: `The HTML arrives after ${formatMs(side === "you" ? yTtfb : tTtfb)} against ${formatMs(side === "you" ? tTtfb : yTtfb)} for ${worse(side)}. Everything else waits for it, so this delay is added to every metric.`,
      fix: "Cache the HTML (page cache or a CDN that caches HTML), cut redirects, and check slow database queries or plugins.",
      auditIds: ["document-latency-insight", "server-response-time"],
    }));
  const py = fy?.lcpPhases;
  const pt = ft?.lcpPhases;
  if (py && pt) {
    if (fy.lcpIsImage && ft.lcpIsImage) {
      add(py.delay - pt.delay, 300, 500, (side) => ({
        phase: "delay",
        title: `${better(side)}'s main image starts downloading ${s(py.delay - pt.delay)} sooner`,
        detail: `${worse(side)} finds its main image late (lazy-loading, a CSS background, or added by JavaScript), so the download starts late even if the file is small.`,
        fix: 'Put the main image in the HTML as an <img> with fetchpriority="high", remove loading="lazy" from it, and preload it if it\'s a CSS background.',
        auditIds: ["lcp-discovery-insight", "lcp-breakdown-insight"],
      }));
      add(py.download - pt.download, 300, 500, (side) => ({
        phase: "download",
        title: `${better(side)}'s main image downloads ${s(py.download - pt.download)} faster`,
        detail: `${worse(side)}'s main image file is heavier or comes from a slower server.`,
        fix: "Serve the main image at the size it's shown, in AVIF or WebP, from a CDN.",
        auditIds: ["image-delivery-insight"],
      }));
    }
    add(py.render - pt.render, 300, 500, (side) => ({
      phase: "render",
      title: `${better(side)} shows its main content ${s(py.render - pt.render)} sooner once it's ready`,
      detail: `On ${worse(side)}, the main content is loaded but waits on CSS, fonts or JavaScript before it's painted.`,
      fix: "Inline the critical CSS, defer non-critical CSS and JavaScript, and use font-display: swap.",
      auditIds: ["render-blocking-insight", "font-display-insight"],
    }));
  }
  if (fy && ft) {
    add(fy.renderBlocking.ms - ft.renderBlocking.ms, 300, 500, (side) => ({
      title: `${worse(side)} blocks the first paint for ${s(fy.renderBlocking.ms - ft.renderBlocking.ms)} longer`,
      detail:
        fy.renderBlocking.count === ft.renderBlocking.count
          ? `Both have ${fy.renderBlocking.count} render-blocking CSS or JavaScript files, but ${worse(side)}'s slowest one holds the screen blank for ${formatMs(side === "you" ? ft.renderBlocking.ms : fy.renderBlocking.ms)} against ${formatMs(side === "you" ? fy.renderBlocking.ms : ft.renderBlocking.ms)}.`
          : `${worse(side)} has ${side === "you" ? ft.renderBlocking.count : fy.renderBlocking.count} render-blocking CSS or JavaScript files against ${side === "you" ? fy.renderBlocking.count : ft.renderBlocking.count}. The screen stays blank until they've downloaded.`,
      fix: "Add defer to scripts in the <head>, and inline the CSS needed for the top of the page.",
      auditIds: ["render-blocking-insight"],
    }));
    add(fy.bytes.js - ft.bytes.js, 150_000, 300_000, (side) => ({
      title: `${worse(side)} ships ${formatBytes(Math.abs(fy.bytes.js - ft.bytes.js))} more JavaScript`,
      detail: `${formatBytes(side === "you" ? ft.bytes.js : fy.bytes.js)} against ${formatBytes(side === "you" ? fy.bytes.js : ft.bytes.js)}. Every kilobyte has to be downloaded, parsed and run on the visitor's phone.`,
      fix: "Remove unused plugins, apps and libraries, and split the JavaScript so each page loads only what it uses.",
      auditIds: ["unused-javascript", "bootup-time", "legacy-javascript-insight", "duplicated-javascript-insight"],
    }));
    add(fy.bytes.image - ft.bytes.image, 500_000, 800_000, (side) => ({
      title: `${worse(side)} loads ${formatBytes(Math.abs(fy.bytes.image - ft.bytes.image))} more images`,
      detail: "Heavy images compete with the main content for bandwidth, especially on mobile.",
      fix: "Resize images to the size they're shown, use AVIF or WebP, and lazy-load images below the fold.",
      auditIds: ["image-delivery-insight", "offscreen-images"],
    }));
  }
  const yTbt = you.lab.TBT?.value;
  const tTbt = them.lab.TBT?.value;
  if (yTbt !== undefined && tTbt !== undefined)
    add(yTbt - tTbt, 150, 300, (side) => ({
      title: `JavaScript keeps ${worse(side)} busy for ${s(yTbt - tTbt)} longer`,
      detail: `Total Blocking Time is ${formatMs(side === "you" ? tTbt : yTbt)} against ${formatMs(side === "you" ? yTbt : tTbt)}. While the browser is busy running JavaScript, taps and clicks wait, which hurts INP.`,
      fix: "Delay non-essential scripts until after load and break up long JavaScript tasks.",
      auditIds: ["bootup-time", "third-parties-insight", "unused-javascript"],
    }));
  if (yt && tt) {
    const names = (r: typeof yt) => r.list.filter((t) => !t.essential && t.blockingMs > 0).slice(0, 3).map((t) => t.name);
    add(yt.blockingMs - tt.blockingMs, 100, 300, (side) => {
      const list = side === "them" ? names(yt) : names(tt);
      return {
        title: `Third-party scripts block ${worse(side)} ${s(yt.blockingMs - tt.blockingMs)} longer`,
        detail: list.length ? `The biggest on ${worse(side)}: ${list.join(", ")}.` : "Analytics, chat and marketing code run before the page is ready.",
        fix: "Open the Third parties tab: delay chat, session recording and marketing pixels until after the page loads.",
        auditIds: ["third-parties-insight"],
      };
    });
  }
  const yCls = you.lab.CLS?.value;
  const tCls = them.lab.CLS?.value;
  if (yCls !== undefined && tCls !== undefined)
    add(yCls - tCls, 0.05, 0.1, (side) => ({
      title: `${worse(side)}'s layout jumps more (CLS ${formatMetric("CLS", side === "you" ? tCls : yCls)} against ${formatMetric("CLS", side === "you" ? yCls : tCls)})`,
      detail: "Content moves after it appears, usually because images, ads or banners have no reserved space, or a web font swaps in.",
      fix: "Give images and ad slots a width and height (or aspect-ratio), and reserve space for banners that load late.",
      auditIds: ["cls-culprits-insight", "unsized-images"],
    }));
  if (fy && ft && fy.redirects !== ft.redirects)
    add(fy.redirects - ft.redirects, 1, 2, (side) => ({
      title: `${worse(side)} goes through ${Math.abs(fy.redirects - ft.redirects)} more redirect${Math.abs(fy.redirects - ft.redirects) > 1 ? "s" : ""}`,
      detail: "Each redirect is a full round trip before the page can start loading.",
      fix: "Link to the final URL directly (https, with or without www, trailing slash) so there's no redirect.",
      auditIds: ["redirects"],
    }));
  if (fy && ft && fy.lcpIsImage !== ft.lcpIsImage) {
    const textSide: "you" | "them" = fy.lcpIsImage ? "them" : "you";
    reasons.push({
      side: textSide,
      weight: 0.4,
      title: cap(`${better(textSide)}'s main content is text, ${worse(textSide)}'s is an image`),
      detail: "Text can be painted as soon as the HTML and CSS arrive; an image needs its own download first.",
      fix: textSide === "them" ? "If the hero image isn't essential, a text headline above it can become the main content and appear sooner." : undefined,
      auditIds: [],
    });
  }

  // The LCP reason already names the slower page's biggest LCP phase: don't repeat it.
  for (const side of ["you", "them"] as const) {
    if (!reasons.some((r) => r.phase === "lcp" && r.side === side)) continue;
    const ph = side === "them" ? py : pt;
    if (!ph) continue;
    const top = (Object.entries({ delay: ph.delay, download: ph.download, render: ph.render }) as [string, number][]).sort((a, b) => b[1] - a[1])[0][0];
    const i = reasons.findIndex((r) => r.side === side && r.phase === top);
    if (i >= 0) reasons.splice(i, 1);
  }
  reasons.sort((a, b) => b.weight - a.weight);
  const behind = reasons.filter((r) => r.side === "them").map((r) => ({ ...r, auditIds: r.auditIds.filter((id) => you.findings.some((f) => f.auditId === id)) }));
  const ahead = reasons.filter((r) => r.side === "you").map((r) => ({ ...r, fix: undefined }));

  // ---- Winner and headline ----
  let winner: Side = "tie";
  if (yf?.passed != null && tf?.passed != null && yf.passed !== tf.passed) winner = yf.passed ? "you" : "them";
  else if (Math.abs(you.score - them.score) >= 5) winner = you.score > them.score ? "you" : "them";
  else {
    const l = winnerLow(you.lab.LCP?.value, them.lab.LCP?.value, 200);
    winner = l;
  }
  const device = you.strategy === "mobile" ? "mobile" : "desktop";
  const lcpA = you.lab.LCP;
  const lcpB = them.lab.LCP;
  const lcpText = lcpA && lcpB ? `, main content at ${winner === "them" ? lcpB.display : lcpA.display} against ${winner === "them" ? lcpA.display : lcpB.display}` : "";
  const headline =
    winner === "tie"
      ? `It's close on ${device}: score ${you.score} against ${them.score}.`
      : winner === "you"
        ? `Your page is faster on ${device}: score ${you.score} against ${them.score}${lcpText}.`
        : `${tName} is faster on ${device}: score ${them.score} against your ${you.score}${lcpText}.`;

  const yNames = new Set((yt?.list ?? []).map((t) => t.name));
  const tNames = new Set((tt?.list ?? []).map((t) => t.name));
  return {
    winner,
    headline,
    rows,
    behind,
    ahead,
    thirdParties: {
      onlyYou: [...yNames].filter((n) => !tNames.has(n)),
      onlyThem: [...tNames].filter((n) => !yNames.has(n)),
      both: [...yNames].filter((n) => tNames.has(n)),
    },
  };
}
