// Builds the request waterfall and reads it the way an experienced performance engineer would.
import { formatBytes, formatMs } from "./metrics";
import { isThirdParty, shortUrl, type Audit } from "./fixes";
import type { Tone, Waterfall, WaterfallInsight, WaterfallRow } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
const TYPES: Record<string, WaterfallRow["type"]> = { Document: "Document", Stylesheet: "Stylesheet", Script: "Script", Font: "Font", Image: "Image" };

function sameFile(a: string, b?: string) {
  if (!b) return false;
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.origin === y.origin && x.pathname === y.pathname;
  } catch {
    return a === b;
  }
}

function label(url: string, origin: string) {
  if (url.startsWith("data:")) return "Inline data URL";
  const s = shortUrl(url, origin);
  return s.length > 90 ? `${s.slice(0, 60)}…${s.slice(-25)}` : s;
}

const ORDER: Record<Tone, number> = { poor: 0, ni: 1, good: 2 };

export function buildWaterfall(audits: Record<string, Audit>, origin: string, lcpUrl?: string): Waterfall {
  const items: any[] = (audits["network-requests"]?.details?.items ?? []).filter((r: any) => r.url && typeof r.networkEndTime === "number" && !String(r.url).startsWith("data:"));
  const obs = audits["metrics"]?.details?.items?.[0] ?? {};
  const blockingUrls = new Set<string>((audits["render-blocking-insight"]?.details?.items ?? []).map((i: any) => i.url).filter(Boolean));

  // URLs on the longest request chain.
  const chainUrls = new Set<string>();
  const tree = (audits["network-dependency-tree-insight"]?.details?.items ?? []).find((i: any) => i.value?.type === "network-tree")?.value;
  let level = tree?.chains;
  while (level && Object.keys(level).length) {
    const next: any = Object.values(level).find((n: any) => n.isLongest) ?? Object.values(level)[0];
    chainUrls.add(next.url);
    level = next.children;
  }
  const chainReal = chainUrls.size >= 3 ? chainUrls : new Set<string>();

  const rows: WaterfallRow[] = items.map((r, id) => {
    const sent = r.networkRequestTime ?? r.rendererStartTime ?? 0;
    return {
      id,
      url: r.url,
      label: label(r.url, origin),
      type: TYPES[r.resourceType] ?? "Other",
      found: Math.min(r.rendererStartTime ?? sent, sent),
      sent,
      end: Math.max(r.networkEndTime, sent),
      bytes: r.transferSize ?? 0,
      status: r.statusCode ?? 0,
      priority: r.priority ?? "",
      protocol: r.protocol ?? "",
      thirdParty: isThirdParty(r.url, origin),
      entity: r.entity,
      blocking: blockingUrls.has(r.url),
      lcp: sameFile(r.url, lcpUrl) && r.resourceType === "Image",
      chain: chainReal.has(r.url),
    };
  });
  rows.sort((a, b) => a.found - b.found || a.sent - b.sent);
  rows.forEach((r, i) => (r.id = i));

  const doc = rows.find((r) => r.type === "Document");
  const marks = {
    fcp: obs.observedFirstContentfulPaint,
    lcp: obs.observedLargestContentfulPaint,
    dcl: obs.observedDomContentLoaded,
    load: obs.observedLoad,
    htmlEnd: doc?.end,
  };
  return { rows, marks, insights: readWaterfall(rows, marks) };
}

