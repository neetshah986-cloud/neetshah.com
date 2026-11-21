// Your page's structured data against competitors' pages for the same search.
import type { Item, Report, RichResultStatus } from "./types";

export type Cell = "eligible" | "warnings" | "invalid" | "none" | "retired";

export type Row = {
  feature: string;
  /** What it looks like in Google, in plain words. */
  shows: string;
  cells: Cell[];
  /** Why each page's cell is what it is (missing fields). */
  notes: string[];
};

export type Entrant = { url: string; you: boolean; report?: Report; error?: string; loading?: boolean };

export type Gap = { feature: string; shows: string; have: number; of: number; yours: Cell; why: string };

const SHOWS: Record<string, string> = {
  "Review stars": "Star rating under the result",
  "Price and stock": "Price and availability under the result",
  "Shipping and returns": "Delivery cost and return policy in Shopping results",
  "Product snippet": "Product details (rating, price, availability)",
  "Merchant listing": "Free Shopping listings and product panels",
  Breadcrumb: "Breadcrumb path instead of the URL",
  "Review snippet": "Review stars for a reviewed item",
  "Review snippet (aggregate rating)": "Average rating stars",
  Organization: "Logo and company details in Google",
  "Local business": "Business details in Maps and the knowledge panel",
  Article: "Article details in Top stories and Discover",
  Video: "Video thumbnail and key moments",
  Event: "Event dates and venue",
  Recipe: "Recipe card with rating and cooking time",
  "Job posting": "Listing in Google for Jobs",
  "Site name": "Your site name above the result",
  "Software app": "App rating and price",
  "Profile page": "Profile details for a person or organization",
  "Discussion forum": "Forum threads in Perspectives",
  "Q&A": "Question and answers",
  "Image metadata": "Licence details on images",
  Movie: "Movie carousel",
  FAQ: "Retired: Google stopped showing FAQ results in May 2026",
  "How-to": "Retired",
};

const RANK: Record<Cell, number> = { eligible: 4, warnings: 3, invalid: 2, retired: 1, none: 0 };
const toCell = (s: RichResultStatus): Cell => (s === "eligible" ? "eligible" : s === "warnings" ? "warnings" : s === "invalid" ? "invalid" : "retired");

const hasProp = (i: Item, name: string) => i.props.some((p) => p.name === name && p.values.length > 0);
function offerHas(i: Item, name: string): boolean {
  return i.props.filter((p) => p.name === "offers").some((p) => p.values.some((v) => v.kind === "item" && (hasProp(v.item, name) || v.item.props.some((q) => q.name === "offers" && q.values.some((w) => w.kind === "item" && hasProp(w.item, name))))));
}

/** Rows for what shoppers actually see, worked out from the product items. */
function derived(r: Report): Record<string, Cell> {
  // Only products Google treats as the page's product (the ones its product rules apply to), not products listed in an ItemList on a category page.
  const main = new Set(r.richResults.filter((x) => x.feature === "Product snippet" || x.feature === "Merchant listing").map((x) => x.item));
  const products = Object.values(r.items).filter((i) => main.has(i.uid));
  const snippet = r.richResults.filter((x) => x.feature === "Product snippet" || x.feature === "Review snippet (aggregate rating)");
  const bad = snippet.length > 0 && snippet.every((x) => x.status === "invalid");
  const stars = products.some((p) => hasProp(p, "aggregateRating") || hasProp(p, "review"));
  const price = products.some((p) => offerHas(p, "price") || offerHas(p, "lowPrice"));
  const ship = products.some((p) => offerHas(p, "shippingDetails") || offerHas(p, "hasMerchantReturnPolicy"));
  return {
    "Review stars": stars ? (bad ? "invalid" : "eligible") : "none",
    "Price and stock": price ? (bad ? "invalid" : "eligible") : "none",
    "Shipping and returns": ship ? "eligible" : "none",
  };
}

