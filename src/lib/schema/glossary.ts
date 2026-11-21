// Plain explanations of structured data words, for beginners.
import type { GlossaryEntry } from "@/lib/speed/glossary";

const E = (key: string, term: string, text: string, match: RegExp): GlossaryEntry => ({ key, term, text, match });

export const SCHEMA_GLOSSARY: GlossaryEntry[] = [
  E("sd", "Structured data", "Extra code that describes the page to search engines in a fixed format: this is a product, it costs ₹1,499, it has 4.6 stars.", /\bstructured data\b/i),
  E("jsonld", "JSON-LD", "The format Google recommends for structured data: a block of code inside <script type=\"application/ld+json\"> that doesn't change what visitors see.", /\bJSON-LD\b/),
  E("microdata", "Microdata", "An older way to add structured data, using attributes such as itemprop on the page's own HTML tags.", /\bmicrodata\b/i),
  E("rdfa", "RDFa", "Another attribute-based structured data format, similar to microdata. Less common today.", /\bRDFa\b/),
  E("rich", "Rich result", "A Google result with extras such as stars, price, breadcrumbs or a video thumbnail. Valid structured data makes a page eligible; Google decides when to show them.", /\brich results?\b/i),
  E("schemaorg", "schema.org", "The shared vocabulary of types (Product, Article) and properties (name, price) that Google, Bing and others read.", /\bschema\.org\b/),
  E("type", "@type", "Says what a thing is, for example Product, Organization or BreadcrumbList.", /@type\b/),
  E("id", "@id", "A unique name for a thing, so other parts of the markup can point to it instead of repeating it.", /@id\b/),
  E("context", "@context", "Tells search engines the markup uses schema.org. Usually \"https://schema.org\".", /@context\b/),
  E("graph", "@graph", "A list that holds several connected items in one JSON-LD block, as Yoast and Rank Math output.", /@graph\b/),
  E("property", "Property", "One piece of information about an item, such as name, price or image.", /\bpropert(y|ies)\b/i),
  E("required", "Required field", "A property Google needs before it can show a rich result. Without it the page isn't eligible.", /\brequired\b/i),
  E("recommended", "Recommended field", "A property that isn't needed, but gives Google more to show and can make the result better.", /\brecommended\b/i),
  E("enum", "Enumeration value", "A fixed value from schema.org's list, written as a URL, such as https://schema.org/InStock.", /\benumeration\b/i),
  E("server", "Server HTML", "The HTML the website sends before any JavaScript runs. Every crawler can read it, so it's the safest place for structured data.", /\bserver HTML\b/i),
  E("csr", "Client-side rendering", "When JavaScript in the browser builds the page. Content that only appears this way can be missed or picked up late by crawlers.", /\bclient-side render(ing|ed)?\b|\bCSR\b/i),
  E("gtm", "Google Tag Manager", "A tool for adding scripts to a site without editing its code. Structured data added through it only exists after it runs in the browser.", /\bGoogle Tag Manager\b|\bGTM\b|\bTag Manager\b/),
  E("eligible", "Eligible", "The markup meets Google's rules for that rich result. Google still decides whether to show it.", /\beligible\b/i),
  E("aggregate", "aggregateRating", "The average star rating and number of reviews. It's what produces review stars in Google.", /\baggregateRating\b/),
  E("offers", "offers", "Where a product's price, currency and availability go, inside an Offer.", /\boffers\b/),
];
