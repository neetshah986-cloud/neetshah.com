import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { Byline, LinkedInLink } from "@/components/Person";
import { SchemaTool } from "@/components/schema/SchemaTool";
import { VOCAB_VERSION } from "@/lib/schema/vocab";
import { person, personJsonLd, site } from "@/lib/site";

const UPDATED = "2026-11-21T22:30:00+05:30";
const URL = `${site.url}/tools/schema-validator`;

export const metadata: Metadata = {
  title: { absolute: "Schema Validator: Free Schema Markup & Rich Results Checker" },
  description:
    "Free schema validator for JSON-LD, Microdata and RDFa. Checks schema.org and Google rules, visible content, and whether markup sits in HTML, JavaScript or GTM.",
  alternates: { canonical: "/tools/schema-validator" },
  openGraph: {
    title: "Schema Validator: the checks other validators miss",
    description: "Validate structured data against schema.org and Google, and see whether it's in the server HTML, JavaScript or Tag Manager.",
    url: URL,
  },
};

// ---------- Small visual examples ----------

function Tick({ tone = "pass" }: { tone?: "pass" | "warn" | "fail" | "note" }) {
  const color = tone === "pass" ? "text-pass" : tone === "warn" ? "text-warn" : tone === "fail" ? "text-fail" : "text-serp";
  return (
    <svg viewBox="0 0 20 20" className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.14" />
      {tone === "pass" ? (
        <path d="M6 10.4l2.6 2.6L14 7.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M10 5.8v5.2M10 14h.01" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      )}
    </svg>
  );
}

function Panel({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <figure className="rounded-xl border border-rule bg-white p-5 text-[0.93rem] shadow-[0_1px_0_#D9E0EA,0_20px_40px_-30px_rgba(14,26,43,0.35)]">
      {children}
      <figcaption className="mt-4 border-t border-dashed border-rule pt-3 text-xs text-ink-soft">{label}</figcaption>
    </figure>
  );
}

const RenderingExample = () => (
  <Panel label="Rendering check, shown at the top of every result">
    <ul className="space-y-3">
      <li className="flex gap-2.5"><Tick /> <span><b className="font-medium">Structured data is in the server HTML</b><br /><span className="text-ink-soft">Readable without running JavaScript.</span></span></li>
      <li className="flex gap-2.5"><Tick /> <span><b className="font-medium">No structured data in Google Tag Manager</b><br /><span className="text-ink-soft">Containers GTM-XXXXXX opened and checked.</span></span></li>
      <li className="flex gap-2.5"><Tick tone="warn" /> <span><b className="font-medium">11 values only appear after JavaScript runs</b><br /><span className="text-ink-soft">The FAQ section is client-side rendered.</span></span></li>
    </ul>
  </Panel>
);

const ContentExample = () => (
  <Panel label="Content match: three states, not just found or missing">
    <ul className="divide-y divide-rule">
      {[
        { tone: "pass" as const, p: "Product.name", v: "Trail Runner Pro", s: "On the page", c: "text-pass" },
        { tone: "note" as const, p: "FAQPage.mainEntity.name", v: "How long does a claim take?", s: "Only after JavaScript", c: "text-serp" },
        { tone: "warn" as const, p: "aggregateRating.reviewCount", v: "355", s: "Not in the page HTML", c: "text-warn" },
      ].map((r) => (
        <li key={r.p} className="grid grid-cols-[auto_1fr] gap-x-2.5 py-2.5">
          <Tick tone={r.tone} />
          <span className="min-w-0">
            <span className="block break-all font-mono text-[0.8rem] text-ink-soft">{r.p}</span>
            <span className="block">{r.v}</span>
            <span className={`block text-sm ${r.c}`}>{r.s}</span>
          </span>
        </li>
      ))}
    </ul>
  </Panel>
);

const GarbledExample = () => (
  <Panel label="Garbled text check, with the repaired text">
    <p className="text-sm text-ink-soft">In the markup</p>
    <p className="mt-1 rounded-md bg-fail/10 px-3 py-2 font-mono text-[0.85rem] text-fail">Claims are the â€˜moment of truthâ€™</p>
    <p className="mt-3 text-sm text-ink-soft">What it should say</p>
    <p className="mt-1 rounded-md bg-pass/10 px-3 py-2 font-mono text-[0.85rem] text-pass">Claims are the ‘moment of truth’</p>
  </Panel>
);

