// One plain sentence a beginner can act on: the first thing to do about a page's structured data.
import type { Report } from "./types";

export type SchemaFirst = { text: string; tab?: "items" | "google" | "content" | "source" };

export function schemaDoFirst(r: Report): SchemaFirst | null {
  const top = r.blocks.flatMap((b) => b.items);
  if (r.issues.some((i) => i.code === "blocked")) return { text: "The site blocked this check. Use the Schema inspector bookmark on the page instead: it reads the page in your own browser." };
  const parse = r.issues.find((i) => /json|parse|syntax/i.test(i.code) && i.severity === "error");
  if (parse) return { text: `Fix the broken JSON-LD first: ${parse.message.replace(/\.$/, "")}. Until it's valid JSON, search engines ignore the whole block.`, tab: "items" };
  if (!top.length) return { text: "Add structured data for what this page is about: Product for a product page, Article for a blog post, BreadcrumbList and Organization for every page.", tab: "google" };
  const broken = r.richResults.find((x) => x.status === "invalid");
  if (broken) return { text: `Add ${broken.missingRequired.slice(0, 2).join(" and ")} to the ${broken.type} markup so the page can get the ${broken.feature.toLowerCase()} rich result.`, tab: "google" };
  const missing = (r.content ?? []).filter((c) => c.where === "missing");
  if (missing.length) return { text: `Make the markup match the page: ${missing.length} value${missing.length === 1 ? " isn't" : "s aren't"} visible to visitors (for example ${missing[0].prop} "${missing[0].value.slice(0, 40)}"). Show it on the page or remove it from the markup.`, tab: "content" };
  const err = r.issues.find((i) => i.severity === "error");
  if (err) return { text: `Fix this error: ${err.message.replace(/\.$/, "")}.`, tab: "items" };
  if (r.rendering && !r.rendering.schemaInServerHtml && (r.rendering.tagManager || r.rendering.jsCreatesSchema)) return { text: "Move the structured data into the server HTML (the page template) instead of adding it with JavaScript or Tag Manager." };
  const warn = r.richResults.find((x) => x.status === "warnings");
  if (warn) return { text: `Optional next step: add ${warn.missingRecommended.slice(0, 2).join(" and ")} to the ${warn.feature.toLowerCase()} markup to give Google more to show.`, tab: "google" };
  return null;
}
