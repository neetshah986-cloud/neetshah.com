import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { parseWithLocations, type Loc } from "./jsonpos";
import type { Block, Issue, Item, Prop, Value } from "./types";

const SCHEMA_IRI = /^https?:\/\/(www\.)?schema\.org\/?/i;

/** "https://schema.org/Product", "schema:Product", "Product" -> "Product". Other IRIs are kept whole. */
export function shortName(term: string): string {
  const t = term.trim();
  if (SCHEMA_IRI.test(t)) return t.replace(SCHEMA_IRI, "").replace(/^#/, "");
  if (t.startsWith("schema:")) return t.slice(7);
  return t;
}

type Ctx = { next: () => string; issues: Issue[]; all: Record<string, Item>; locs?: WeakMap<object, Loc> };

type WithLoc = { sourceCodeLocation?: { startOffset: number; endOffset: number; startTag?: { endOffset: number } } | null };
const locOf = (el: unknown) => (el as WithLoc).sourceCodeLocation ?? undefined;

function makeCtx(): Ctx {
  let n = 0;
  return { next: () => `i${++n}`, issues: [], all: {} };
}

// ---------- JSON-LD ----------

function lineOf(html: string, index: number) {
  return html.slice(0, index).split("\n").length;
}

function jsonErrorPosition(message: string, text: string): { line: number; col: number } | null {
  const lc = message.match(/line (\d+) column (\d+)/);
  if (lc) return { line: Number(lc[1]), col: Number(lc[2]) };
  const pos = message.match(/position (\d+)/);
  if (pos) {
    const before = text.slice(0, Number(pos[1]));
    const lines = before.split("\n");
    return { line: lines.length, col: lines[lines.length - 1].length + 1 };
  }
  return null;
}

function isSchemaContext(ctx: unknown): boolean {
  if (typeof ctx === "string") return SCHEMA_IRI.test(ctx.trim()) || ctx.trim() === "schema.org";
  if (Array.isArray(ctx)) return ctx.some(isSchemaContext);
  if (ctx && typeof ctx === "object") {
    const o = ctx as Record<string, unknown>;
    if (typeof o["@vocab"] === "string" && SCHEMA_IRI.test(o["@vocab"])) return true;
    if (typeof o.schema === "string" && SCHEMA_IRI.test(o.schema)) return true;
  }
  return false;
}

function jsonValue(v: unknown, ctx: Ctx, block: number, out: Value[]) {
  if (v === null || v === undefined) return;
  if (Array.isArray(v)) {
    for (const x of v) jsonValue(x, ctx, block, out);
    return;
  }
  if (typeof v === "string") return void out.push({ kind: "text", value: v, raw: "string" });
  if (typeof v === "number") return void out.push({ kind: "text", value: String(v), raw: "number" });
  if (typeof v === "boolean") return void out.push({ kind: "text", value: String(v), raw: "boolean" });
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("@value" in o) return jsonValue(o["@value"], ctx, block, out);
    if ("@list" in o) return jsonValue(o["@list"], ctx, block, out);
    const keys = Object.keys(o).filter((k) => k !== "@context");
    if (keys.length === 1 && keys[0] === "@id" && typeof o["@id"] === "string") {
      return void out.push({ kind: "ref", id: o["@id"] });
    }
    out.push({ kind: "item", item: jsonItem(o, ctx, block) });
  }
}

function jsonItem(o: Record<string, unknown>, ctx: Ctx, block: number): Item {
  const rawTypes = o["@type"] ?? o.type;
  const types = (Array.isArray(rawTypes) ? rawTypes : rawTypes ? [rawTypes] : []).map((t) => shortName(String(t)));
  const item: Item = { uid: ctx.next(), format: "json-ld", block, types, props: [] };
  const L = ctx.locs?.get(o);
  if (L) item.loc = { start: L.start, end: L.end };
  if (typeof o["@id"] === "string") item.id = o["@id"];
  for (const [key, val] of Object.entries(o)) {
    if (key.startsWith("@")) continue;
    const values: Value[] = [];
    jsonValue(val, ctx, block, values);
    item.props.push({ name: shortName(key), values, at: L?.keys.get(key) });
  }
  ctx.all[item.uid] = item;
  return item;
}

