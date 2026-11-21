// Turns a PageSpeed Insights API response into the report the tool shows.
import { buildDiagnoses, metricValue } from "./diagnose";
import { buildFindings, getAttr, passedAudits, toNode, type Audit, type Ctx } from "./fixes";
import { buildWaterfall } from "./waterfall";
import { addPlatformSteps, detectPlatform } from "./platform";
import { rate, type MetricKey } from "./metrics";
import type { CrawlerView, FieldData, FieldMetric, MetricValue, SpeedRun, Strategy } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
const CRUX: Record<string, MetricKey> = {
  LARGEST_CONTENTFUL_PAINT_MS: "LCP",
  INTERACTION_TO_NEXT_PAINT: "INP",
  CUMULATIVE_LAYOUT_SHIFT_SCORE: "CLS",
  FIRST_CONTENTFUL_PAINT_MS: "FCP",
  EXPERIMENTAL_TIME_TO_FIRST_BYTE: "TTFB",
};

export function parseField(le: any, strategy: Strategy): FieldData | null {
  if (!le?.metrics) return null;
  const metrics: FieldData["metrics"] = {};
  for (const [k, key] of Object.entries(CRUX)) {
    const m = le.metrics[k];
    if (!m || typeof m.percentile !== "number") continue;
    const value = key === "CLS" ? m.percentile / 100 : m.percentile;
    const d = (m.distributions ?? []).map((x: any) => x.proportion ?? 0);
    const mv = metricValue(key, value, strategy, rate);
    metrics[key] = { ...mv, distribution: [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0] } as FieldMetric;
  }
  if (!Object.keys(metrics).length) return null;
  const core = [metrics.LCP, metrics.CLS, metrics.INP];
  let passed: boolean | null = null;
  if (metrics.LCP && metrics.CLS) passed = core.every((m) => !m || m.rating === "good");
  return { scope: le.origin_fallback || /^origin:/.test(le.id ?? "") ? "origin" : "url", metrics, passed };
}

export type RawHtml = { words: number; hasH1: boolean; title: string; appShell: boolean; hints?: string[]; error?: string };

