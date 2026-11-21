// Works out which rich result report and which field a Search Console export is about.

/** Search Console report names, matched to the tool's feature names. */
const REPORTS: [RegExp, string][] = [
  [/merchant[\s_-]*listing/i, "Merchant listing"],
  [/product[\s_-]*snippet|products?\b/i, "Product snippet"],
  [/breadcrumb/i, "Breadcrumb"],
  [/review[\s_-]*snippet|reviews?\b/i, "Review snippet"],
  [/video/i, "Video"],
  [/event/i, "Event"],
  [/recipe/i, "Recipe"],
  [/job[\s_-]*posting|jobs?\b/i, "Job posting"],
  [/profile[\s_-]*page/i, "Profile page"],
  [/discussion[\s_-]*forum/i, "Discussion forum"],
  [/q\s*&\s*a|q&amp;a/i, "Q&A"],
  [/image[\s_-]*metadata/i, "Image metadata"],
  [/organi[sz]ation|logo/i, "Organization"],
  [/local[\s_-]*business/i, "Local business"],
  [/article/i, "Article"],
  [/software[\s_-]*app/i, "Software app"],
  [/movie/i, "Movie"],
];

export const FEATURES = ["Product snippet", "Merchant listing", "Breadcrumb", "Review snippet", "Video", "Event", "Recipe", "Job posting", "Article", "Organization", "Local business", "Profile page", "Discussion forum", "Q&A", "Image metadata", "Software app", "Movie"];

export function detectReport(text: string): string | null {
  for (const [re, f] of REPORTS) if (re.test(text)) return f;
  return null;
}

/** The issue line, from Metadata.csv (key "Issue") or anywhere in the text. */
export function issueText(pairs: Record<string, string> | undefined, meta: string): string | undefined {
  const fromPairs = pairs && Object.entries(pairs).find(([k]) => /^issue/i.test(k))?.[1];
  if (fromPairs) return fromPairs;
  return meta.match(/(Missing field[^|]{0,80}|Either [^|]{0,120}|Invalid [^|]{0,100}|[^|]{0,40}should be specified[^|]{0,40})/i)?.[0]?.trim();
}

/**
 * Field names quoted in an issue, e.g. Missing field "price" (in "offers") -> ["offers.price"].
 * "Either a, b or c should be specified" means any one of them is enough.
 */
export function issueFields(issue: string | undefined): { fields: string[]; either: boolean } {
  if (!issue) return { fields: [], either: false };
  const parent = issue.match(/\(in ["“'‘]?([\w.]+)["”'’]?\)/i)?.[1];
  const quoted = [...issue.replace(/\(in [^)]*\)/i, "").matchAll(/["“'‘]([A-Za-z@][\w.@]*)["”'’]/g)].map((m) => m[1]);
  const fields = [...new Set(quoted.map((f) => (parent && !f.includes(".") ? `${parent}.${f}` : f)))];
  return { fields, either: /^\s*either\b/i.test(issue) };
}