const SourceExample = () => (
  <Panel label="Select a property and the source jumps to its line">
    <div className="overflow-hidden rounded-lg border border-rule font-mono text-[12.5px] leading-[22px]">
      {[
        [14, '"offers": {', false],
        [15, '  "@type": "Offer",', false],
        [16, '  "price": "₹1,299",', "dot"],
        [17, '  "priceCurrency": "₹",', "focus"],
        [18, '  "availability": "In stock"', "dot"],
      ].map(([n, code, state]) => (
        <div key={n as number} className={`flex ${state === "focus" ? "bg-serp/15" : "bg-serp/[0.04]"}`}>
          <span className={`flex w-12 shrink-0 items-center justify-end gap-1.5 border-r pr-2 ${state === "focus" ? "border-serp text-ink" : "border-rule text-ink-soft/70"}`}>
            {state && <span className="h-1.5 w-1.5 rounded-full bg-fail" />}
            {n}
          </span>
          <span className="truncate whitespace-pre pl-3">{code}</span>
        </div>
      ))}
    </div>
  </Panel>
);

const CompareExample = () => (
  <Panel label="Rich results side by side, one keyword">
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-ink-soft">
          <th className="pb-1.5 font-medium">Feature</th>
          <th className="pb-1.5 text-center font-medium">You</th>
          <th className="pb-1.5 text-center font-medium">Rival A</th>
          <th className="pb-1.5 text-center font-medium">Rival B</th>
        </tr>
      </thead>
      <tbody>
        {[
          ["Review stars", "–", "✓", "✓"],
          ["Price and stock", "✓", "✓", "✓"],
          ["Breadcrumb", "–", "✓", "–"],
          ["Merchant listing", "✗", "✓", "✓"],
        ].map(([f, ...c]) => (
          <tr key={f} className="border-t border-rule">
            <td className="py-1.5 font-medium">{f}</td>
            {c.map((x, i) => (
              <td key={i} className={`py-1.5 text-center font-semibold ${x === "✓" ? "text-pass" : x === "✗" ? "text-fail" : "text-ink-soft"}`}>
                {x}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    <p className="mt-3 text-sm">2 of 2 competitors can show review stars; you can&apos;t. <span className="text-serp">Get the code</span></p>
  </Panel>
);

const GscExample = () => (
  <Panel label="Search Console: Missing field “price” (in “offers”)">
    <p className="text-sm font-medium">9 of 10 example pages still have the issue.</p>
    <p className="mt-1 text-sm text-ink-soft">offers.price is missing on 9 of 10: fix it once in the product template.</p>
    <pre className="mt-3 overflow-x-auto rounded border border-rule bg-white py-2 font-mono text-[0.75rem] leading-relaxed">
      <span className="block px-3">{`"offers": {`}</span>
      <span className="block px-3">{`  "priceCurrency": "INR",`}</span>
      <span className="block bg-pass/10 px-3">{`+ "price": "PRICE e.g. 1499.00"`}</span>
      <span className="block px-3">{`}`}</span>
    </pre>
  </Panel>
);

const GoogleExample = () => (
  <Panel label="Google features, judged by 2026 rules">
    <ul className="space-y-2.5">
      {[
        ["Product snippet", "Eligible", "bg-pass/10 text-pass"],
        ["Merchant listing", "Missing required fields", "bg-fail/10 text-fail"],
        ["Article", "Eligible, can be improved", "bg-warn/10 text-warn"],
        ["FAQ", "No longer shown by Google", "bg-mist text-ink-soft"],
      ].map(([f, s, c]) => (
        <li key={f} className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium">{f}</span>
          <span className={`rounded-md px-2 py-0.5 text-sm font-medium ${c}`}>{s}</span>
        </li>
      ))}
    </ul>
  </Panel>
);

const GraphExample = () => (
  <Panel label="Entity graph: how @id references connect">
    <p className="font-semibold">Article</p>
    <ul className="mt-2 space-y-1.5">
      <li className="flex flex-wrap gap-x-2"><span className="font-mono text-[0.8rem] text-ink-soft">publisher</span><span aria-hidden="true" className="text-ink-soft">→</span>Organization</li>
      <li className="flex flex-wrap gap-x-2"><span className="font-mono text-[0.8rem] text-ink-soft">author</span><span aria-hidden="true" className="text-ink-soft">→</span>Person</li>
      <li className="flex flex-wrap gap-x-2"><span className="font-mono text-[0.8rem] text-ink-soft">image</span><span aria-hidden="true" className="text-ink-soft">→</span><span className="text-warn">Not defined on this page</span></li>
    </ul>
  </Panel>
);

const FormatsExample = () => (
  <Panel label="Value formats Google can't read, with the fix">
    <dl className="divide-y divide-rule">
      {[
        ["price", "₹1,299", "1299"],
        ["priceCurrency", "₹", "INR"],
        ["datePublished", "20/11/2026", "2026-11-20"],
        ["availability", "In stock", "https://schema.org/InStock"],
        ["duration", "1 hour", "PT1H"],
      ].map(([p, bad, good]) => (
        <div key={p} className="grid grid-cols-[7.5rem_1fr] gap-x-3 py-2">
          <dt className="font-mono text-[0.8rem] text-ink-soft">{p}</dt>
          <dd className="min-w-0 font-mono text-[0.8rem]">
            <span className="text-fail line-through decoration-fail/40">{bad}</span>
            <span aria-hidden="true" className="px-1.5 text-ink-soft">→</span>
            <span className="break-all text-pass">{good}</span>
          </dd>
        </div>
      ))}
    </dl>
  </Panel>
);

const ReportExample = () => (
  <Panel label="Copy report for a developer">
    <pre className="overflow-hidden whitespace-pre-wrap font-mono text-[0.78rem] leading-relaxed text-ink-soft">{`Structured data report: example.com/product
3 errors, 2 warnings, 1 note

RENDERING (SSR vs CSR)
- 5 values only appear after JavaScript runs…

ERRORS
- [Offer.priceCurrency] "₹" isn't a 3-letter
  ISO 4217 code. Use "INR".`}</pre>
  </Panel>
);

const ArchiveExample = () => (
  <Panel label="When a site blocks the check">
    <p className="font-medium">Checked the Internet Archive&apos;s copy from 7 August 2026</p>
    <p className="mt-1 text-ink-soft">The site didn&apos;t respond, so the latest archived copy of the page was validated instead.</p>
    <p className="mt-3 border-t border-rule pt-3 font-medium">To check the live page instead</p>
    <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-ink-soft">
      <li>Open the page and press <kbd className="rounded border border-rule px-1 font-mono text-[0.8em] text-ink">Ctrl</kbd> + <kbd className="rounded border border-rule px-1 font-mono text-[0.8em] text-ink">U</kbd></li>
      <li>Copy the whole source</li>
      <li>Paste it into Paste code</li>
    </ol>
  </Panel>
);

// ---------- Content ----------

const features = [
  {
    id: "rendering",
    title: "See where your schema actually lives: server HTML, JavaScript or Tag Manager",
    body: [
      "Most validators tell you whether markup is valid. This one also tells you whether search engines can rely on it. Every result opens with a rendering check that shows whether your structured data is in the HTML your server sends, written into the page by JavaScript, or deployed through Google Tag Manager.",
      "It goes further for Tag Manager: GTM containers are public, so the validator opens each one on the page and looks for Custom HTML tags that add JSON-LD, then names the schema types they add. You get a definite answer instead of a guess. The best practice is simple: structured data, and the content it describes, belong in server-rendered HTML.",
    ],
    Example: RenderingExample,
  },
  {
    id: "content-match",
    title: "Catch schema markup that doesn't match what visitors see",
    body: [
      "Google's structured data guidelines require markup to describe content that is visible on the page. A review count, a price or an FAQ that exists only in JSON-LD can make a page ineligible for rich results, or be treated as spammy markup.",
      "The validator compares names, headlines, prices, ratings, review counts, addresses and FAQ answers with the page text, and tells three cases apart: on the page, rendered only by JavaScript (client-side rendering), or not in the page HTML at all. That's the difference between a technical fix and a content fix.",
    ],
    Example: ContentExample,
  },
  {
    id: "encoding",
    title: "Spot garbled characters before Google shows them",
    body: [
      "When UTF-8 text is saved or served with the wrong character set, apostrophes and accented letters turn into sequences like â€™ and Ã©. Search results and AI answers then quote the garbled text.",
      "This check flags those values, shows you exactly where they are, and works out what the text was meant to say, so you can confirm the fix in seconds. It catches errors that both validator.schema.org and Google's Rich Results Test pass without comment.",
    ],
    Example: GarbledExample,
  },
  {
    id: "source",
    title: "Jump from any error to its exact line in the source",
    body: [
      "The page source sits next to the results, with every line that has an error or warning marked in the margin. Open an item to shade its whole block; select a property to jump straight to its line, even on pages with tens of thousands of lines.",
      "Items are listed by name, so five HowTo items read as five different guides rather than five identical rows, and nested objects such as Offer, AggregateRating or PostalAddress keep their own issues inline.",
    ],
    Example: SourceExample,
  },
  {
    id: "compare",
    title: "Compare your structured data with the pages ranking above you",
    body: [
      "Add your page and up to five competitors ranking for the same keyword. Each page is checked at once and shown side by side: product snippets, merchant listings, review stars, price and stock, shipping and returns, breadcrumbs, organization, video and every other Google feature found on any of the pages.",
      "Above the table, the gaps in plain words, such as \"2 of 3 competitors can show review stars; you can't\", each with the code to add: your existing markup with the missing fields filled in, or a starter block built for your page. Download the table as CSV for a client.",
    ],
    Example: CompareExample,
  },
  {
    id: "search-console",
    title: "Fix rich result issues from Search Console",
    body: [
      "Search Console lists issues like \"Missing field 'price'\" with example URLs, but not the fix. Export the issue and upload the ZIP: the tool reads the report and the field, checks every example page as it is now, and tells you which pages are already fixed so you know when to click Validate fix.",
      "For the pages that still have the issue, you get the page's own JSON-LD with the missing field added and highlighted. When the same field is missing on most pages, it says so: that's a template fix, done once in the theme, plugin or product template.",
    ],
    Example: GscExample,
  },
  {
    id: "rich-results",
    title: "Know which Google rich results you can actually get",
    body: [
      `Alongside every type and property in schema.org ${VOCAB_VERSION}, the validator checks the required and recommended fields for 19 Google Search features, including product snippets, merchant listings, reviews, articles, breadcrumbs, local business, events, recipes, video, job postings and profile pages.`,
      "It also keeps up with Google's retirements. FAQ rich results stopped appearing in May 2026, and how-to, course info, fact check, vehicle listing and practice problem results have all been phased out. The validator marks these clearly, so you don't spend time on markup that can't earn a rich result.",
    ],
    Example: GoogleExample,
  },
  {
    id: "graph",
    title: "Find broken links between entities",
    body: [
      "Well-built structured data is a graph: an Article points to its publisher, a WebPage to the organization behind it, a Product to its brand. The entity graph shows every @id reference on the page and flags the ones that point to something that isn't there.",
      "It also catches the same @id used for different types, the same entity marked up in two formats, and competing Organization or Article items that send search engines mixed signals.",
    ],
    Example: GraphExample,
  },
  {
    id: "formats",
    title: "Fix the value formats Google can't read",
    body: [
      "Plenty of markup passes a schema.org check and still fails in Google, because the values are in the wrong format. Prices with currency symbols or thousands separators, a ₹ sign instead of an ISO 4217 code, dates that aren't ISO 8601, durations written in words, ratings above bestRating and end dates before start dates are all flagged, each with the corrected value.",
    ],
    Example: FormatsExample,
  },
  {
    id: "blocked-sites",
    title: "Validate pages on sites that block automated checks",
    body: [
      "Many large sites, especially banks, insurers and marketplaces, block or stall requests from tools, so a validator often gets an error instead of the page. When that happens here, the validator checks the latest copy of the page saved by the Internet Archive and validates that instead, so you still get the full report.",
      "The result says clearly which copy was checked, its date and how old it is, with a link to the archived page. If you need the live version, the notice walks you through it: press Ctrl+U, copy the source and paste it into Paste code. One click takes you there.",
    ],
    Example: ArchiveExample,
  },
  {
    id: "report",
    title: "Hand developers a report they can act on",
    body: [
      "Copy every finding as plain text, grouped into rendering, errors, warnings, missing Google fields and content that isn't on the page, and paste it straight into a ticket. Download the full result as JSON, share a link that reruns the check for any URL, or read the JSON-LD formatted for humans.",
    ],
    Example: ReportExample,
  },
];

const comparison: { label: string; us: string; org: string; rrt: string }[] = [
  { label: "Checks the full schema.org vocabulary", us: "Yes", org: "Yes", rrt: "Only Google features" },
  { label: "Google rich result eligibility", us: "Yes", org: "No", rrt: "Yes" },
  { label: "Marks rich results Google has retired", us: "Yes", org: "No", rrt: "No" },
  { label: "Value formats: prices, currencies, dates, durations", us: "Yes", org: "No", rrt: "Some" },
  { label: "Compares markup with the visible page text", us: "Yes", org: "No", rrt: "No" },
  { label: "Shows whether markup is in server HTML, JavaScript or GTM", us: "Yes", org: "No", rrt: "No" },
  { label: "Opens GTM containers to find schema tags", us: "Yes", org: "No", rrt: "No" },
  { label: "Detects garbled text from encoding errors", us: "Yes", org: "No", rrt: "No" },
  { label: "Entity graph with broken @id references", us: "Yes", org: "No", rrt: "No" },
  { label: "Falls back to the latest archived copy when a site blocks the check", us: "Yes", org: "No", rrt: "No" },
  { label: "Compares rich results with up to 5 competitor pages", us: "Yes", org: "No", rrt: "No" },
  { label: "Reads Search Console rich result exports and writes the fixed JSON-LD", us: "Yes", org: "No", rrt: "No" },
];

const commonErrors = [
  { e: "“price” isn't a property of Product", fix: "Price belongs on the Offer inside offers, not on the Product itself." },
  { e: "“AcceptedAnswer” isn't a schema.org property", fix: "Property names are case-sensitive. It's acceptedAnswer, and with the wrong case no answer is read at all." },
  { e: "“Prodcut” isn't a schema.org type", fix: "Typos in type names are matched to the closest real type, with a “did you mean” suggestion." },
  { e: "JSON-LD block isn't valid JSON", fix: "Usually a trailing comma, curly quotes or a comment. The whole block is ignored until it's fixed, and the tool shows the line and the likely cause." },
  { e: "No @context", fix: "Without \"@context\": \"https://schema.org\", types and properties aren't recognised as schema.org." },
  { e: "“In stock” isn't a valid availability value", fix: "Enumerations need the schema.org value, for example https://schema.org/InStock." },
  { e: "@id points to something that isn't on the page", fix: "Search engines don't follow @id references across pages. Define the entity on the page, or fix the typo." },
  { e: "Values in the markup aren't on the page", fix: "A review count, address or FAQ that visitors can't see goes against Google's guidelines." },
];

const steps = [
  { t: "Enter a URL or paste code", d: "Validate a live page by URL, or paste JSON-LD, a script tag or a full HTML page. Pasting the rendered HTML from your browser's DevTools lets you check JavaScript-rendered content too." },
  { t: "Read the rendering check", d: "See straight away whether your structured data and the content it describes are in the server HTML, rendered by JavaScript or added through Tag Manager." },
  { t: "Work through the items", d: "Choose a type, then an item. Each property shows its issues inline, and selecting it highlights the exact line in the source." },
  { t: "Check Google features and content match", d: "Confirm which rich results the page is eligible for, what's missing, and whether every value in the markup is visible to users." },
  { t: "Send the fixes", d: "Copy the developer report into a ticket, or share a link that reruns the check after the fix is live." },
];

const faqs = [
  {
    q: "What is a schema validator?",
    a: "A schema validator checks structured data, the JSON-LD, Microdata or RDFa that describes a page to search engines, against the schema.org vocabulary. It finds types and properties that don't exist, values of the wrong kind and syntax errors that stop search engines reading the markup. This one also checks Google's rich result rules and the page itself.",
  },
  {
    q: "How is this different from Google's Rich Results Test?",
    a: "The Rich Results Test only checks the features Google supports and hides schema.org errors that don't affect them. This tool checks the full schema.org vocabulary, as validator.schema.org does, adds Google's requirements on top, and then checks things neither tool covers: whether the markup matches the visible page, whether it's in the server HTML, JavaScript or Tag Manager, and whether the text is garbled by an encoding error.",
  },
  {
    q: "How is it different from validator.schema.org?",
    a: "validator.schema.org checks markup against the vocabulary, which this tool does too, using schema.org " + VOCAB_VERSION + ". On top of that you get Google rich result eligibility with 2026 retirements, value format checks, visible content matching, the rendering and Tag Manager check, garbled text detection, an entity graph and a developer report.",
  },
  {
    q: "Does it run JavaScript on the page?",
    a: "No, and that's deliberate. It reads the raw HTML your server sends, which is what crawlers receive first and what many AI crawlers rely on entirely. Instead of hiding the difference, it tells you which parts of your markup and content depend on JavaScript. To check a JavaScript-rendered page, paste its rendered HTML from your browser's DevTools.",
  },
  {
    q: "Can it check structured data added through Google Tag Manager?",
    a: "Yes. When a page loads Tag Manager, the validator opens each GTM container and looks for Custom HTML tags that write JSON-LD, then lists the schema types they add. It doesn't validate those tags' contents, because they only exist after GTM runs in the browser, which is also why moving them into the page template is the better setup.",
  },
  {
    q: "Why does it say my FAQ markup won't show in Google?",
    a: "Google stopped showing FAQ rich results on 7 May 2026, after limiting them to government and health sites in 2023. FAQPage is still valid schema.org and can help search engines and AI systems understand the page, so there's no need to remove it, but it won't produce a rich result.",
  },
  {
    q: "What happens if a website blocks the validator?",
    a: "Some sites block or stall automated requests. When that happens, the validator checks the latest copy of the page saved by the Internet Archive and tells you its date and age. To check the live page, open it, press Ctrl+U (Cmd+Option+U on a Mac), copy the source and paste it into Paste code.",
  },
  {
    q: "Does valid markup guarantee rich results?",
    a: "No. Valid, eligible markup is the requirement, not a guarantee. Google decides whether to show a rich result based on the query, the page's quality and its own policies.",
  },
  {
    q: "Is it free, and are my results stored?",
    a: "It's free and needs no account. The page you enter is fetched once to run the check, and the results aren't saved. Search Console exports are read in your browser and never uploaded.",
  },
  {
    q: "How do I compare my schema markup with competitors?",
    a: "Open the Compare with competitors tab, add your page and up to five pages ranking for the same keyword, and run it. You'll see which rich results each page can show, which ones you're missing, and the code to add. Compare similar pages: your product page against theirs.",
  },
  {
    q: "How do I fix a rich result issue in Search Console?",
    a: "In Search Console, open the rich result report (for example Product snippets), click the issue, export it as CSV and upload the ZIP in the Search Console tab. The tool checks each example page, shows which are already fixed, and gives the JSON-LD with the missing field added. After the fix is live, click Validate fix in Search Console.",
  },
];

const breadcrumb = [
  { name: "Home", path: "/" },
  { name: "Tools", path: "/tools" },
  { name: "Schema Validator", path: "/tools/schema-validator" },
];

const cell = (v: string) =>
  v === "Yes" ? (
    <span className="inline-flex items-center gap-1.5 font-medium text-pass"><Tick /> Yes</span>
  ) : v === "No" ? (
    <span className="text-ink-soft">No</span>
  ) : (
    <span className="text-ink-soft">{v}</span>
  );

export default function SchemaValidatorPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "WebSite", "@id": `${site.url}/#website`, name: site.name, alternateName: site.hub, url: site.url, publisher: { "@id": person.id } },
            personJsonLd,
            {
              "@type": "WebPage",
              "@id": URL,
              url: URL,
              name: "Schema Validator: Free Schema Markup & Rich Results Checker",
              description: metadata.description,
              inLanguage: "en",
              datePublished: "2026-11-20T00:00:00+05:30",
              dateModified: UPDATED,
              isPartOf: { "@id": `${site.url}/#website` },
              about: { "@id": `${URL}#app` },
              mainEntity: { "@id": `${URL}#app` },
              author: { "@id": person.id },
              publisher: { "@id": person.id },
              breadcrumb: { "@id": `${URL}#breadcrumb` },
              hasPart: [{ "@id": `${URL}#faq` }, { "@id": `${URL}#howto` }],
            },
            {
              "@type": "BreadcrumbList",
              "@id": `${URL}#breadcrumb`,
              itemListElement: breadcrumb.map((b, i) => ({ "@type": "ListItem", position: i + 1, name: b.name, item: `${site.url}${b.path === "/" ? "" : b.path}` })),
            },
            {
              "@type": "WebApplication",
              "@id": `${URL}#app`,
              name: "Schema Validator",
              alternateName: "Schema Markup Validator",
              url: URL,
              description: metadata.description,
              applicationCategory: "DeveloperApplication",
              applicationSubCategory: "SEO tool",
              operatingSystem: "Any",
              browserRequirements: "Requires JavaScript",
              inLanguage: "en",
              isAccessibleForFree: true,
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
              featureList: features.map((f) => f.title),
              softwareVersion: `schema.org ${VOCAB_VERSION}`,
              dateModified: UPDATED,
              creator: { "@id": person.id },
              publisher: { "@id": person.id },
            },
            {
              "@type": "HowTo",
              "@id": `${URL}#howto`,
              name: "How to validate schema markup",
              description: "Check a page's structured data against schema.org and Google's rules, and find what needs fixing.",
              tool: { "@type": "HowToTool", name: "Schema Validator" },
              totalTime: "PT2M",
              step: steps.map((st, i) => ({ "@type": "HowToStep", position: i + 1, name: st.t, text: st.d, url: `${URL}#howto-step-${i + 1}` })),
            },
            {
              "@type": "FAQPage",
              "@id": `${URL}#faq`,
              name: "FAQs on Schema Validator",
              mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            },
          ],
        }}
      />

      <section className="container-x pt-12 sm:pt-16">
        <nav aria-label="Breadcrumb" className="text-sm text-ink-soft">
          <ol className="flex flex-wrap items-center gap-2">
            {breadcrumb.map((b, i) => (
              <li key={b.name} className="flex items-center gap-2">
                {i > 0 && <span aria-hidden="true">›</span>}
                {i < breadcrumb.length - 1 ? (
                  <Link href={b.path} className="hover:text-ink">{b.name}</Link>
                ) : (
                  <span aria-current="page" className="text-ink">{b.name}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <h1 className="display mt-8 text-5xl sm:text-6xl">Schema Validator</h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-ink-soft sm:text-xl">
          Validate structured data against all of schema.org and Google&apos;s rich result rules, then see what other validators don&apos;t show: whether your markup is in the server HTML, rendered by JavaScript or added through Tag Manager, and whether it matches what visitors actually see.
        </p>
        <ul className="mt-6 flex flex-wrap gap-2 text-sm">
          {[`schema.org ${VOCAB_VERSION}: 939 types, 1,538 properties`, "19 Google rich result features", "JSON-LD, Microdata and RDFa", "Free, no sign-up"].map((t) => (
            <li key={t} className="rounded-md border border-rule bg-white px-2.5 py-1 text-ink-soft">{t}</li>
          ))}
        </ul>
        <div className="mt-10">
          <SchemaTool />
        </div>
      </section>

      <section aria-labelledby="features-heading" className="container-x mt-32">
        <div className="max-w-3xl">
          <h2 id="features-heading" className="text-3xl font-semibold tracking-tight sm:text-5xl">The checks other schema validators miss</h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-soft">
            A schema.org check tells you whether markup is valid. Search engines also care whether they can reach it, whether it&apos;s true to the page, and whether it earns anything in Google. This tool answers all four in a single pass.
          </p>
        </div>
        <div className="mt-16 space-y-20 sm:space-y-24">
          {features.map(({ id, title, body, Example }, k) => (
            <article key={id} id={id} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
              <div className={k % 2 ? "lg:order-2" : ""}>
                <h3 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{title}</h3>
                {body.map((p) => (
                  <p key={p.slice(0, 20)} className="mt-4 max-w-xl leading-relaxed text-ink-soft">{p}</p>
                ))}
              </div>
              <div className={`max-w-lg ${k % 2 ? "lg:order-1" : "lg:justify-self-end"} w-full`}>
                <Example />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="compare-heading" className="container-x mt-32">
        <h2 id="compare-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">How it compares</h2>
        <p className="mt-4 max-w-3xl leading-relaxed text-ink-soft">
          validator.schema.org and Google&apos;s Rich Results Test are both excellent at what they do. This validator covers what each of them checks, and adds the questions they leave open.
        </p>
        <div className="mt-8 overflow-x-auto rounded-xl border border-rule bg-white">
          <table className="w-full min-w-[40rem] text-left text-[0.95rem]">
            <thead className="border-b border-rule bg-mist/60 text-sm">
              <tr>
                <th scope="col" className="px-5 py-3.5 font-semibold">Check</th>
                <th scope="col" className="px-5 py-3.5 font-semibold">This validator</th>
                <th scope="col" className="px-5 py-3.5 font-semibold">validator.schema.org</th>
                <th scope="col" className="px-5 py-3.5 font-semibold">Rich Results Test</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {comparison.map((r) => (
                <tr key={r.label}>
                  <th scope="row" className="px-5 py-3.5 font-normal">{r.label}</th>
                  <td className="px-5 py-3.5">{cell(r.us)}</td>
                  <td className="px-5 py-3.5">{cell(r.org)}</td>
                  <td className="px-5 py-3.5">{cell(r.rrt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-ink-soft">Compared in November 2026. Google&apos;s Rich Results Test renders JavaScript; this tool reads the server HTML by design and reports what depends on JavaScript.</p>
      </section>

      <section aria-labelledby="errors-heading" className="container-x mt-32 grid gap-10 lg:grid-cols-[1fr_1.7fr] lg:gap-16">
        <div>
          <h2 id="errors-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">Common schema errors it finds</h2>
          <p className="mt-4 max-w-sm leading-relaxed text-ink-soft">The mistakes that come up again and again in real audits, from global e-commerce sites to Indian insurers, and what each one means.</p>
        </div>
        <dl className="divide-y divide-rule border-y border-rule">
          {commonErrors.map((c) => (
            <div key={c.e} className="grid gap-1 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] sm:gap-6">
              <dt className="font-medium">{c.e}</dt>
              <dd className="leading-relaxed text-ink-soft">{c.fix}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="howto" aria-labelledby="howto-heading" className="container-x mt-32">
        <h2 id="howto-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">How to validate schema markup</h2>
        <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-5 lg:gap-6">
          {steps.map((s, i) => (
            <li key={s.t} id={`howto-step-${i + 1}`} className="border-t-2 border-ink pt-4">
              <span className="font-mono text-sm text-ink-soft">Step {i + 1}</span>
              <h3 className="mt-1 text-lg font-semibold tracking-tight">{s.t}</h3>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-soft">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="faq" aria-labelledby="faq-heading" className="container-x mt-32">
        <h2 id="faq-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">FAQs on Schema Validator</h2>
        <div className="mt-8 max-w-3xl divide-y divide-rule border-y border-rule">
          {faqs.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold tracking-tight">
                {f.q}
                <span aria-hidden="true" className="text-ink-soft transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 leading-relaxed text-ink-soft">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section aria-label="About the author" className="container-x mt-24">
        <div className="flex max-w-3xl flex-col gap-5 rounded-xl border border-rule bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Byline />
            <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-soft">
              Built from the checks I run in real technical SEO audits. Updated{" "}
              <time dateTime={UPDATED}>20 November 2026</time>, with Google&apos;s structured data rules current to that date.
            </p>
          </div>
          <LinkedInLink className="shrink-0" />
        </div>
      </section>
    </>
  );
}