export function buildRun(psi: any, strategy: Strategy, requestedUrl: string, raw?: RawHtml | null): SpeedRun {
  const lhr = psi.lighthouseResult ?? psi;
  const audits: Record<string, Audit> = lhr.audits ?? {};
  const finalUrl: string = lhr.finalDisplayedUrl ?? lhr.finalUrl ?? requestedUrl;
  const origin = (() => {
    try {
      return new URL(finalUrl).origin;
    } catch {
      return "";
    }
  })();
  const emu = lhr.configSettings?.screenEmulation ?? {};
  const viewport = { width: emu.width ?? (strategy === "mobile" ? 412 : 1350), height: emu.height ?? (strategy === "mobile" ? 823 : 940) };

  const num = (id: string) => (typeof audits[id]?.numericValue === "number" ? (audits[id].numericValue as number) : undefined);
  const lab: Partial<Record<MetricKey, MetricValue>> = {};
  const labIds: [MetricKey, number | undefined][] = [
    ["LCP", num("largest-contentful-paint")],
    ["FCP", num("first-contentful-paint")],
    ["TBT", num("total-blocking-time")],
    ["CLS", num("cumulative-layout-shift")],
    ["SI", num("speed-index")],
    ["TTFB", audits["document-latency-insight"]?.details?.debugData?.serverResponseTime ?? num("server-response-time")],
  ];
  for (const [k, v] of labIds) if (typeof v === "number") lab[k] = metricValue(k, v, strategy, rate);

  // Natural image sizes and the LCP image URL, from the image delivery insight.
  const natural = new Map<string, [number, number]>();
  let lcpUrl: string | undefined;
  const lcpNode = toNode((audits["lcp-breakdown-insight"]?.details?.items ?? []).find((i: any) => i.type === "node"));
  const lcpPath = lcpNode?.path;
  for (const i of audits["image-delivery-insight"]?.details?.items ?? []) {
    for (const s of i.subItems?.items ?? []) {
      const m = String(s.reason ?? "").match(/\((\d+)x(\d+)\)/);
      if (m) natural.set(i.url, [Number(m[1]), Number(m[2])]);
    }
    if (lcpPath && i.node?.path === lcpPath) lcpUrl = i.url;
  }
  if (!lcpUrl && lcpNode && /^<img\b/i.test(lcpNode.snippet)) {
    const src = getAttr(lcpNode.snippet, "src");
    try {
      if (src && !src.startsWith("data:")) lcpUrl = new URL(src, finalUrl).href;
    } catch {
      /* not a URL */
    }
  }

  const ctx: Ctx = {
    pageUrl: finalUrl,
    origin,
    strategy,
    dpr: emu.deviceScaleFactor ?? (strategy === "mobile" ? 1.75 : 1),
    viewportWidth: viewport.width,
    audits,
    labRating: Object.fromEntries(Object.entries(lab).map(([k, v]) => [k, v!.rating])),
    labValue: Object.fromEntries(Object.entries(lab).map(([k, v]) => [k, v!.value])),
    natural,
    lcpUrl,
    lcpPath,
  };

  const field = parseField(psi.loadingExperience, strategy);
  const originField = parseField(psi.originLoadingExperience, strategy);
  const findings = buildFindings(ctx);
  const platform = detectPlatform(
    ((audits["network-requests"]?.details?.items ?? []) as any[]).map((r) => String(r.url ?? "")),
    raw?.hints ?? [],
  );
  addPlatformSteps(findings, platform, lcpUrl);
  const diagnoses = buildDiagnoses(ctx, lab, field, findings);

  const fps = lhr.fullPageScreenshot?.screenshot;
  const requests: any[] = audits["network-requests"]?.details?.items ?? [];
  const doc = requests.find((r) => r.resourceType === "Document");
  const crawler: CrawlerView = {
    ttfbMs: lab.TTFB?.value,
    htmlBytes: doc?.resourceSize,
    htmlTransferBytes: doc?.transferSize,
    compressed: doc && doc.resourceSize > 1500 ? doc.transferSize < doc.resourceSize * 0.85 : undefined,
    protocol: doc?.protocol,
    redirects: Math.max(0, (audits["redirects"]?.details?.items ?? []).length - 1),
    requests: requests.length,
    totalBytes: requests.reduce((s, r) => s + (r.transferSize ?? 0), 0),
    jsBytes: requests.filter((r) => r.resourceType === "Script").reduce((s, r) => s + (r.transferSize ?? 0), 0),
    rawWords: raw && !raw.error ? raw.words : undefined,
    rawHasH1: raw && !raw.error ? raw.hasH1 : undefined,
    rawTitle: raw && !raw.error ? raw.title : undefined,
    appShell: raw && !raw.error ? raw.appShell : undefined,
    rawError: raw?.error,
  };

  return {
    strategy,
    requestedUrl,
    finalUrl,
    fetchedAt: lhr.fetchTime ?? new Date().toISOString(),
    lighthouseVersion: lhr.lighthouseVersion ?? "",
    score: Math.round((lhr.categories?.performance?.score ?? 0) * 100),
    lab,
    field,
    originField: field?.scope === "origin" ? null : originField,
    screenshot: audits["final-screenshot"]?.details?.data,
    filmstrip: (audits["screenshot-thumbnails"]?.details?.items ?? []).map((i: any) => ({ ms: i.timing, data: i.data })),
    fullPage: fps?.data ? { data: fps.data, width: fps.width, height: fps.height } : undefined,
    viewport,
    diagnoses,
    findings,
    passed: passedAudits(ctx, findings),
    weight: (audits["resource-summary"]?.details?.items ?? [])
      .filter((i: any) => i.resourceType !== "total" && i.requestCount > 0)
      .map((i: any) => ({ type: i.resourceType, label: i.label, requests: i.requestCount, bytes: i.transferSize }))
      .sort((a: any, b: any) => b.bytes - a.bytes),
    thirdParties: (audits["third-parties-insight"]?.details?.items ?? []).map((i: any) => ({
      name: typeof i.entity === "string" ? i.entity : (i.entity?.text ?? "Unknown"),
      bytes: i.transferSize ?? 0,
      mainThreadMs: i.mainThreadTime ?? 0,
    })),
    crawler,
    waterfall: buildWaterfall(audits, origin, lcpUrl),
    platform: platform ? { id: platform.id, name: platform.name, extras: platform.extraNames, cloudflare: platform.cloudflare } : null,
    warnings: (lhr.runWarnings ?? []).map(String),
  };
}