function readWaterfall(rows: WaterfallRow[], m: Waterfall["marks"]): WaterfallInsight[] {
  const out: WaterfallInsight[] = [];
  const doc = rows.find((r) => r.type === "Document");
  const lcpAt = m.lcp ?? Infinity;
  const htmlEnd = doc?.end ?? 0;

  // 1. The HTML.
  if (doc) {
    const t = doc.end;
    out.push({
      id: "html",
      tone: t <= 600 ? "good" : t <= 1200 ? "ni" : "poor",
      title: `The HTML arrived at ${formatMs(t)}`,
      text:
        t <= 600
          ? "The server answered quickly, so the browser could start finding the other files early."
          : "Every other file waits for the HTML: the browser can't find a stylesheet, script or image until the HTML that mentions it arrives. A slow start here pushes the whole waterfall to the right.",
      rows: [doc.id],
      action: t > 600 ? "Cache the HTML (page cache or CDN) and check what the server does before it responds." : undefined,
    });
  }

  // 2. Render-blocking window.
  const blocking = rows.filter((r) => r.blocking);
  if (blocking.length) {
    const until = Math.max(...blocking.map((r) => r.end));
    const slowest = blocking.reduce((a, b) => (b.end - b.sent > a.end - a.sent ? b : a));
    out.push({
      id: "blocking",
      tone: until - htmlEnd > 500 ? "poor" : "ni",
      title: `${blocking.length} file${blocking.length > 1 ? "s" : ""} kept the screen blank until ${formatMs(until)}`,
      text: `The browser won't draw anything until render-blocking CSS and scripts in the <head> have downloaded. The last one finished ${formatMs(Math.max(0, until - htmlEnd))} after the HTML arrived; the slowest was ${slowest.label}.${m.fcp ? ` The first content appeared at ${formatMs(m.fcp)}.` : ""}`,
      rows: blocking.map((r) => r.id),
      action: "Inline the critical CSS, defer scripts and load the rest without blocking.",
    });
  }

  // 3. The LCP image.
  const lcp = rows.find((r) => r.lcp);
  if (lcp) {
    const waited = lcp.found - htmlEnd;
    const before = rows.filter((r) => r !== lcp && r.sent < lcp.sent && r.type !== "Document").length;
    const lowPriority = /low|medium/i.test(lcp.priority) && !/high/i.test(lcp.priority);
    const problems: string[] = [];
    if (waited > 400) problems.push(`it was only found ${formatMs(waited)} after the HTML arrived (late discovery: lazy loading, a CSS background or JavaScript)`);
    if (lowPriority) problems.push(`it was downloaded at ${lcp.priority} priority`);
    if (before > 10) problems.push(`${before} other files were requested before it`);
    const tone: Tone = problems.length >= 2 || waited > 1000 ? "poor" : problems.length ? "ni" : "good";
    out.push({
      id: "lcp",
      tone,
      title: tone === "good" ? "The main image was requested early" : "The main image started downloading late",
      text: problems.length
        ? `Your LCP image was requested at ${formatMs(lcp.sent)} and finished at ${formatMs(lcp.end)}. It started late because ${problems.join(", and ")}. In a healthy waterfall it's one of the first files after the HTML.`
        : `Your LCP image was requested at ${formatMs(lcp.sent)}, right after the HTML, and finished at ${formatMs(lcp.end)}. That's what a healthy waterfall looks like.`,
      rows: [lcp.id],
      action: tone !== "good" ? 'Put the image in the HTML as an <img> without loading="lazy", add fetchpriority="high", or preload it.' : undefined,
    });
  } else if (Number.isFinite(lcpAt)) {
    const fonts = rows.filter((r) => r.type === "Font" && r.end < lcpAt + 50);
    out.push({
      id: "lcp-text",
      tone: "good",
      title: "Your main content is text",
      text: `No image download is needed for LCP, so the main content depends only on the HTML, the CSS${fonts.length ? ` and ${fonts.length} web font${fonts.length > 1 ? "s" : ""}` : ""}. It appeared at ${formatMs(lcpAt)}.`,
      rows: fonts.map((r) => r.id),
    });
  }

  // 4. Competition before the main content.
  if (Number.isFinite(lcpAt)) {
    const early = rows.filter((r) => r.type !== "Document" && !r.lcp && r.sent < lcpAt);
    const tp = early.filter((r) => r.thirdParty);
    const bytes = early.reduce((s, r) => s + r.bytes, 0);
    if (early.length) {
      const tone: Tone = early.length > 40 || bytes > 1.5 * 1024 * 1024 ? "poor" : early.length > 20 || bytes > 700 * 1024 ? "ni" : "good";
      out.push({
        id: "competition",
        tone,
        title: `${early.length} file${early.length > 1 ? "s" : ""} (${formatBytes(bytes)}) requested before the main content appeared`,
        text: tone === "good" ? "A lean start: little else competes with the content visitors are waiting for." : `They all share the same network connection and CPU as the content visitors are waiting for.${tp.length ? ` ${tp.length} of them come from third parties (${[...new Set(tp.map((r) => r.entity).filter(Boolean))].slice(0, 4).join(", ")}).` : ""} Anything that isn't needed for the first screen (chat, tracking, carousels further down) should load after it.`,
        rows: early.map((r) => r.id),
        action: early.length > 20 ? "Delay non-essential scripts until after load or the first interaction, and lazy-load images below the first screen." : undefined,
      });
    }
  }

  // 5. Idle gap: nothing downloading while the page still isn't ready.
  if (Number.isFinite(lcpAt) && doc) {
    const spans = rows.filter((r) => r.sent < lcpAt).map((r) => [r.sent, r.end] as [number, number]).sort((a, b) => a[0] - b[0]);
    let cursor = doc.end;
    let gap = { from: 0, to: 0 };
    for (const [s, e] of spans) {
      if (s > cursor && s - cursor > gap.to - gap.from) gap = { from: cursor, to: Math.min(s, lcpAt) };
      cursor = Math.max(cursor, e);
    }
    if (lcpAt > cursor && lcpAt - cursor > gap.to - gap.from) gap = { from: cursor, to: lcpAt };
    if (gap.to - gap.from >= 300) {
      out.push({
        id: "idle",
        tone: gap.to - gap.from > 800 ? "poor" : "ni",
        title: `Nothing was downloading for ${formatMs(gap.to - gap.from)}, yet the page wasn't ready`,
        text: `Between ${formatMs(gap.from)} and ${formatMs(gap.to)} the network was idle but the main content hadn't appeared. The hold-up wasn't a download: the browser was busy running JavaScript, applying CSS or waiting for a font. Faster files won't help this part; less main-thread work will.`,
        rows: [],
        action: "Look at Total Blocking Time and the scripts in the INP root cause.",
      });
    }
  }

  // 6. Chains.
  const chain = rows.filter((r) => r.chain);
  if (chain.length >= 3) {
    out.push({
      id: "chain",
      tone: chain.length >= 4 ? "poor" : "ni",
      title: `A chain of ${chain.length} files, each found only after the previous one loaded`,
      text: `${chain.map((r) => r.label).join(" → ")}. Each step waits for the one before it to download, so the delays add up. Typical causes are fonts declared in CSS, CSS @import, and scripts that load more scripts.`,
      rows: chain.map((r) => r.id),
      action: "Preload the file at the end of the chain, or reference it directly from the HTML.",
    });
  }

  // 7. Queueing.
  const queued = rows.filter((r) => r.sent - r.found > 300 && r.sent < (Number.isFinite(lcpAt) ? lcpAt : Infinity));
  if (queued.length >= 2) {
    const h1 = queued.filter((r) => /http\/1/i.test(r.protocol)).length;
    out.push({
      id: "queue",
      tone: queued.length > 5 ? "poor" : "ni",
      title: `${queued.length} files waited in a queue before downloading`,
      text: `The browser knew about these files but held them back (the light part of each bar).${h1 ? ` ${h1} were on HTTP/1.1, which only downloads about 6 files at a time per server.` : " Too many requests at once, or a low priority, makes the browser hold some back."}`,
      rows: queued.map((r) => r.id),
      action: h1 ? "Turn on HTTP/2 or HTTP/3 at your host or CDN." : "Cut the number of early requests.",
    });
  }

  // 8. Failed requests and redirects.
  const isFavicon = (r: WaterfallRow) => /\/favicon\.ico(\?|$)/i.test(r.url);
  const failed = rows.filter((r) => r.status >= 400 && !isFavicon(r));
  const redirected = rows.filter((r) => r.status >= 300 && r.status < 400);
  const favicon = rows.find((r) => r.status >= 400 && isFavicon(r));
  if (favicon)
    out.push({
      id: "favicon",
      tone: "ni",
      title: "No favicon",
      text: "Browsers ask for /favicon.ico on every visit and get an error. It doesn't slow the page, but it shows as a blank tab icon and in search results Google may show a generic globe.",
      rows: [favicon.id],
      action: "Add a favicon and link it from the <head>.",
    });
  if (failed.length || redirected.length) {
    out.push({
      id: "errors",
      tone: failed.length ? "poor" : "ni",
      title: [failed.length ? `${failed.length} request${failed.length > 1 ? "s" : ""} failed` : "", redirected.length ? `${redirected.length} redirected` : ""].filter(Boolean).join(", "),
      text: `${failed.length ? `Files that return an error (${[...new Set(failed.map((r) => r.status))].join(", ")}) still cost a full round trip and usually mean a deleted file is still referenced. ` : ""}${redirected.length ? "Each redirect is an extra round trip before the file can download." : ""}`,
      rows: [...failed, ...redirected].map((r) => r.id),
      action: "Update or remove the references to these URLs.",
    });
  }

  // 9. Heavy files.
  const heavy = rows.filter((r) => r.bytes > 300 * 1024).sort((a, b) => b.bytes - a.bytes);
  if (heavy.length) {
    out.push({
      id: "heavy",
      tone: heavy.some((r) => r.sent < lcpAt && r.bytes > 500 * 1024) ? "poor" : "ni",
      title: `${heavy.length} file${heavy.length > 1 ? "s are" : " is"} over 300 KB`,
      text: `The largest is ${heavy[0].label} at ${formatBytes(heavy[0].bytes)}. On a mobile connection a file this size takes seconds on its own${heavy.some((r) => r.sent < lcpAt) ? ", and some of these load before the main content" : ""}.`,
      rows: heavy.map((r) => r.id),
      action: "Compress, resize or split these files; load anything below the first screen later.",
    });
  }

  // 10. Too many domains early.
  if (Number.isFinite(lcpAt)) {
    const origins = new Set(rows.filter((r) => r.sent < lcpAt).map((r) => { try { return new URL(r.url).origin; } catch { return r.url; } }));
    if (origins.size > 6) {
      out.push({
        id: "origins",
        tone: origins.size > 12 ? "poor" : "ni",
        title: `Files came from ${origins.size} different domains before the main content`,
        text: "Each new domain needs its own DNS lookup and secure connection before anything downloads, often 100 to 300 ms on mobile. Fewer domains, or preconnecting to the one or two that matter, shortens the start of the waterfall.",
        rows: rows.filter((r) => r.sent < lcpAt && r.thirdParty).map((r) => r.id),
        action: "Self-host critical files (fonts, key CSS) and preconnect to the most important remaining domain.",
      });
    }
  }

  // 11. After load: reassurance.
  if (m.load) {
    const after = rows.filter((r) => r.sent > m.load!);
    if (after.length)
      out.push({
        id: "after",
        tone: "good",
        title: `${after.length} file${after.length > 1 ? "s" : ""} loaded after the page finished`,
        text: "Files that load after the load event don't hold up what visitors see first. This is where lazy-loaded images, analytics and widgets belong.",
        rows: after.map((r) => r.id),
      });
  }

  return out.sort((a, b) => ORDER[a.tone] - ORDER[b.tone]);
}