function extractJsonLd($: cheerio.CheerioAPI, html: string, ctx: Ctx, blocks: Block[]) {
  let searchFrom = 0;
  $('script[type="application/ld+json" i]').each((_, el) => {
    const rawText = $(el).text();
    const tagEnd = locOf(el)?.startTag?.endOffset;
    const at = tagEnd ?? html.indexOf(rawText, searchFrom);
    const line = at >= 0 ? lineOf(html, at) : undefined;
    if (at >= 0) searchFrom = at + rawText.length;
    const index = blocks.length;
    const block: Block = { index, format: "json-ld", line, start: locOf(el)?.startOffset ?? (at >= 0 ? at : undefined), raw: rawText.trim(), items: [] };
    blocks.push(block);

    const text = rawText.replace(/^\s*<!--/, "").replace(/-->\s*$/, "").replace(/^\s*\/\/<!\[CDATA\[/, "").replace(/\/\/\]\]>\s*$/, "").trim();
    if (!text) {
      ctx.issues.push({ severity: "warning", code: "jsonld-empty", message: `JSON-LD block ${index + 1} is empty.` });
      return;
    }
    let data: unknown;
    try {
      JSON.parse(text);
      const base = at >= 0 ? at + rawText.indexOf(text) : 0;
      const parsed = parseWithLocations(text, base);
      data = parsed.value;
      ctx.locs = parsed.locs;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const pos = jsonErrorPosition(msg, text);
      const where = pos ? ` at line ${pos.line}, column ${pos.col} of the block` : "";
      ctx.issues.push({
        severity: "error",
        code: "jsonld-syntax",
        message: `JSON-LD block ${index + 1} isn't valid JSON${where}, so search engines ignore all of it.`,
        hint: commonJsonMistake(text) ?? msg,
      });
      return;
    }

    const roots = Array.isArray(data) ? data : [data];
    for (const root of roots) {
      if (!root || typeof root !== "object") continue;
      const r = root as Record<string, unknown>;
      const context = r["@context"];
      if (context === undefined) {
        ctx.issues.push({
          severity: "error",
          code: "jsonld-no-context",
          message: `JSON-LD block ${index + 1} has no @context, so its types and properties aren't recognised as schema.org.`,
          hint: 'Add "@context": "https://schema.org" at the top level.',
        });
      } else if (!isSchemaContext(context)) {
        ctx.issues.push({
          severity: "warning",
          code: "jsonld-context",
          message: `JSON-LD block ${index + 1} uses an @context that isn't schema.org.`,
          hint: 'Use "@context": "https://schema.org".',
        });
      }
      const graph = r["@graph"];
      if (Array.isArray(graph)) {
        for (const g of graph) if (g && typeof g === "object") block.items.push(jsonItem(g as Record<string, unknown>, ctx, index));
        const rest = Object.keys(r).filter((k) => !["@context", "@graph"].includes(k));
        if (rest.length) block.items.push(jsonItem(r, ctx, index));
      } else {
        block.items.push(jsonItem(r, ctx, index));
      }
    }
  });
}

function commonJsonMistake(text: string): string | null {
  if (/,\s*[}\]]/.test(text)) return "There's a trailing comma before a closing } or ]. JSON doesn't allow them.";
  if (/[“”‘’]/.test(text)) return "The block contains curly “smart” quotes. JSON needs straight double quotes (\").";
  if (/'[^']*'\s*:/.test(text)) return "Keys are wrapped in single quotes. JSON needs double quotes.";
  if (/\/\/.*$|\/\*[\s\S]*?\*\//m.test(text.replace(/"(?:[^"\\]|\\.)*"/g, '""'))) return "The block contains comments. JSON doesn't allow comments.";
  return null;
}

// ---------- Microdata ----------

function microdataValue($: cheerio.CheerioAPI, el: Element): string {
  const tag = el.tagName.toLowerCase();
  const $el = $(el);
  if (tag === "meta") return $el.attr("content") ?? "";
  if (["audio", "embed", "iframe", "img", "source", "track", "video"].includes(tag)) return $el.attr("src") ?? "";
  if (["a", "area", "link"].includes(tag)) return $el.attr("href") ?? "";
  if (tag === "object") return $el.attr("data") ?? "";
  if (tag === "data" || tag === "meter") return $el.attr("value") ?? "";
  if (tag === "time") return $el.attr("datetime") ?? $el.text().trim();
  if ($el.attr("content") !== undefined) return $el.attr("content") ?? "";
  return $el.text().replace(/\s+/g, " ").trim();
}

