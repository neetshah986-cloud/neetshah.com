// Builds JSON-LD a user can paste: an existing item with its missing fields added, or a fresh template
// for a rich result the page doesn't have yet. Placeholders are in CAPITALS so they can't be mistaken
// for real data.
import type { Item, Report, RichResult } from "./types";

type Json = Record<string, unknown>;

/** Turns an extracted item back into JSON-LD. */
export function itemToJson(item: Item, depth = 0): Json {
  const out: Json = {};
  if (depth === 0) out["@context"] = "https://schema.org";
  out["@type"] = item.types.length === 1 ? item.types[0] : item.types;
  if (item.id) out["@id"] = item.id;
  for (const p of item.props) {
    const vals = p.values.map((v) => {
      if (v.kind === "text") return v.raw === "number" ? Number(v.value) : v.raw === "boolean" ? v.value === "true" : v.value;
      if (v.kind === "ref") return { "@id": v.id };
      return depth > 6 ? { "@type": v.item.types[0] } : itemToJson(v.item, depth + 1);
    });
    out[p.name] = vals.length === 1 ? vals[0] : vals;
  }
  return out;
}

/** What to put in a missing field. */
const FILL: Record<string, unknown> = {
  name: "PRODUCT OR PAGE NAME",
  image: "https://example.com/IMAGE.jpg",
  description: "SHORT DESCRIPTION",
  sku: "YOUR-SKU",
  gtin: "GTIN BARCODE NUMBER",
  mpn: "MANUFACTURER PART NUMBER",
  brand: { "@type": "Brand", name: "BRAND NAME" },
  offers: { "@type": "Offer", price: "PRICE e.g. 1499.00", priceCurrency: "INR", availability: "https://schema.org/InStock" },
  price: "PRICE e.g. 1499.00",
  lowPrice: "LOWEST PRICE",
  priceCurrency: "INR",
  availability: "https://schema.org/InStock",
  itemCondition: "https://schema.org/NewCondition",
  aggregateRating: { "@type": "AggregateRating", ratingValue: "AVERAGE RATING e.g. 4.6", reviewCount: "NUMBER OF REVIEWS" },
  ratingValue: "AVERAGE RATING e.g. 4.6",
  reviewCount: "NUMBER OF REVIEWS",
  ratingCount: "NUMBER OF RATINGS",
  bestRating: "5",
  worstRating: "1",
  review: { "@type": "Review", author: { "@type": "Person", name: "REVIEWER NAME" }, reviewRating: { "@type": "Rating", ratingValue: "RATING e.g. 5" }, reviewBody: "REVIEW TEXT" },
  reviewRating: { "@type": "Rating", ratingValue: "RATING e.g. 5" },
  author: { "@type": "Person", name: "AUTHOR NAME", url: "https://example.com/AUTHOR-PAGE" },
  itemReviewed: { "@type": "Product", name: "WHAT IS REVIEWED" },
  datePublished: "2026-01-31",
  dateModified: "2026-01-31",
  headline: "ARTICLE HEADLINE",
  uploadDate: "2026-01-31T08:00:00+05:30",
  thumbnailUrl: "https://example.com/THUMBNAIL.jpg",
  contentUrl: "https://example.com/VIDEO.mp4",
  duration: "PT2M30S",
  shippingDetails: {
    "@type": "OfferShippingDetails",
    shippingRate: { "@type": "MonetaryAmount", value: "SHIPPING COST e.g. 0", currency: "INR" },
    shippingDestination: { "@type": "DefinedRegion", addressCountry: "IN" },
    deliveryTime: { "@type": "ShippingDeliveryTime", handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" }, transitTime: { "@type": "QuantitativeValue", minValue: 2, maxValue: 5, unitCode: "DAY" } },
  },
  hasMerchantReturnPolicy: { "@type": "MerchantReturnPolicy", applicableCountry: "IN", returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow", merchantReturnDays: "RETURN DAYS e.g. 7", returnMethod: "https://schema.org/ReturnByMail", returnFees: "https://schema.org/FreeReturn" },
  itemListElement: [{ "@type": "ListItem", position: 1, name: "HOME", item: "https://example.com/" }],
  position: 1,
  item: "https://example.com/PAGE",
  address: { "@type": "PostalAddress", streetAddress: "STREET", addressLocality: "CITY", postalCode: "PIN CODE", addressCountry: "IN" },
  telephone: "+91-PHONE",
  url: "https://example.com/PAGE",
  logo: "https://example.com/LOGO.png",
  startDate: "2026-12-31T19:00:00+05:30",
  location: { "@type": "Place", name: "VENUE NAME", address: "VENUE ADDRESS" },
};

const fillFor = (key: string): unknown => (key in FILL ? structuredClone(FILL[key]) : `${key.toUpperCase()} VALUE`);

/** Sets a dotted path ("offers.price") on JSON, creating objects on the way. Returns true if it added something. */
function setPath(obj: Json, path: string): boolean {
  const [head, ...rest] = path.split(".");
  let cur = obj[head];
  if (!rest.length) {
    if (cur !== undefined && cur !== "") return false;
    obj[head] = fillFor(head);
    return true;
  }
  if (Array.isArray(cur)) cur = cur[0];
  if (cur === undefined || typeof cur !== "object" || cur === null) {
    // Create the parent with only the field asked for (plus its @type when known).
    const base = fillFor(head);
    const fresh: Json = base && typeof base === "object" && !Array.isArray(base) && (base as Json)["@type"] ? { "@type": (base as Json)["@type"] } : {};
    obj[head] = fresh;
    cur = fresh;
  }
  return setPath(cur as Json, rest.join("."));
}

/** The item as JSON-LD with each missing field added. `paths` use the rule format ("a|b" means either: the first is used). */
export function withMissing(item: Item, paths: string[]): { json: Json; added: string[] } {
  const json = itemToJson(item);
  const added: string[] = [];
  for (const spec of paths) {
    const path = spec.split(" or ")[0].split("|")[0].trim();
    if (setPath(json, path)) added.push(path);
  }
  return { json, added };
}

export function pretty(json: unknown) {
  return `<script type="application/ld+json">\n${JSON.stringify(json, null, 2)}\n</script>`;
}

/** A starter template for a rich result the page doesn't have, using what's known about the page. */
export function template(feature: string, report: Report): Json | null {
  const url = report.source.finalUrl ?? report.source.url ?? "https://example.com/PAGE";
  const items = Object.values(report.items);
  const product = items.find((i) => i.types.some((t) => /^(Product|ProductGroup)$/.test(t)));
  const text = (i: Item | undefined, k: string) => {
    const v = i?.props.find((p) => p.name === k)?.values[0];
    return v?.kind === "text" ? v.value : undefined;
  };
  const productName = text(product, "name") ?? "PRODUCT NAME";
  let origin = "https://example.com";
  try {
    origin = new URL(url).origin;
  } catch {
    /* keep the example */
  }
  switch (feature) {
    case "Breadcrumb":
      return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
          { "@type": "ListItem", position: 2, name: "CATEGORY NAME", item: `${origin}/CATEGORY-URL` },
          { "@type": "ListItem", position: 3, name: product ? productName : "THIS PAGE'S NAME" },
        ],
      };
    case "Review stars":
    case "Product snippet":
    case "Review snippet (aggregate rating)":
      return {
        "@context": "https://schema.org",
        "@type": "Product",
        name: productName,
        image: text(product, "image") ?? "https://example.com/IMAGE.jpg",
        aggregateRating: FILL.aggregateRating,
        offers: FILL.offers,
      };
    case "Price and stock":
    case "Merchant listing":
      return {
        "@context": "https://schema.org",
        "@type": "Product",
        name: productName,
        image: text(product, "image") ?? "https://example.com/IMAGE.jpg",
        offers: { ...(FILL.offers as Json), shippingDetails: FILL.shippingDetails, hasMerchantReturnPolicy: FILL.hasMerchantReturnPolicy },
      };
    case "Shipping and returns":
      return { "@context": "https://schema.org", "@type": "Offer", shippingDetails: FILL.shippingDetails, hasMerchantReturnPolicy: FILL.hasMerchantReturnPolicy };
    case "Organization":
      return { "@context": "https://schema.org", "@type": "Organization", name: "COMPANY NAME", url: `${origin}/`, logo: `${origin}/LOGO.png`, sameAs: ["https://www.instagram.com/YOURPAGE", "https://www.linkedin.com/company/YOURPAGE"] };
    case "Site name":
      return { "@context": "https://schema.org", "@type": "WebSite", name: "SITE NAME", url: `${origin}/` };
    case "Article":
      return { "@context": "https://schema.org", "@type": "Article", headline: "ARTICLE HEADLINE", image: ["https://example.com/IMAGE.jpg"], datePublished: "2026-01-31T08:00:00+05:30", dateModified: "2026-01-31T08:00:00+05:30", author: [FILL.author] };
    case "Video":
      return { "@context": "https://schema.org", "@type": "VideoObject", name: "VIDEO TITLE", description: "VIDEO DESCRIPTION", thumbnailUrl: FILL.thumbnailUrl, uploadDate: FILL.uploadDate, duration: FILL.duration, contentUrl: FILL.contentUrl };
    case "Local business":
      return { "@context": "https://schema.org", "@type": "LocalBusiness", name: "BUSINESS NAME", address: FILL.address, telephone: FILL.telephone, url: `${origin}/`, openingHours: "Mo-Sa 10:00-20:00" };
    case "Review snippet":
      return { "@context": "https://schema.org", "@type": "Review", itemReviewed: FILL.itemReviewed, author: FILL.author, reviewRating: FILL.reviewRating, datePublished: FILL.datePublished };
    case "Event":
      return { "@context": "https://schema.org", "@type": "Event", name: "EVENT NAME", startDate: FILL.startDate, location: FILL.location };
    default:
      return null;
  }
}

/** Rich results for one feature on a report, best first. */
export function forFeature(report: Report, feature: string): RichResult[] {
  const order = { eligible: 0, warnings: 1, invalid: 2, limited: 3, retired: 4 };
  return report.richResults.filter((r) => r.feature === feature).sort((a, b) => order[a.status] - order[b.status]);
}
