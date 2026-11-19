// Google Search rich result requirements, from Google Search Central's structured data docs.
// Checked November 2026. Google retires features often; keep RETIRED up to date.
import type { Item, RichResult, RichResultStatus } from "./types";
import { getClass, isA } from "./vocab";

type Rule = {
  feature: string;
  types: string[]; // matched with inheritance (Article matches BlogPosting)
  required: string[]; // paths; "a|b" means either
  recommended: string[];
  docs: string;
  when?: (item: Item, ctx: Lookup) => boolean;
  exclude?: string[]; // subtypes that shouldn't match (BlogPosting is a SocialMediaPosting in schema.org)
  topLevelOnly?: boolean;
};

type Lookup = { byId: Map<string, Item> };

const DOCS = "https://developers.google.com/search/docs/appearance/structured-data/";
const GTIN = "gtin|gtin8|gtin12|gtin13|gtin14|mpn|sku";
const PRICE = "offers.price|offers.lowPrice|offers.priceSpecification.price";
const CURRENCY = "offers.priceCurrency|offers.priceSpecification.priceCurrency";

const RULES: Rule[] = [
  {
    feature: "Article",
    types: ["Article"],
    required: [],
    recommended: ["headline", "image", "datePublished", "dateModified", "author", "author.name", "author.url"],
    docs: DOCS + "article",
  },
  {
    feature: "Breadcrumb",
    types: ["BreadcrumbList"],
    required: ["itemListElement", "itemListElement.position", "itemListElement.name|itemListElement.item.name"],
    recommended: ["itemListElement.item"],
    docs: DOCS + "breadcrumb",
  },
  {
    feature: "Product snippet",
    types: ["Product", "ProductGroup"],
    required: ["name", "review|aggregateRating|offers"],
    recommended: ["image", "description", "brand", GTIN, "aggregateRating", "review", PRICE],
    docs: DOCS + "product-snippet",
  },
  {
    feature: "Merchant listing",
    types: ["Product"],
    when: (item) => item.props.some((p) => p.name === "offers"),
    required: ["name", "image", PRICE, CURRENCY],
    recommended: ["description", "brand.name|brand", GTIN, "offers.availability", "offers.itemCondition", "offers.shippingDetails", "offers.hasMerchantReturnPolicy"],
    docs: DOCS + "merchant-listing",
  },
  {
    feature: "Review snippet",
    types: ["Review"],
    required: ["author", "author.name|author", "reviewRating", "reviewRating.ratingValue"],
    recommended: ["datePublished", "reviewRating.bestRating", "itemReviewed.name"],
    docs: DOCS + "review-snippet",
  },
  {
    feature: "Review snippet (aggregate rating)",
    types: ["AggregateRating"],
    required: ["ratingValue", "ratingCount|reviewCount"],
    recommended: ["bestRating", "worstRating"],
    docs: DOCS + "review-snippet",
  },
  {
    feature: "Organization",
    types: ["Organization"],
    required: [],
    recommended: ["name", "url", "logo", "sameAs", "description", "address", "telephone|contactPoint"],
    docs: DOCS + "organization",
  },
  {
    feature: "Local business",
    types: ["LocalBusiness"],
    required: ["name", "address"],
    recommended: ["address.streetAddress", "address.addressLocality", "address.postalCode", "address.addressCountry", "telephone", "url", "geo", "openingHoursSpecification|openingHours", "priceRange", "image"],
    docs: DOCS + "local-business",
  },
  {
    feature: "Event",
    types: ["Event"],
    required: ["name", "startDate", "location"],
    recommended: ["endDate", "eventStatus", "eventAttendanceMode", "location.address|location.url", "image", "description", "offers", "organizer", "performer"],
    docs: DOCS + "event",
  },
  {
    feature: "Recipe",
    types: ["Recipe"],
    required: ["name", "image"],
    recommended: ["author", "datePublished", "description", "recipeIngredient", "recipeInstructions", "totalTime|cookTime", "recipeYield", "recipeCategory", "recipeCuisine", "nutrition.calories", "aggregateRating", "keywords", "video"],
    docs: DOCS + "recipe",
  },
  {
    feature: "Video",
    types: ["VideoObject"],
    required: ["name", "thumbnailUrl", "uploadDate"],
    recommended: ["description", "contentUrl|embedUrl", "duration"],
    docs: DOCS + "video",
  },
  {
    feature: "Job posting",
    types: ["JobPosting"],
    required: ["title", "description", "datePosted", "hiringOrganization", "hiringOrganization.name", "jobLocation|applicantLocationRequirements"],
    recommended: ["validThrough", "employmentType", "baseSalary", "identifier", "directApply", "jobLocation.address"],
    docs: DOCS + "job-posting",
  },
  {
    feature: "Software app",
    types: ["SoftwareApplication"],
    required: ["name", "offers.price", "aggregateRating|review"],
    recommended: ["applicationCategory", "operatingSystem"],
    docs: DOCS + "software-app",
  },
  {
    feature: "Profile page",
    types: ["ProfilePage"],
    required: ["mainEntity", "mainEntity.name"],
    recommended: ["mainEntity.image", "mainEntity.sameAs", "mainEntity.description|mainEntity.disambiguatingDescription", "dateCreated", "dateModified"],
    docs: DOCS + "profile-page",
  },
  {
    feature: "Discussion forum",
    types: ["DiscussionForumPosting", "SocialMediaPosting"],
    exclude: ["BlogPosting", "LiveBlogPosting"],
    required: ["author", "datePublished", "text|image|video"],
    recommended: ["headline", "url", "comment", "interactionStatistic", "dateModified"],
    docs: DOCS + "discussion-forum",
  },
  {
    feature: "Q&A",
    types: ["QAPage"],
    required: ["mainEntity", "mainEntity.name", "mainEntity.answerCount", "mainEntity.acceptedAnswer|mainEntity.suggestedAnswer"],
    recommended: ["mainEntity.text", "mainEntity.author", "mainEntity.datePublished"],
    docs: DOCS + "qapage",
  },
  {
    feature: "Image metadata",
    types: ["ImageObject"],
    topLevelOnly: true,
    required: ["contentUrl"],
    recommended: ["license", "acquireLicensePage", "creditText", "creator", "copyrightNotice"],
    docs: DOCS + "image-license-metadata",
  },
  {
    feature: "Site name",
    types: ["WebSite"],
    required: ["name", "url"],
    recommended: ["alternateName"],
    docs: "https://developers.google.com/search/docs/appearance/site-names",
  },
  {
    feature: "Movie",
    types: ["Movie"],
    required: ["name", "image"],
    recommended: ["dateCreated", "director", "aggregateRating", "review"],
    docs: DOCS + "movie",
  },
];

