// Plain-text report a developer can paste into a ticket.
import { formatBytes, formatMs, METRICS, RATING_LABEL, type MetricKey } from "./metrics";
import type { Finding, SpeedRun } from "./types";

const ORDER: MetricKey[] = ["LCP", "INP", "CLS", "FCP", "TTFB", "TBT", "SI"];

export function findingText(f: Finding, n?: number): string {
  const out: string[] = [];
  const saves = [f.savingsMs ? `about ${formatMs(f.savingsMs)}` : "", f.savingsBytes ? formatBytes(f.savingsBytes) : "", f.savingsCls ? `CLS ${f.savingsCls.toFixed(3)}` : ""].filter(Boolean).join(", ");
  out.push(`${n ? `${n}. ` : ""}${f.title} [${f.impact} impact; affects ${f.metrics.join(", ")}${saves ? `; saves ${saves}` : ""}]`);
  out.push(`   ${f.summary}`);
  for (const e of f.elements) {
    out.push(`   Element: ${e.node.selector}${e.note ? ` (${e.note})` : ""}`);
    if (e.current) out.push(`     Now:   ${e.current}`);
    if (e.fixed) out.push(`     Fixed: ${e.fixed}`);
    if (e.change) out.push(`     ${e.change.label}:`, ...e.change.code.split("\n").map((l) => `       ${l}`));
  }
  if (f.resources.length) {
    out.push("   Files:");
    for (const r of f.resources.slice(0, 10))
      out.push(`     - ${r.url}${r.bytes ? ` (${formatBytes(r.bytes)}${r.wastedBytes ? `, ${formatBytes(r.wastedBytes)} can be saved` : ""})` : ""}${r.ms ? ` ${formatMs(r.ms)}` : ""}${r.note ? ` ${r.note}` : ""}${r.thirdParty ? " [third party]" : ""}`);
  }
  if (f.platformSteps) {
    out.push(`   ${f.platformSteps.title}:`);
    f.platformSteps.steps.forEach((s, i) => out.push(`     ${i + 1}) ${s}`));
  }
  if (f.steps.length) {
    out.push(f.platformSteps ? "   Developer steps:" : "   How to fix:");
    f.steps.forEach((s, i) => out.push(`     ${i + 1}) ${s}`));
  }
  for (const c of f.code) out.push(`   ${c.label}:`, ...c.code.split("\n").map((l) => `       ${l}`));
  return out.join("\n");
}

export function devReport(run: SpeedRun): string {
  const lines: string[] = [];
  lines.push(`Page speed report: ${run.finalUrl}`);
  lines.push(`${run.strategy === "mobile" ? "Mobile" : "Desktop"}, tested ${new Date(run.fetchedAt).toUTCString()} with Lighthouse ${run.lighthouseVersion} (PageSpeed Insights)`);
  lines.push(`Performance score: ${run.score}/100`);
  if (run.platform) lines.push(`Built with: ${run.platform.name}${run.platform.extras.length ? ` (${run.platform.extras.join(", ")})` : ""}${run.platform.cloudflare ? ", behind Cloudflare" : ""}`);
  lines.push("");
  if (run.field) {
    lines.push(`REAL USERS (Chrome UX Report, last 28 days, ${run.field.scope === "url" ? "this URL" : "whole site"})`);
    lines.push(`Core Web Vitals: ${run.field.passed === null ? "not enough data" : run.field.passed ? "PASSED" : "FAILED"}`);
    for (const k of ORDER) {
      const m = run.field.metrics[k];
      if (m) lines.push(`- ${METRICS[k].name} (${k}): ${m.display}, ${RATING_LABEL[m.rating]}`);
    }
  } else lines.push("REAL USERS: not enough Chrome UX Report data for this page or site.");
  lines.push("");
  lines.push("LAB TEST");
  for (const k of ORDER) {
    const m = run.lab[k];
    if (m) lines.push(`- ${METRICS[k].name} (${k}): ${m.display}, ${RATING_LABEL[m.rating]}`);
  }
  lines.push("");
  const bad = run.diagnoses.filter((d) => d.rating !== "good");
  if (bad.length) {
    lines.push("ROOT CAUSES");
    for (const d of bad) {
      lines.push(`- ${d.metric}: ${d.headline}`);
      if (d.node) lines.push(`  Element: ${d.node.selector}\n  ${d.node.snippet}`);
      if (d.phases) lines.push(`  Breakdown: ${d.phases.map((p) => `${p.label} ${Math.round(p.share * 100)}%`).join(", ")}`);
    }
    lines.push("");
  }
  if (run.findings.length) {
    lines.push("FIXES, BIGGEST IMPACT FIRST");
    run.findings.forEach((f, i) => lines.push(findingText(f, i + 1), ""));
  } else lines.push("No fixes needed.");
  lines.push("Thresholds (Google): LCP good ≤ 2.5 s, poor > 4 s. INP good ≤ 200 ms, poor > 500 ms. CLS good ≤ 0.1, poor > 0.25.");
  lines.push("Made with the Page Speed Test at https://neetshah.com/tools/page-speed-test");
  return lines.join("\n");
}
