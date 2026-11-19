// Checks that key structured data values also appear in the page's visible text.
// Google's guidelines: structured data must describe content that is visible to users.
import type { ContentCheck, Item } from "./types";
import { getClass, isA } from "./vocab";

type Target = { types: string[]; paths: string[] };

const TARGETS: Target[] = [
  { types: ["Product"], paths: ["name", "offers.price", "offers.lowPrice", "aggregateRating.ratingValue", "aggregateRating.reviewCount", "aggregateRating.ratingCount"] },
  { types: ["Article"], paths: ["headline", "author.name"] },
  { types: ["Event"], paths: ["name", "startDate"] },
  { types: ["Recipe"], paths: ["name"] },
  { types: ["JobPosting"], paths: ["title", "hiringOrganization.name"] },
  { types: ["LocalBusiness"], paths: ["name", "telephone", "address.streetAddress"] },
  { types: ["Review"], paths: ["author.name", "reviewRating.ratingValue", "reviewBody"] },
  { types: ["FAQPage", "QAPage"], paths: ["mainEntity.name", "mainEntity.acceptedAnswer.text"] },
  { types: ["SoftwareApplication"], paths: ["name", "offers.price"] },
  { types: ["VideoObject"], paths: ["name"] },
  { types: ["Course"], paths: ["name"] },
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

function collect(item: Item, path: string, byId: Map<string, Item>): string[] {
  const [head, ...rest] = path.split(".");
  const out: string[] = [];
  for (const p of item.props.filter((x) => x.name === head))
    for (const v of p.values) {
      const target = v.kind === "item" ? v.item : v.kind === "ref" ? byId.get(v.id) : undefined;
      if (!rest.length) {
        if (v.kind === "text" && v.value.trim()) out.push(v.value.trim());
      } else if (target) out.push(...collect(target, rest.join("."), byId));
    }
  return out;
}

function numberVariants(raw: string): string[] {
  const n = Number(raw.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return [];
  const out = new Set<string>([String(n), n.toFixed(2), n.toLocaleString("en-US"), n.toLocaleString("en-IN"), n.toLocaleString("de-DE")]);
  if (Number.isInteger(n)) {
    out.add(n.toLocaleString("en-US", { minimumFractionDigits: 2 }));
    out.add(n.toLocaleString("en-IN", { minimumFractionDigits: 2 }));
  }
  return [...out];
}

function foundIn(page: { text: string; normal: string; digits: string }, prop: string, value: string): boolean {
  const last = prop.split(".").pop()!;
  if ((last === "price" || last === "lowPrice") && Number(value) === 0 && /\bfree\b/.test(page.normal)) return true;
  if (["price", "lowPrice", "ratingValue", "reviewCount", "ratingCount"].includes(last)) {
    return numberVariants(value).some((v) => new RegExp(`(^|[^\\d.,])${v.replace(/[.]/g, "\\.")}($|[^\\d])`).test(page.text));
  }
  if (last === "telephone") {
    const d = value.replace(/\D/g, "");
    return d.length >= 7 && page.digits.includes(d.slice(-8));
  }
  if (last === "startDate") {
    const t = Date.parse(value);
    if (Number.isNaN(t)) return false;
    const date = new Date(t);
    const day = String(date.getUTCDate());
    const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
    const month = months[date.getUTCMonth()];
    return page.normal.includes(`${day} ${month}`) || page.normal.includes(`${month} ${day}`) || page.normal.includes(`${day} ${month.slice(0, 3)}`) || page.normal.includes(`${month.slice(0, 3)} ${day}`) || page.text.includes(value.slice(0, 10));
  }
  const v = norm(value);
  if (!v) return true;
  const probe = v.length > 80 ? v.slice(0, 60).replace(/\s\S*$/, "") : v;
  return page.normal.includes(probe);
}

export function contentChecks(topLevel: Item[], all: Record<string, Item>, pageText: string): ContentCheck[] {
  const byId = new Map<string, Item>();
  for (const i of Object.values(all)) if (i.id && !byId.has(i.id)) byId.set(i.id, i);
  const page = { text: pageText, normal: norm(pageText), digits: pageText.replace(/\D/g, "") };

  const candidates = [...topLevel];
  for (const i of topLevel) for (const p of i.props) if (p.name === "mainEntity") for (const v of p.values) if (v.kind === "item") candidates.push(v.item);

  const out: ContentCheck[] = [];
  const seen = new Set<string>();
  for (const item of candidates) {
    const target = TARGETS.find((t) => item.types.some((ty) => getClass(ty) && t.types.some((r) => isA(ty, r))));
    if (!target) continue;
    for (const path of target.paths)
      for (const value of collect(item, path, byId).slice(0, 5)) {
        const key = `${item.uid}|${path}|${value}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ item: item.uid, prop: path, value, found: foundIn(page, path, value) });
      }
  }
  return out;
}