function best(r: Report, feature: string): { cell: Cell; note: string } {
  const rs = r.richResults.filter((x) => x.feature === feature);
  if (!rs.length) return { cell: "none", note: "" };
  const top = rs.reduce((a, b) => (RANK[toCell(b.status)] > RANK[toCell(a.status)] ? b : a));
  const note = top.missingRequired.length ? `Missing: ${top.missingRequired.join(", ")}` : top.missingRecommended.length ? `Could add: ${top.missingRecommended.slice(0, 3).join(", ")}` : "";
  return { cell: toCell(top.status), note };
}

export const blockedReport = (r: Report) => r.issues.some((i) => i.code === "blocked");

export function compareSchema(entrants: Entrant[]) {
  const done = entrants.filter((e): e is Entrant & { report: Report } => !!e.report);
  const features = new Set<string>();
  for (const e of done) for (const r of e.report.richResults) features.add(r.feature);
  const shopping = done.some((e) => Object.values(e.report.items).some((i) => i.types.some((t) => /Product/.test(t))));
  const rows: Row[] = [];
  if (shopping)
    for (const f of ["Review stars", "Price and stock", "Shipping and returns"]) {
      rows.push({ feature: f, shows: SHOWS[f], cells: done.map((e) => derived(e.report)[f]), notes: done.map(() => "") });
    }
  for (const f of features) {
    const b = done.map((e) => best(e.report, f));
    rows.push({ feature: f, shows: SHOWS[f] ?? "", cells: b.map((x) => x.cell), notes: b.map((x) => x.note) });
  }
  // Most common features first; retired ones last.
  const score = (r: Row) => (r.cells.every((c) => c === "retired" || c === "none") ? -1 : r.cells.filter((c) => c === "eligible" || c === "warnings").length);
  rows.sort((a, b) => score(b) - score(a));

  const youIdx = done.findIndex((e) => e.you);
  const gaps: Gap[] = [];
  if (youIdx >= 0) {
    const readable = done.map((e) => !blockedReport(e.report));
    const others = readable.filter((ok, i) => ok && i !== youIdx).length;
    for (const row of rows) {
      if (row.cells.every((c) => c === "retired" || c === "none")) continue;
      if (/^(FAQ|How-to)$/.test(row.feature)) continue;
      const yours = row.cells[youIdx];
      if (yours === "eligible" || yours === "warnings") continue;
      const have = row.cells.filter((c, i) => i !== youIdx && readable[i] && (c === "eligible" || c === "warnings")).length;
      if (!have) continue;
      const why =
        yours === "invalid"
          ? `Your page has this markup, but it's missing required fields${row.notes[youIdx] ? ` (${row.notes[youIdx].replace(/^Missing: /, "")})` : ""}.`
          : row.feature === "Review stars"
            ? "Your product markup has no aggregateRating or review, so Google can't show stars."
            : row.feature === "Price and stock"
              ? "Your product markup has no offer with a price."
              : row.feature === "Shipping and returns"
                ? "Your offers don't include shippingDetails or hasMerchantReturnPolicy."
                : `Your page has no ${row.feature.toLowerCase()} markup.`;
      gaps.push({ feature: row.feature, shows: row.shows, have, of: others, yours, why });
    }
    // Don't list the same fix twice: stars and the aggregate rating are one change, as are a missing price and a broken merchant listing.
    const names = new Set(gaps.map((g) => g.feature));
    for (let i = gaps.length - 1; i >= 0; i--) {
      const g = gaps[i];
      if (g.feature === "Review snippet (aggregate rating)" && names.has("Review stars")) gaps.splice(i, 1);
      else if (g.feature === "Price and stock" && names.has("Merchant listing")) gaps.splice(i, 1);
    }
    gaps.sort((a, b) => b.have - a.have);
  }
  return { done, rows, gaps, youIdx };
}

export function typesOf(r: Report): string[] {
  const top = new Set<string>();
  for (const b of r.blocks) for (const i of b.items) for (const t of i.types) top.add(t.replace(/^https?:\/\/schema\.org\//, ""));
  return [...top];
}