// Features Google no longer shows. The markup is still valid schema.org.
const RETIRED: { types: string[]; feature: string; note: string; status: RichResultStatus }[] = [
  { types: ["FAQPage"], feature: "FAQ", status: "retired", note: "FAQ rich results stopped appearing in Google Search on 7 May 2026. The markup is still valid and can help search engines understand the page." },
  { types: ["HowTo"], feature: "How-to", status: "retired", note: "Google stopped showing how-to rich results in September 2023." },
  { types: ["Course"], feature: "Course info", status: "retired", note: "Google phased out course info rich results in 2025." },
  { types: ["ClaimReview"], feature: "Fact check", status: "retired", note: "Google phased out ClaimReview rich results in 2025." },
  { types: ["SpecialAnnouncement"], feature: "Special announcement", status: "retired", note: "Google phased out special announcements in 2025." },
  { types: ["Car", "Vehicle"], feature: "Vehicle listing", status: "retired", note: "Google phased out vehicle listing rich results in 2025." },
  { types: ["Occupation"], feature: "Estimated salary", status: "retired", note: "Google phased out estimated salary rich results in 2025." },
  { types: ["Quiz"], feature: "Practice problems", status: "retired", note: "Google retired practice problem rich results in January 2026." },
  { types: ["Dataset"], feature: "Dataset", status: "limited", note: "Dataset markup is used by Google Dataset Search only, not by Google Search results." },
];