function microdataItem($: cheerio.CheerioAPI, el: Element, ctx: Ctx, block: number, seen: Set<Element>): Item {
  const $el = $(el);
  const types = ($el.attr("itemtype") ?? "").split(/\s+/).filter(Boolean).map(shortName);
  const item: Item = { uid: ctx.next(), format: "microdata", block, types, props: [] };
  const L = locOf(el);
  if (L) item.loc = { start: L.startOffset, end: L.endOffset };
  const itemid = $el.attr("itemid");
  if (itemid) item.id = itemid;
  seen.add(el);

  // Properties: descendants with itemprop whose nearest itemscope ancestor is this element, plus itemref targets.
  const roots: Element[] = [el];
  for (const ref of ($el.attr("itemref") ?? "").split(/\s+/).filter(Boolean)) {
    const target = $(`[id="${ref.replace(/"/g, "")}"]`).get(0);
    if (target && target.type === "tag") roots.push(target as Element);
  }

  const props = new Map<string, Value[]>();
  const propAt = new Map<string, number>();
  const visit = (node: AnyNode, isRoot: boolean) => {
    if (node.type !== "tag" && node.type !== "script" && node.type !== "style") return;
    const e = node as Element;
    const $e = $(e);
    const hasProp = $e.attr("itemprop") !== undefined;
    const hasScope = $e.attr("itemscope") !== undefined;
    if (!isRoot && hasProp) {
      const names = ($e.attr("itemprop") ?? "").split(/\s+/).filter(Boolean).map(shortName);
      const value: Value = hasScope
        ? seen.has(e)
          ? { kind: "text", value: "(circular reference)", raw: "string" }
          : { kind: "item", item: microdataItem($, e, ctx, block, seen) }
        : { kind: "text", value: microdataValue($, e), raw: "string" };
      for (const n of names) {
        props.set(n, [...(props.get(n) ?? []), value]);
        const o = locOf(e)?.startOffset;
        if (o !== undefined && !propAt.has(n)) propAt.set(n, o);
      }
    }
    if (!isRoot && hasScope) return; // a nested item owns its own descendants
    for (const child of e.children) visit(child, false);
  };
  for (const r of roots) visit(r, r === el);

  for (const [name, values] of props) item.props.push({ name, values, at: propAt.get(name) });
  ctx.all[item.uid] = item;
  return item;
}

function extractMicrodata($: cheerio.CheerioAPI, ctx: Ctx, blocks: Block[]) {
  const seen = new Set<Element>();
  $("[itemscope]").each((_, el) => {
    if ($(el).attr("itemprop") !== undefined || seen.has(el)) return; // nested items are handled by their parent
    const index = blocks.length;
    blocks.push({ index, format: "microdata", items: [microdataItem($, el, ctx, index, seen)] });
  });
}

// ---------- RDFa (Lite) ----------

function rdfaTerm(term: string): string {
  return shortName(term.replace(/^schema:/, ""));
}

function rdfaItem($: cheerio.CheerioAPI, el: Element, ctx: Ctx, block: number): Item {
  const $el = $(el);
  const types = ($el.attr("typeof") ?? "").split(/\s+/).filter(Boolean).map(rdfaTerm);
  const item: Item = { uid: ctx.next(), format: "rdfa", block, types, props: [] };
  const L = locOf(el);
  if (L) item.loc = { start: L.startOffset, end: L.endOffset };
  const id = $el.attr("resource") ?? $el.attr("about");
  if (id) item.id = id;
  const props = new Map<string, Value[]>();
  const propAt = new Map<string, number>();

  const visit = (node: AnyNode, isRoot: boolean) => {
    if (node.type !== "tag") return;
    const e = node as Element;
    const $e = $(e);
    const property = $e.attr("property");
    const hasType = $e.attr("typeof") !== undefined;
    if (!isRoot && property) {
      let value: Value;
      if (hasType) value = { kind: "item", item: rdfaItem($, e, ctx, block) };
      else {
        const v =
          $e.attr("content") ??
          (["a", "link", "area"].includes(e.tagName) ? $e.attr("href") : undefined) ??
          (["img", "audio", "video", "source", "iframe"].includes(e.tagName) ? $e.attr("src") : undefined) ??
          $e.attr("resource") ??
          (e.tagName === "time" ? $e.attr("datetime") : undefined) ??
          $e.text().replace(/\s+/g, " ").trim();
        value = { kind: "text", value: v ?? "", raw: "string" };
      }
      for (const n of property.split(/\s+/).filter(Boolean).map(rdfaTerm)) {
        props.set(n, [...(props.get(n) ?? []), value]);
        const o = locOf(e)?.startOffset;
        if (o !== undefined && !propAt.has(n)) propAt.set(n, o);
      }
    }
    if (!isRoot && hasType) return;
    for (const child of e.children) visit(child, false);
  };
  visit(el, true);

  for (const [name, values] of props) item.props.push({ name, values, at: propAt.get(name) });
  ctx.all[item.uid] = item;
  return item;
}

