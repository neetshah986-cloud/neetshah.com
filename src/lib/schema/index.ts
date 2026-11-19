import { contentChecks } from "./content";
import { extract } from "./extract";
import { richResults } from "./google";
import type { Issue, Report } from "./types";
import { validate } from "./validate";
import { VOCAB_VERSION } from "./vocab";

export function analyse(html: string, source: Report["source"]): Report {
  const isFullPage = source.kind === "url" || /<html[\s>]|<body[\s>]/i.test(html);
  const x = extract(html, { isFullPage });
  const topLevel = x.blocks.flatMap((b) => b.items);
  const v = validate(topLevel, x.items);
  const issues: Issue[] = [...x.issues, ...v.issues];

  if (topLevel.length === 0 && !x.issues.some((i) => i.code === "jsonld-syntax")) {
    issues.push({
      severity: source.kind === "url" ? "warning" : "error",
      code: "none-found",
      message: "No structured data was found.",
      hint:
        source.kind === "url" && (x.hints.usesTagManager || x.hints.isJsApp)
          ? "This page looks like it adds content with JavaScript (Google Tag Manager or a client-side app). This tool reads the raw HTML your server sends. If your schema is injected by JavaScript, Google may still see it after rendering, but adding it to the server HTML is more reliable."
          : "Add JSON-LD in a <script type=\"application/ld+json\"> tag, or check that the URL is the page you meant.",
    });
  }

  const content = x.pageText !== null ? contentChecks(topLevel, x.items, x.pageText, x.scriptText ?? "") : null;
  const rendering =
    x.pageText !== null
      ? {
          schemaInServerHtml: topLevel.length > 0,
          jsCreatesSchema: x.hints.jsCreatesSchema,
          tagManager: x.hints.usesTagManager,
          emptyAppShell: x.hints.isJsApp,
          csrValues: content?.filter((c) => c.where === "js").length ?? 0,
          missingValues: content?.filter((c) => c.where === "missing").length ?? 0,
          framework: x.hints.framework,
        }
      : null;

  const counts = {
    items: Object.keys(x.items).length,
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
    info: issues.filter((i) => i.severity === "info").length,
  };

  return {
    source,
    html: x.html,
    vocabVersion: VOCAB_VERSION,
    blocks: x.blocks,
    items: x.items,
    issues,
    richResults: richResults(topLevel, x.items),
    content,
    graph: v.graph,
    rendering,
    counts,
  };
}

export type { Report } from "./types";