function values(item: Item, prop: string, ctx: Lookup) {
  const out: (string | Item)[] = [];
  for (const p of item.props.filter((x) => x.name === prop))
    for (const v of p.values) {
      if (v.kind === "text") {
        if (v.value.trim()) out.push(v.value);
      }
      else if (v.kind === "item") out.push(v.item);
      else {
        const target = ctx.byId.get(v.id);
        out.push(target ?? v.id);
      }
    }
  return out;
}

function hasPath(item: Item, path: string, ctx: Lookup): boolean {
  const [head, ...rest] = path.split(".");
  const vs = values(item, head, ctx);
  if (!rest.length) return vs.length > 0;
  return vs.some((v) => typeof v !== "string" && hasPath(v, rest.join("."), ctx));
}

const satisfied = (item: Item, spec: string, ctx: Lookup) => spec.split("|").some((p) => hasPath(item, p, ctx));
const label = (spec: string) => spec.split("|").join(" or ");
const matches = (item: Item, types: string[]) => item.types.some((t) => getClass(t) && types.some((r) => isA(t, r)));

export function richResults(topLevel: Item[], all: Record<string, Item>): RichResult[] {
  const byId = new Map<string, Item>();
  for (const i of Object.values(all)) if (i.id && !byId.has(i.id)) byId.set(i.id, i);
  const ctx: Lookup = { byId };
  const top = new Set(topLevel.map((i) => i.uid));

  // Candidates: top-level items, plus main entities and items nested in common containers.
  const candidates = new Map<string, Item>();
  for (const i of topLevel) candidates.set(i.uid, i);
  for (const i of Object.values(all)) {
    for (const p of i.props) {
      if (!["mainEntity", "about", "hasPart", "subjectOf", "itemReviewed", "aggregateRating", "review"].includes(p.name)) continue;
      for (const v of p.values) if (v.kind === "item") candidates.set(v.item.uid, v.item);
    }
  }

  const out: RichResult[] = [];
  for (const item of candidates.values()) {
    const retired = RETIRED.find((r) => matches(item, r.types));
    if (retired && top.has(item.uid)) {
      out.push({ feature: retired.feature, item: item.uid, type: item.types.join("/"), status: retired.status, note: retired.note, missingRequired: [], missingRecommended: [] });
      continue;
    }
    for (const rule of RULES) {
      if (!matches(item, rule.types)) continue;
      if (rule.exclude && matches(item, rule.exclude)) continue;
      if (rule.when && !rule.when(item, ctx)) continue;
      if (rule.topLevelOnly && !top.has(item.uid)) continue;
      // Organization matches LocalBusiness too; report only the most specific of the two.
      if (rule.feature === "Organization" && matches(item, ["LocalBusiness"])) continue;
      const required = [...rule.required];
      if (rule.feature === "Review snippet" && top.has(item.uid)) required.push("itemReviewed");
      if (rule.feature.startsWith("Review snippet (aggregate") && top.has(item.uid)) required.push("itemReviewed");
      const missingRequired = required.filter((s) => !satisfied(item, s, ctx)).map(label);
      const missingRecommended = rule.recommended.filter((s) => !satisfied(item, s, ctx)).map(label);
      const status: RichResultStatus = missingRequired.length ? "invalid" : missingRecommended.length ? "warnings" : "eligible";
      out.push({ feature: rule.feature, item: item.uid, type: item.types.join("/"), status, missingRequired, missingRecommended, docs: rule.docs });
    }
  }
  const order: Record<RichResultStatus, number> = { invalid: 0, warnings: 1, eligible: 2, limited: 3, retired: 4 };
  return out.sort((a, b) => order[a.status] - order[b.status]);
}
