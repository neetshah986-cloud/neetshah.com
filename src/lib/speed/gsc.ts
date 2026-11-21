// Reads a Search Console Core Web Vitals export (ZIP of CSVs, Excel, a single CSV, or text pasted from
// Google Sheets) and finds the example URLs, their group values and the issue it's about.
import { strFromU8, unzipSync } from "fflate";
import type { Strategy } from "./types";

export type GscMetric = "LCP" | "INP" | "CLS";

export type GscRow = { url: string; groupValue?: string; groupSize?: number };

export type GscExport = {
  rows: GscRow[];
  metric: GscMetric | null;
  device: Strategy | null;
  issue?: string;
  /** Column header of the group value, e.g. "Group LCP". */
  valueLabel?: string;
};

type Table = string[][];

export function parseDelimited(text: string): Table {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = ["\t", ",", ";"].map((c) => [c, firstLine.split(c).length - 1] as const).sort((a, b) => b[1] - a[1]).find(([, n]) => n > 0)?.[0] ?? ",";
  const rows: Table = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const t = text.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}

/** Minimal .xlsx reader: every sheet as a table of strings (shared strings and inline values). */
function parseXlsx(files: Record<string, Uint8Array>): Record<string, Table> {
  const xml = (p: string) => (files[p] ? strFromU8(files[p]) : "");
  const doc = (s: string) => new DOMParser().parseFromString(s, "application/xml");
  const shared = Array.from(doc(xml("xl/sharedStrings.xml")).getElementsByTagName("si")).map((si) => Array.from(si.getElementsByTagName("t")).map((t) => t.textContent ?? "").join(""));
  const wb = doc(xml("xl/workbook.xml"));
  const rels = doc(xml("xl/_rels/workbook.xml.rels"));
  const target = new Map(Array.from(rels.getElementsByTagName("Relationship")).map((r) => [r.getAttribute("Id"), r.getAttribute("Target") ?? ""]));
  const out: Record<string, Table> = {};
  for (const sh of Array.from(wb.getElementsByTagName("sheet"))) {
    const rid = sh.getAttribute("r:id") ?? sh.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const t = (target.get(rid) ?? "").replace(/^\/?(xl\/)?/, "");
    const sheet = doc(xml(`xl/${t}`));
    const table: Table = [];
    for (const r of Array.from(sheet.getElementsByTagName("row"))) {
      const cells: string[] = [];
      for (const c of Array.from(r.getElementsByTagName("c"))) {
        const ref = c.getAttribute("r") ?? "";
        const col = ref.replace(/\d+/g, "").split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
        const type = c.getAttribute("t");
        const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
        const val = type === "s" ? (shared[Number(v)] ?? "") : type === "inlineStr" ? (c.getElementsByTagName("t")[0]?.textContent ?? "") : v;
        cells[col >= 0 ? col : cells.length] = val;
      }
      table.push(Array.from(cells, (x) => (x ?? "").trim()));
    }
    out[sh.getAttribute("name") ?? t] = table;
  }
  return out;
}

const isUrl = (s: string) => /^https?:\/\/\S+$/i.test(s);

function detectIssue(text: string): { metric: GscMetric | null; device: Strategy | null } {
  const metric = /\bLCP\b/i.test(text) ? "LCP" : /\bINP\b/i.test(text) ? "INP" : /\bCLS\b/i.test(text) ? "CLS" : null;
  const device = /mobile/i.test(text) ? "mobile" : /desktop/i.test(text) ? "desktop" : null;
  return { metric, device };
}

function fromTables(tables: Record<string, Table>, fileName = ""): GscExport {
  // The examples table: the one with the most cells that are URLs.
  let best: Table = [];
  let bestScore = 0;
  for (const t of Object.values(tables)) {
    const score = t.reduce((n, r) => n + r.filter(isUrl).length, 0);
    if (score > bestScore) {
      best = t;
      bestScore = score;
    }
  }
  const metaText = Object.entries(tables)
    .filter(([, t]) => t !== best)
    .map(([, t]) => t.map((r) => r.join(" ")).join(" | "))
    .join(" | ");
  const headerIdx = best.findIndex((r) => r.some((c) => /url/i.test(c)) && !r.some(isUrl));
  const header = headerIdx >= 0 ? best[headerIdx] : [];
  const body = best.slice(headerIdx + 1).filter((r) => r.some(isUrl));
  const width = Math.max(0, ...body.map((r) => r.length));
  let urlCol = 0;
  for (let i = 0, most = -1; i < width; i++) {
    const n = body.filter((r) => isUrl(r[i] ?? "")).length;
    if (n > most) {
      most = n;
      urlCol = i;
    }
  }
  const valueCol = header.findIndex((h) => /\b(LCP|INP|CLS)\b/i.test(h));
  const sizeCol = header.findIndex((h, i) => i !== urlCol && /similar|in group|population|group size|affected|urls/i.test(h) && !/\b(LCP|INP|CLS)\b/i.test(h));
  const rows: GscRow[] = body
    .map((r) => {
      const url = (isUrl(r[urlCol] ?? "") ? r[urlCol] : r.find(isUrl)) ?? "";
      const size = sizeCol >= 0 ? Number(String(r[sizeCol] ?? "").replace(/[^\d.]/g, "")) : NaN;
      return { url, groupValue: valueCol >= 0 ? r[valueCol] || undefined : undefined, groupSize: Number.isFinite(size) && size > 0 ? size : undefined };
    })
    .filter((r) => r.url);
  const fromMeta = detectIssue(metaText);
  const fromHeader = detectIssue(valueCol >= 0 ? header[valueCol] : "");
  const fromName = detectIssue(fileName);
  const issue = metaText.match(/(LCP|INP|CLS)\b[^|]{0,80}/i)?.[0]?.trim();
  return {
    rows,
    metric: fromHeader.metric ?? fromMeta.metric ?? fromName.metric,
    device: fromMeta.device ?? fromName.device,
    issue,
    valueLabel: valueCol >= 0 ? header[valueCol] : undefined,
  };
}

export async function readGscFile(file: File): Promise<GscExport> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const zipped = buf[0] === 0x50 && buf[1] === 0x4b;
  if (zipped) {
    const files = unzipSync(buf);
    if (files["xl/workbook.xml"]) return fromTables(parseXlsx(files), file.name);
    const tables: Record<string, Table> = {};
    for (const [name, data] of Object.entries(files)) if (/\.(csv|tsv|txt)$/i.test(name)) tables[name] = parseDelimited(strFromU8(data));
    if (!Object.keys(tables).length) throw new Error("The ZIP file has no CSV files in it. Export again and choose \"Download CSV\".");
    return fromTables(tables, file.name);
  }
  return readGscText(new TextDecoder().decode(buf), file.name);
}

export function readGscText(text: string, name = ""): GscExport {
  const table = parseDelimited(text);
  const out = fromTables({ pasted: table }, name);
  if (out.rows.length) return out;
  // Plain list of URLs.
  const urls = [...new Set(text.match(/https?:\/\/[^\s"'<>,]+/gi) ?? [])];
  return { rows: urls.map((url) => ({ url })), metric: detectIssue(text).metric, device: detectIssue(text).device };
}