function extractRdfa($: cheerio.CheerioAPI, ctx: Ctx, blocks: Block[]) {
  $("[typeof]").each((_, el) => {
    // Top-level: no ancestor with typeof, and not itself a property value.
    if ($(el).attr("property") !== undefined) return;
    if ($(el).parents("[typeof]").length) return;
    const index = blocks.length;
    blocks.push({ index, format: "rdfa", items: [rdfaItem($, el, ctx, index)] });
  });
}

// ---------- Entry ----------

export type Extraction = {
  html: string; // the source as the user gave it (offsets refer to this)
  blocks: Block[];
  items: Record<string, Item>;
  issues: Issue[];
  pageText: string | null;
  scriptText: string | null; // text of non-JSON-LD scripts, where client-side apps keep their content
  hints: { usesTagManager: boolean; isJsApp: boolean; jsCreatesSchema: boolean; framework?: string };
};

export function extract(input: string, opts: { isFullPage: boolean }): Extraction {
  const ctx = makeCtx();
  const blocks: Block[] = [];

  // Code mode: a bare JSON-LD object (no <script>) is accepted too.
  const trimmed = input.trim();
  let html = input;
  let shift = 0;
  if (!opts.isFullPage && (trimmed.startsWith("{") || trimmed.startsWith("["))) {
    const prefix = '<script type="application/ld+json">';
    html = `${prefix}${input}</script>`;
    shift = prefix.length;
  }

  const $ = cheerio.load(html, { sourceCodeLocationInfo: true } as Parameters<typeof cheerio.load>[1]);
  extractJsonLd($, html, ctx, blocks);
  extractMicrodata($, ctx, blocks);
  extractRdfa($, ctx, blocks);

  // A bare JSON-LD paste was wrapped in a <script> tag; point offsets back at what the user pasted.
  if (shift) {
    const clamp = (n: number) => Math.max(0, Math.min(input.length, n - shift));
    for (const item of Object.values(ctx.all)) {
      if (item.loc) item.loc = { start: clamp(item.loc.start), end: clamp(item.loc.end) };
      for (const p of item.props) if (p.at !== undefined) p.at = clamp(p.at);
    }
    for (const b of blocks) {
      if (b.start !== undefined) b.start = 0;
      b.line = 1;
    }
  }

  let pageText: string | null = null;
  let scriptText: string | null = null;
  let jsCreatesSchema = false;
  if (opts.isFullPage) {
    const parts: string[] = [];
    let size = 0;
    $("script").each((_, el) => {
      const type = ($(el).attr("type") ?? "").toLowerCase();
      if (type === "application/ld+json" || $(el).attr("src")) return;
      const t = $(el).text();
      if (/application\/ld\+json/i.test(t) && /createElement\(\s*["'`]script["'`]\s*\)/.test(t)) jsCreatesSchema = true;
      if (size + t.length > 8_000_000) return;
      size += t.length;
      parts.push(t);
    });
    scriptText = parts.join("\n");
    const $body = cheerio.load(html);
    $body("script, style, noscript, template, svg").remove();
    pageText = ($body("body").text() || $body.root().text()).replace(/\s+/g, " ").trim();
  }

  return {
    html: input,
    blocks,
    items: ctx.all,
    issues: ctx.issues,
    pageText,
    scriptText,
    hints: {
      usesTagManager: /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/.test(input),
      isJsApp: /<div id="(root|app|__next|__nuxt)"[^>]*>\s*<\/div>/.test(input),
      // Inline JavaScript that writes JSON-LD into the page at runtime.
      jsCreatesSchema,
      framework: /__NEXT_DATA__|\/_next\/static\//.test(input)
        ? "Next.js"
        : /window\.__NUXT__|\/_nuxt\//.test(input)
          ? "Nuxt"
          : /ng-version=/.test(input)
            ? "Angular"
            : /data-reactroot|react-dom|__REACT|data-react-helmet/.test(input)
              ? "React"
              : /wp-content\//.test(input)
                ? "WordPress"
                : /cdn\.shopify\.com/.test(input)
                  ? "Shopify"
                  : undefined,
    },
  };
}

export type { Prop };
