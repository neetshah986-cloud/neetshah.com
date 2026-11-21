import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { Byline, LinkedInLink } from "@/components/Person";
import { SpeedTool } from "@/components/speed/SpeedTool";
import { ScoreCalculator } from "@/components/speed/ScoreCalculator";
import { person, personJsonLd, site } from "@/lib/site";

const UPDATED = "2026-11-21T19:00:00+05:30";
const URL = `${site.url}/tools/page-speed-test`;
const TITLE = "Page Speed Test: Core Web Vitals Checker With Fixes";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description:
    "Free page speed test using Google's Lighthouse and real Chrome data. Finds the root cause of slow LCP, INP and CLS, shows the element and gives the fixed code.",
  alternates: { canonical: "/tools/page-speed-test" },
  openGraph: {
    title: "Page Speed Test: the cause, the element and the fix",
    description: "Core Web Vitals for mobile and desktop, with the root cause of each slow metric and ready-to-paste code for your developer.",
    url: URL,
  },
};

// ---------- small visual examples ----------

function Panel({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <figure className="rounded-xl border border-rule bg-white p-5 text-[0.93rem] shadow-[0_1px_0_#D9E0EA,0_20px_40px_-30px_rgba(14,26,43,0.35)]">
      {children}
      <figcaption className="mt-4 border-t border-dashed border-rule pt-3 text-xs text-ink-soft">{label}</figcaption>
    </figure>
  );
}

const PhasesExample = () => (
  <Panel label="LCP broken into its four parts, with the main cause marked">
    <p className="font-semibold leading-snug">The browser starts downloading the main image too late, because it has loading=&quot;lazy&quot;.</p>
    <div className="mt-4 flex h-3 overflow-hidden rounded-full" aria-hidden="true">
      <span className="bg-ink/25" style={{ width: "22%" }} />
      <span className="bg-fail" style={{ width: "61%" }} />
      <span className="bg-ink/15" style={{ width: "9%" }} />
      <span className="bg-ink/35" style={{ width: "8%" }} />
    </div>
    <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">
      <li className="rounded-md bg-mist/70 px-2.5 py-1.5">22% waiting for the server</li>
      <li className="rounded-md bg-fail/[0.08] px-2.5 py-1.5 font-semibold text-fail">61% waiting to start the download</li>
      <li className="rounded-md bg-mist/70 px-2.5 py-1.5">9% downloading the image</li>
      <li className="rounded-md bg-mist/70 px-2.5 py-1.5">8% waiting to be shown</li>
    </ul>
  </Panel>
);

const FixExample = () => (
  <Panel label="The element's own HTML, and the same element fixed">
    <p className="text-xs font-medium text-fail">Current code</p>
    <pre className="mt-1 whitespace-pre-wrap break-all rounded-md bg-fail/[0.06] px-3 py-2 font-mono text-[0.78rem] leading-relaxed">
      {'<img class="hero" src="/sale.jpg" '}
      <mark className="rounded-sm bg-fail/15 text-fail line-through">loading=&quot;lazy&quot;</mark>
      {' alt="Summer sale">'}
    </pre>
    <p className="mt-3 text-xs font-medium text-pass">Fixed code</p>
    <pre className="mt-1 whitespace-pre-wrap break-all rounded-md bg-pass/[0.07] px-3 py-2 font-mono text-[0.78rem] leading-relaxed">
      {'<img class="hero" src="/sale.jpg" alt="Summer sale" '}
      <mark className="rounded-sm bg-pass/15 text-pass">width=&quot;1600&quot; height=&quot;900&quot; fetchpriority=&quot;high&quot;</mark>
      {">"}
    </pre>
  </Panel>
);

const SnapshotExample = () => (
  <Panel label="Every problem element shown on a snapshot of the page">
    <div className="relative overflow-hidden rounded-lg border border-rule bg-mist" aria-hidden="true">
      <div className="h-6 bg-ink" />
      <div className="space-y-2 p-3">
        <div className="relative h-24 rounded bg-gradient-to-br from-serp/30 to-serp/10">
          <span className="absolute -inset-1 rounded outline outline-2 outline-fail" />
        </div>
        <div className="h-3 w-3/4 rounded bg-ink/20" />
        <div className="h-3 w-1/2 rounded bg-ink/15" />
      </div>
    </div>
    <p className="mt-3 break-all font-mono text-[0.78rem] text-ink-soft">body &gt; main &gt; section.hero &gt; img</p>
  </Panel>
);

const ClsExample = () => (
  <Panel label="Layout shifts: what moved, and what pushed it">
    <ul className="divide-y divide-rule">
      {[
        ["div.product-grid", "Unsized image element", "0.182"],
        ["footer", "Web font", "0.041"],
        ["main > p", "Injected iframe", "0.027"],
      ].map(([el, cause, score]) => (
        <li key={el} className="flex items-baseline justify-between gap-3 py-2 text-sm">
          <span className="font-mono text-[0.8rem]">{el}</span>
          <span className="text-ink-soft">
            {cause} <b className="ml-1 font-medium text-ink">{score}</b>
          </span>
        </li>
      ))}
    </ul>
  </Panel>
);

const ScriptsExample = () => (
  <Panel label="Scripts that keep the page from responding">
    <ul className="divide-y divide-rule text-sm">
      {[
        ["/js/app.bundle.js", "1.4 s", false],
        ["googletagmanager.com/gtm.js", "620 ms", true],
        ["chat-widget.example/loader.js", "410 ms", true],
      ].map(([u, ms, tp]) => (
        <li key={u as string} className="flex items-baseline justify-between gap-3 py-2">
          <span className="min-w-0 truncate font-mono text-[0.8rem]">
            {u}
            {tp && <span className="ml-2 rounded bg-mist px-1.5 py-0.5 font-sans text-[0.7rem] text-ink-soft">third party</span>}
          </span>
          <span className="shrink-0 font-medium">{ms}</span>
        </li>
      ))}
    </ul>
  </Panel>
);

const LeaderboardExample = () => (
  <Panel label="Speed leaderboard for one keyword, mobile">
    <ol className="space-y-1.5 text-sm">
      {[
        ["1", "competitor-a.com", "Passed", "text-pass", "88"],
        ["2", "competitor-b.com", "Passed", "text-pass", "71"],
        ["3", "Your page", "Failed", "text-fail", "46"],
        ["4", "competitor-c.com", "Failed", "text-fail", "39"],
      ].map(([n, who, cwv, c, score]) => (
        <li key={n} className={`grid grid-cols-[1.25rem_minmax(0,1fr)_4rem_2rem] items-center gap-2 rounded px-2 py-1 ${who === "Your page" ? "bg-serp/[0.07] font-medium" : ""}`}>
          <span className="font-semibold">{n}</span>
          <span className="truncate">{who}</span>
          <span className={c}>{cwv}</span>
          <span className="text-right font-semibold">{score}</span>
        </li>
      ))}
    </ol>
    <p className="mt-3 text-sm text-ink-soft">What puts you behind the leader: real visitors see their main content 1.6 s sooner, and their main image starts downloading 1.1 s earlier.</p>
  </Panel>
);

const PageTypesExample = () => (
  <Panel label="Templates compared, slowest first">
    <ul className="divide-y divide-rule text-sm">
      {[
        ["Product pages", "LCP 4.9 s", "text-fail", "31"],
        ["Category pages", "LCP 3.2 s", "text-warn", "58"],
        ["Blog posts", "LCP 1.9 s", "text-pass", "92"],
      ].map(([t, lcp, c, s]) => (
        <li key={t} className="flex items-center justify-between gap-3 py-2">
          <span className="font-medium">{t}</span>
          <span className="flex items-center gap-4">
            <span className={c}>{lcp}</span>
            <span className="w-6 text-right font-semibold">{s}</span>
          </span>
        </li>
      ))}
    </ul>
    <p className="mt-2 rounded bg-mist/70 px-3 py-2 text-sm">Fix first: the product image carousel loads lazily. Found on 2 of 2 product pages tested.</p>
  </Panel>
);

const GscExample = () => (
  <Panel label="Search Console LCP issue, mobile">
    <ul className="space-y-2 text-sm">
      <li className="rounded border border-rule px-3 py-2">
        <span className="block text-ink-soft">Group of 1,240 similar URLs, LCP 3.4 s</span>
        <span className="block font-medium">Cause: the main image starts downloading late (loading=&quot;lazy&quot;).</span>
      </li>
      <li className="rounded border border-rule px-3 py-2">
        <span className="block text-ink-soft">Group of 310 similar URLs, LCP 2.9 s</span>
        <span className="block font-medium">Cause: 4 render-blocking files hold back the paint.</span>
      </li>
    </ul>
    <p className="mt-2 text-sm text-ink-soft">Fixes that help several groups at once are listed first.</p>
  </Panel>
);

const CompetitorExample = () => (
  <Panel label="Your page against a competitor, mobile">
    <div className="grid grid-cols-2 gap-3 text-center">
      {[
        ["Your page", "48", "text-fail"],
        ["competitor.com", "86", "text-warn"],
      ].map(([who, n, c]) => (
        <div key={who} className="rounded-lg border border-rule p-3">
          <p className="truncate text-xs text-ink-soft">{who}</p>
          <p className={`mt-1 text-3xl font-semibold ${c}`}>{n}</p>
        </div>
      ))}
    </div>
    <p className="mt-3 text-sm font-medium">Why they&apos;re faster</p>
    <ul className="mt-1.5 space-y-1.5 text-sm text-ink-soft">
      <li>Their main image starts downloading 1.4 s sooner</li>
      <li>Third-party scripts block your page 900 ms longer</li>
      <li>Your server answers 600 ms slower</li>
    </ul>
  </Panel>
);

const FixCheckExample = () => (
  <Panel label="Did my fix work? Compared with your last test">
    <p className="text-sm font-medium text-pass">It worked: the score went from 52 to 78.</p>
    <ul className="mt-3 space-y-1.5 text-sm">
      {[
        ["LCP", "4.6 s", "2.4 s", "−2.2 s"],
        ["TBT", "740 ms", "310 ms", "−430 ms"],
        ["CLS", "0.04", "0.04", "Same"],
      ].map(([k, a, b, d]) => (
        <li key={k} className="flex items-center justify-between gap-3 rounded bg-mist/60 px-3 py-1.5">
          <span className="font-medium">{k}</span>
          <span className="whitespace-nowrap text-ink-soft">
            {a} to <span className="font-semibold text-ink">{b}</span>{" "}
            <span className={d === "Same" ? "" : "font-semibold text-pass"}>{d}</span>
          </span>
        </li>
      ))}
    </ul>
    <p className="mt-3 text-sm text-ink-soft">Fixed since then: 2. Still to fix: 3. New: 0.</p>
  </Panel>
);

const ThirdPartyExample = () => (
  <Panel label="Outside companies' code on the page">
    <ul className="space-y-2.5 text-sm">
      {[
        ["Chat widget", "Chat and support", 78, "+6 pts"],
        ["Google Tag Manager", "Tag manager", 55, "+4 pts"],
        ["Session recorder", "Analytics", 34, "+2 pts"],
      ].map(([n, c, w, g]) => (
        <li key={n as string}>
          <div className="flex items-baseline justify-between gap-3">
            <span>
              <span className="font-medium">{n}</span> <span className="text-xs text-ink-soft">{c}</span>
            </span>
            <span className="text-xs font-semibold text-pass">{g}</span>
          </div>
          <span className="mt-1 block h-2 overflow-hidden rounded-full bg-mist">
            <span className="block h-full rounded-full bg-serp" style={{ width: `${w}%` }} />
          </span>
        </li>
      ))}
    </ul>
  </Panel>
);

const FieldExample = () => (
  <Panel label="Real visitors and the lab test, side by side">
    <div className="grid grid-cols-2 gap-3">
      {[
        ["Real visitors, LCP", "3.1 s", "Needs improvement", "text-warn", 55],
        ["Lab test, LCP", "4.6 s", "Poor", "text-fail", 80],
      ].map(([t, v, r, c, pos]) => (
        <div key={t as string} className="rounded-lg border border-rule p-3">
          <p className="text-xs text-ink-soft">{t}</p>
          <p className={`mt-1 text-2xl font-semibold ${c}`}>{v}</p>
          <p className={`text-xs font-medium ${c}`}>{r}</p>
          <div className="relative mt-2 h-1.5">
            <div className="absolute inset-0 flex overflow-hidden rounded-full">
              <span className="bg-pass/70" style={{ width: "39%" }} />
              <span className="bg-warn/70" style={{ width: "24%" }} />
              <span className="flex-1 bg-fail/70" />
            </div>
            <span className="absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink" style={{ left: `${pos}%` }} />
          </div>
        </div>
      ))}
    </div>
  </Panel>
);

const CrawlerExample = () => (
  <Panel label="What a crawler gets without running JavaScript">
    <ul className="space-y-2.5 text-sm">
      <li><b className="font-medium text-pass">Server response: 420 ms.</b> <span className="text-ink-soft">Crawlers get the HTML quickly.</span></li>
      <li><b className="font-medium text-fail">38 words in the raw HTML.</b> <span className="text-ink-soft">The content is built by JavaScript, so most AI crawlers see an almost empty page.</span></li>
      <li><b className="font-medium text-pass">No redirects.</b> <span className="text-ink-soft">Crawlers reach the page directly.</span></li>
    </ul>
  </Panel>
);

const ReplayExample = () => (
  <Panel label="Page load replay, exportable as a video or GIF">
    <div className="grid grid-cols-[5.5rem_1fr] gap-4">
      <div className="relative h-40 overflow-hidden rounded-lg border border-rule bg-white" aria-hidden="true">
        <div className="h-4 bg-ink" />
        <div className="relative m-2 h-14 rounded bg-gradient-to-br from-serp/30 to-serp/10">
          <span className="absolute -inset-0.5 rounded outline outline-2 outline-serp" />
        </div>
        <div className="mx-2 h-2 w-3/4 rounded bg-ink/20" />
      </div>
      <div className="min-w-0 text-sm">
        <p className="text-3xl font-semibold tracking-tight">2.7 s</p>
        <p className="mt-1 text-pass">✓ First content 2.6 s</p>
        <p className="text-pass">✓ Main content (LCP) 2.7 s</p>
        <p className="text-ink-soft">○ Fully loaded 3.1 s</p>
        <p className="mt-2 rounded-md bg-mist px-2 py-1.5">Main content is visible. The remaining files are still loading.</p>
      </div>
    </div>
  </Panel>
);

const PlatformExample = () => (
  <Panel label="Steps for the platform the site is built on">
    <p className="inline-flex items-center gap-1.5 rounded-md bg-mist px-2.5 py-1 text-sm">
      <span className="text-ink-soft">Built with</span> <b className="font-medium">WordPress</b> <span className="text-ink-soft">+ WP Rocket, Elementor</span>
    </p>
    <div className="mt-3 rounded-lg border border-serp/30 bg-serp/[0.04] p-3">
      <p className="text-sm font-semibold text-serp">On your WordPress site (with WP Rocket)</p>
      <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-sm">
        <li>WP Rocket → Media → LazyLoad: add &quot;hero-banner.webp&quot; to &quot;Excluded images or iframes&quot;.</li>
        <li>Clear the cache and test again.</li>
      </ol>
    </div>
  </Panel>
);

const ReportExample = () => (
  <Panel label="Copy report for a developer">
    <pre className="overflow-hidden whitespace-pre-wrap font-mono text-[0.76rem] leading-relaxed text-ink-soft">{`1. Load the main image (LCP element) sooner
   [high impact; affects LCP]
   Element: section.hero > img
     Now:   <img src="/sale.jpg" loading="lazy">
     Fixed: <img src="/sale.jpg" fetchpriority="high">
   How to fix:
     1) Remove loading="lazy" from this element.`}</pre>
  </Panel>
);

// ---------- content ----------

const thresholdRows = [
  { m: "Largest Contentful Paint (LCP)", what: "Loading: when the main content appears", good: "2.5 s or less", ni: "2.5 s to 4 s", poor: "Over 4 s", core: true },
  { m: "Interaction to Next Paint (INP)", what: "Responsiveness: how fast the page reacts to taps, clicks and typing", good: "200 ms or less", ni: "200 ms to 500 ms", poor: "Over 500 ms", core: true },
  { m: "Cumulative Layout Shift (CLS)", what: "Visual stability: how much the layout jumps", good: "0.1 or less", ni: "0.1 to 0.25", poor: "Over 0.25", core: true },
  { m: "First Contentful Paint (FCP)", what: "When anything first appears", good: "1.8 s or less", ni: "1.8 s to 3 s", poor: "Over 3 s", core: false },
  { m: "Time to First Byte (TTFB)", what: "How fast the server starts responding", good: "0.8 s or less", ni: "0.8 s to 1.8 s", poor: "Over 1.8 s", core: false },
  { m: "Total Blocking Time (TBT, lab only)", what: "How long scripts block the page; the lab stand-in for INP", good: "200 ms or less", ni: "200 ms to 600 ms", poor: "Over 600 ms", core: false },
];

const features = [
  {
    id: "root-cause",
    title: "Find out why LCP is slow, not just that it's slow",
    body: [
      "Every LCP time is made of four parts: waiting for the server, waiting to start downloading the main image, downloading it, and waiting for it to be shown. The tool splits your LCP into those parts from Google's trace of the page load, marks the biggest one and tells you in a sentence what's causing it.",
      "That one sentence decides the fix. A slow server, a lazy-loaded hero image, a 3 MB photo and a render-blocking stylesheet all produce the same poor LCP, but each needs a completely different change.",
    ],
    Example: PhasesExample,
  },
  {
    id: "fixed-code",
    title: "Get the fixed code, ready to paste",
    body: [
      "For each problem element, the tool takes its actual HTML from the test and writes the corrected version: loading=\"lazy\" removed from the main image, fetchpriority added, width and height filled in from the image's real dimensions, srcset and sizes worked out from how big it's shown, defer added to the right scripts.",
      "Changes are highlighted, so a developer can see exactly what to edit, and a beginner can see exactly what was wrong.",
    ],
    Example: FixExample,
  },
  {
    id: "element",
    title: "See the exact element on a snapshot of the page",
    body: [
      "Lighthouse records where each element sits on the page. The tool crops Google's full-page screenshot around every element it reports and outlines it, next to its CSS selector, so there's no hunting through templates to find which image or banner is meant.",
    ],
    Example: SnapshotExample,
  },
  {
    id: "cls",
    title: "Trace layout shifts to what caused them",
    body: [
      "CLS numbers alone don't say what moved. For each shift, the tool shows the element that jumped and the cause Chrome recorded: an image without dimensions, a web font swapping in, an iframe or ad injected late. Then it gives the matching fix, from width and height attributes to reserved ad slots and size-matched fallback fonts.",
    ],
    Example: ClsExample,
  },
  {
    id: "inp",
    title: "Know which scripts block taps and clicks",
    body: [
      "Interaction to Next Paint suffers when JavaScript keeps the browser busy. The tool lists the scripts that use the most main-thread time, labels third parties, and separates your own code from tags you can remove or delay. It includes a ready-made snippet for loading non-essential scripts only after the visitor interacts.",
    ],
    Example: ScriptsExample,
  },
  {
    id: "leaderboard",
    title: "Rank your page against the pages above you in Google",
    body: [
      "Add your page and up to five competitors ranking for the same keyword, and every page is tested at once. They're ranked the way Google judges speed: pages that pass Core Web Vitals with real visitors first, then the lab score.",
      "The table shows each page's real-visitor LCP, INP and CLS, lab metrics, page weight and main weakness in a sentence. Above it, the reasons you're behind the leader, each with what to change. Sort by any column, compare any page head to head, and download the table as CSV for a client report.",
    ],
    Example: LeaderboardExample,
  },
  {
    id: "page-types",
    title: "Find which template is slow: home, category, product or blog",
    body: [
      "Enter a website and the tool reads its sitemap, groups the URLs by page type, and tests a couple of pages from each. Shopify, WordPress and SEO-plugin sitemaps are split by type already; for other sites the URL paths are used, and you can paste your own list.",
      "You get the templates side by side, slowest first, and for each one the fixes that appear on most of its pages. Those are template problems: one change in the theme or the code fixes them on every page of that type.",
    ],
    Example: PageTypesExample,
  },
  {
    id: "search-console",
    title: "Turn a Search Console Core Web Vitals issue into fixes",
    body: [
      "Search Console tells you which groups of URLs are poor, but not why. Export an issue (for example \"LCP issue: longer than 2.5 s\") and upload the ZIP. The tool reads the example URL of each group, with the group's value and size, and tests them, biggest groups first.",
      "For each group you get the real-visitor value now, the cause of that metric and the fixes for it, plus the fixes that help several groups at once. When a group's URL is already in the good range, it says so, so you know when to click Validate fix. The file is read in your browser and never uploaded.",
    ],
    Example: GscExample,
  },
  {
    id: "competitor",
    title: "Compare your page with a competitor's, and see why one is faster",
    body: [
      "Add a competitor's URL and both pages are tested on mobile and desktop at once. You get a head-to-head table of real-visitor Core Web Vitals, lab metrics, page weight, JavaScript, render-blocking files and third-party scripts, with small run-to-run differences counted as even.",
      "Then the reasons, in plain sentences and biggest first: whose server answers faster, whose main image starts downloading sooner, who ships more JavaScript, whose layout jumps. Every point where you're behind links to the fix in your own report, and both pages load side by side in a race video you can download.",
    ],
    Example: CompetitorExample,
  },
  {
    id: "fix-check",
    title: "Check whether a fix worked",
    body: [
      "After a developer changes something, click Test again. The tool compares the new result with your earlier tests of the same page and shows the score and each metric before and after, which issues are now fixed, which are still open and anything new, with a small chart of your last few scores.",
      "Lab results move a little between runs, so small changes are marked as about the same rather than celebrated. Earlier results are saved only in your own browser, never on the server.",
    ],
    Example: FixCheckExample,
  },
  {
    id: "third-parties",
    title: "See what each third-party script costs",
    body: [
      "Analytics, tag managers, chat widgets, session recorders, ad and social pixels, video players and font services are grouped by the company behind them. For each one: how long it blocks the page, how much work it makes the browser do, its size, whether it blocks the first paint and whether it loads before your main content.",
      "Using Lighthouse's own scoring curves, the tool estimates how many points each one costs and what the score could be if the optional ones loaded after the page, then gives company-specific steps and a ready-made script for delaying them.",
    ],
    Example: ThirdPartyExample,
  },
  {
    id: "field-lab",
    title: "Real-visitor data and the lab test, side by side",
    body: [
      "Google ranks on field data: the 75th percentile of real Chrome visits over 28 days, from the Chrome UX Report. The lab test is one controlled load that's ideal for finding causes. The tool shows both for mobile and desktop at once, each with Google's good, needs improvement and poor bands drawn under the number, and switches between this URL and the whole site when a page has too little traffic of its own.",
    ],
    Example: FieldExample,
  },
  {
    id: "ai-crawlers",
    title: "Check what search and AI crawlers receive",
    body: [
      "Most AI crawlers, including the ones behind ChatGPT, Claude and Perplexity, read the raw HTML without running JavaScript. Alongside the speed test, the tool fetches the raw HTML and checks the server response time, how much of the text is actually in it, whether the main heading is there, its size, compression and redirects.",
      "AI platforms don't publish speed thresholds, so the tool doesn't invent any. It shows the things that decide whether a crawler can read the page at all.",
    ],
    Example: CrawlerExample,
  },
  {
    id: "replay",
    title: "Watch the page load, and download the video",
    body: [
      "A replay built from the snapshots Google's test takes while the page loads, with a running clock, the moments of first content, main content and full load, the LCP element outlined when it appears and the elements that moved marked in red.",
      "A caption explains each moment, like \"Blank screen: waiting for styles.css (render-blocking)\", and the files still downloading are counted alongside. Compare mobile and desktop side by side, slow it down, and download it as an MP4 or WebM video or a GIF to share with a client or team.",
    ],
    Example: ReplayExample,
  },
  {
    id: "platform",
    title: "Fix steps for WordPress, Shopify, Next.js, Wix and more",
    body: [
      "The tool recognises what the site is built with from the files it loads: WordPress (and speed plugins such as WP Rocket, LiteSpeed Cache, W3 Total Cache and Autoptimize, plus Elementor and WooCommerce), Shopify, Next.js, Wix, Squarespace, Webflow and others.",
      "Each fix then starts with steps for that platform, down to the menu and setting to change, so a site owner or a new SEO can act without touching code. The developer steps are still there underneath.",
    ],
    Example: PlatformExample,
  },
  {
    id: "report",
    title: "Hand developers a report they can act on",
    body: [
      "Copy the whole report as plain text, or one fix at a time, and paste it into a ticket. Each fix includes its impact, the metrics it affects, the element, the current and fixed code, the files involved and numbered steps. Download the full result as JSON, or share a link that reruns the test.",
    ],
    Example: ReportExample,
  },
];

const comparison: { label: string; us: string; psi: string }[] = [
  { label: "Google's Lighthouse test on Google's servers", us: "Yes", psi: "Yes" },
  { label: "Real-visitor Chrome UX Report data", us: "Yes", psi: "Yes" },
  { label: "Mobile and desktop from one test", us: "Yes", psi: "Yes" },
  { label: "States the main cause of each slow metric in a sentence", us: "Yes", psi: "No" },
  { label: "Fixed HTML generated from the element's own code", us: "Yes", psi: "No" },
  { label: "Changes highlighted in the code", us: "Yes", psi: "No" },
  { label: "Fixes ranked by Core Web Vitals impact, with steps", us: "Yes", psi: "Lists insights" },
  { label: "Step-by-step fixes for the detected platform and speed plugin", us: "Yes", psi: "Short tips for some platforms" },
  { label: "Raw HTML check for crawlers that don't run JavaScript", us: "Yes", psi: "No" },
  { label: "Copy-ready report for a developer", us: "Yes", psi: "No" },
  { label: "Compare with a competitor's page, with the reasons one is faster", us: "Yes", psi: "No" },
  { label: "Rank up to 6 pages for one keyword by Core Web Vitals and speed", us: "Yes", psi: "No" },
  { label: "Test a site by page type from its sitemap, with template-level fixes", us: "Yes", psi: "No" },
  { label: "Read a Search Console Core Web Vitals export and find each group's cause", us: "Yes", psi: "No" },
  { label: "Before and after check when you test again", us: "Yes", psi: "No" },
  { label: "Third parties by company, with the score each one costs", us: "Yes", psi: "Lists third parties and their time" },
  { label: "Score calculator with your results and the quickest route to 90", us: "Yes", psi: "Links to Google's calculator, no route to 90" },
];

const steps = [
  { t: "Enter the page URL", d: "Paste the full address of the page you want to test, such as a product, category or blog page. Test the pages that get the most search traffic first." },
  { t: "Wait for both tests", d: "Mobile and desktop run at the same time on Google's servers. It usually takes 20 to 40 seconds." },
  { t: "Check the Core Web Vitals verdict", d: "Start with real-visitor data: it's what Google uses. Each metric shows whether it's good, needs improvement or poor against Google's thresholds." },
  { t: "Read the root causes", d: "For every metric that isn't good, read the one-sentence cause and look at the element it points to." },
  { t: "Send the fixes", d: "Open the fixes in order of impact, copy the fixed code or the whole developer report into a ticket, and rerun the test once the changes are live." },
];

const faqs = [
  {
    q: "What is a good page speed score?",
    a: "Google's Core Web Vitals thresholds are what matter: LCP of 2.5 seconds or less, INP of 200 milliseconds or less and CLS of 0.1 or less, measured at the 75th percentile of real visits. The Lighthouse performance score (0 to 100) is a lab summary; 90 or above is good, 50 to 89 needs improvement and below 50 is poor.",
  },
  {
    q: "How is the Lighthouse performance score calculated?",
    a: "Lighthouse scores five lab metrics on a curve from 0 to 100 and takes a weighted average: Total Blocking Time 30%, Largest Contentful Paint 25%, Cumulative Layout Shift 25%, First Contentful Paint 10% and Speed Index 10%. Each curve is set so a metric at Google's good threshold scores about 90 (for example 2.5 s LCP on mobile). Desktop curves are stricter. The score calculator on this page uses the same curves and weights.",
  },
  {
    q: "Why are the real-visitor results different from the lab test?",
    a: "Real-visitor data comes from Chrome users over the last 28 days, on every kind of phone, network and location, and includes repeat visits that are served from cache. The lab test is a single load on a simulated mid-range phone with a slow 4G connection. Use the field data to judge the page and the lab test to find the causes.",
  },
  {
    q: "Why does my score change every time I run the test?",
    a: "Lab results vary a little from run to run because of server load, network conditions and third-party scripts that behave differently each time. Changes of a few points are normal. If you need a stable number, run the test three times and look at the middle result, or rely on the real-visitor data.",
  },
  {
    q: "Is this the same as Google PageSpeed Insights?",
    a: "The measurements are: the tool uses the PageSpeed Insights API, so the test runs Lighthouse on Google's servers and the real-visitor data comes from the Chrome UX Report. What it adds is the interpretation: the main cause of each slow metric, the fixed code for each element, fixes ranked by impact, a raw HTML check for crawlers and a report for developers.",
  },
  {
    q: "Does page speed affect Google rankings?",
    a: "Core Web Vitals are used by Google's ranking systems as part of page experience, but relevant, helpful content matters far more. A faster page won't outrank a better answer. Speed does affect how many visitors stay, convert and come back, which is reason enough to fix it.",
  },
  {
    q: "What's the difference between INP and Total Blocking Time?",
    a: "INP is measured on real interactions by real visitors, so it only exists in field data. Total Blocking Time is measured in the lab and counts how long scripts keep the browser too busy to respond while the page loads. A high TBT usually means a poor INP, and the scripts behind both are the same.",
  },
  {
    q: "Does page speed matter for AI search?",
    a: "AI platforms don't publish speed thresholds. What matters is whether their crawlers can get and read the page: most don't run JavaScript, so content needs to be in the HTML the server sends, and a slow server or a page built entirely by JavaScript can leave them with little or nothing to read. The crawler view in the results checks exactly this.",
  },
  {
    q: "Is it free, and are my results stored?",
    a: "It's free and needs no account. Results are kept in memory for 10 minutes so switching tabs or refreshing doesn't rerun the test, then discarded. Nothing is saved to a database. For the before and after check, a short summary of each test (scores, metrics and issue names) is saved in your own browser, and you can clear it at any time.",
  },
  {
    q: "How do I compare my page speed with a competitor's?",
    a: "Click \"Compare with a competitor\" under the URL box, add their page, and run the test. Compare similar pages, such as your product page against theirs. The head-to-head view shows who's faster on mobile and desktop and why, and the reasons where you're behind link straight to the fixes. To compare against several pages ranking for the same keyword, use the Speed leaderboard tab. Both can be shared: the link includes the URLs.",
  },
  {
    q: "How do I check the page speed of a whole website?",
    a: "Use the Page types tab. Enter the site and the tool reads its sitemap, groups the pages into templates (home, category, product, blog and others) and tests a couple from each. Google groups similar pages in the same way in Search Console, so the slowest template is usually the one to fix first.",
  },
  {
    q: "How do I fix Core Web Vitals issues reported in Search Console?",
    a: "Open the issue in Search Console's Core Web Vitals report, export it as CSV and upload the ZIP in the Search Console tab. The tool tests the example URL of each group and gives the cause and fixes for that metric. Once the fix is live, click Validate fix in Search Console; it takes about 28 days of new visitor data to confirm.",
  },
  {
    q: "How do I know if a speed fix worked?",
    a: "Test the page again after the change is live (clear any page cache first). The report compares it with your earlier tests in this browser and shows each metric before and after. Lab results can move by a few points between runs, so look for clear changes, and remember real-visitor data takes up to 28 days to reflect a fix.",
  },
];

const breadcrumb = [
  { name: "Home", path: "/" },
  { name: "Tools", path: "/tools" },
  { name: "Page Speed Test", path: "/tools/page-speed-test" },
];

function Tick() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-pass" aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.14" />
      <path d="M6 10.4l2.6 2.6L14 7.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const cell = (v: string) =>
  v === "Yes" ? (
    <span className="inline-flex items-center gap-1.5 font-medium text-pass">
      <Tick /> Yes
    </span>
  ) : (
    <span className="text-ink-soft">{v}</span>
  );

export default function PageSpeedTestPage() {
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
              name: TITLE,
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
              name: "Page Speed Test",
              alternateName: "Core Web Vitals Checker",
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
              dateModified: UPDATED,
              creator: { "@id": person.id },
              publisher: { "@id": person.id },
            },
            {
              "@type": "HowTo",
              "@id": `${URL}#howto`,
              name: "How to test page speed and fix Core Web Vitals",
              description: "Test a page on mobile and desktop, find the cause of each slow metric and send the fixes to a developer.",
              tool: { "@type": "HowToTool", name: "Page Speed Test" },
              totalTime: "PT3M",
              step: steps.map((st, i) => ({ "@type": "HowToStep", position: i + 1, name: st.t, text: st.d, url: `${URL}#howto-step-${i + 1}` })),
            },
            {
              "@type": "FAQPage",
              "@id": `${URL}#faq`,
              name: "FAQs on Page Speed Test",
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
                  <Link href={b.path} className="hover:text-ink">
                    {b.name}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-ink">
                    {b.name}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <h1 className="display mt-8 text-5xl sm:text-6xl">Page Speed Test</h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-ink-soft sm:text-xl">
          Test any page on mobile and desktop with Google&apos;s own Lighthouse and real Chrome visitor data. For every slow metric you get the root cause in plain words, the exact element on a snapshot of the page, and the fixed code to hand to your developer.
        </p>
        <ul className="mt-6 flex flex-wrap gap-2 text-sm">
          {["Lighthouse 13 on Google's servers", "Real-visitor Core Web Vitals", "Mobile and desktop together", "Compare with a competitor", "Free, no sign-up"].map((t) => (
            <li key={t} className="rounded-md border border-rule bg-white px-2.5 py-1 text-ink-soft">
              {t}
            </li>
          ))}
        </ul>
        <div className="mt-10">
          <SpeedTool />
        </div>
      </section>

      <section aria-labelledby="thresholds-heading" className="container-x mt-32">
        <h2 id="thresholds-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">Google&apos;s Core Web Vitals thresholds</h2>
        <p className="mt-4 max-w-3xl leading-relaxed text-ink-soft">
          Google judges each metric at the 75th percentile of real page loads, separately for mobile and desktop. A page passes the Core Web Vitals assessment when LCP, INP and CLS are all good. These are the bands the tool uses for every number it shows.
        </p>
        <div className="mt-8 overflow-x-auto rounded-xl border border-rule bg-white">
          <table className="w-full min-w-[44rem] text-left text-[0.95rem]">
            <thead className="border-b border-rule bg-mist/60 text-sm">
              <tr>
                <th scope="col" className="px-5 py-3.5 font-semibold">Metric</th>
                <th scope="col" className="px-5 py-3.5 font-semibold text-pass">Good</th>
                <th scope="col" className="px-5 py-3.5 font-semibold text-warn">Needs improvement</th>
                <th scope="col" className="px-5 py-3.5 font-semibold text-fail">Poor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {thresholdRows.map((r) => (
                <tr key={r.m}>
                  <th scope="row" className="px-5 py-3.5 font-normal">
                    <span className="block font-medium">
                      {r.m}
                      {r.core && <span className="ml-2 rounded bg-mist px-1.5 py-0.5 text-[0.7rem] font-medium text-ink-soft">Core Web Vital</span>}
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-soft">{r.what}</span>
                  </th>
                  <td className="px-5 py-3.5">{r.good}</td>
                  <td className="px-5 py-3.5">{r.ni}</td>
                  <td className="px-5 py-3.5">{r.poor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-ink-soft">Source: web.dev, Google&apos;s guidance on Web Vitals. Total Blocking Time bands are Lighthouse&apos;s mobile scoring bands.</p>
      </section>

      <section id="score-calculator" aria-labelledby="calc-heading" className="container-x mt-32">
        <h2 id="calc-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">Lighthouse score calculator</h2>
        <p className="mt-4 max-w-3xl leading-relaxed text-ink-soft">
          See exactly how Lighthouse turns five lab metrics into the 0 to 100 performance score, and what it would take to reach 90. Type your numbers or drag the sliders: the calculator uses Lighthouse&apos;s own scoring curves and weights, so it gives the same score as a real report.
        </p>
        <div className="mt-8">
          <ScoreCalculator />
        </div>
      </section>

      <section aria-labelledby="features-heading" className="container-x mt-32">
        <div className="max-w-3xl">
          <h2 id="features-heading" className="text-3xl font-semibold tracking-tight sm:text-5xl">From a slow score to the exact fix</h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-soft">
            Most speed tests stop at the number and a list of audits. This one works out which of those audits is actually behind each slow metric, points to the element, and writes the change.
          </p>
        </div>
        <div className="mt-16 space-y-20 sm:space-y-24">
          {features.map(({ id, title, body, Example }, k) => (
            <article key={id} id={id} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
              <div className={k % 2 ? "lg:order-2" : ""}>
                <h3 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{title}</h3>
                {body.map((p) => (
                  <p key={p.slice(0, 20)} className="mt-4 max-w-xl leading-relaxed text-ink-soft">
                    {p}
                  </p>
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
        <h2 id="compare-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">How it compares with PageSpeed Insights</h2>
        <p className="mt-4 max-w-3xl leading-relaxed text-ink-soft">
          The measurements come from the same place: Google&apos;s PageSpeed Insights API. The difference is what you get to act on.
        </p>
        <div className="mt-8 overflow-x-auto rounded-xl border border-rule bg-white">
          <table className="w-full min-w-[36rem] text-left text-[0.95rem]">
            <thead className="border-b border-rule bg-mist/60 text-sm">
              <tr>
                <th scope="col" className="px-5 py-3.5 font-semibold">Feature</th>
                <th scope="col" className="px-5 py-3.5 font-semibold">This tool</th>
                <th scope="col" className="px-5 py-3.5 font-semibold">PageSpeed Insights</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {comparison.map((r) => (
                <tr key={r.label}>
                  <th scope="row" className="px-5 py-3.5 font-normal">
                    {r.label}
                  </th>
                  <td className="px-5 py-3.5">{cell(r.us)}</td>
                  <td className="px-5 py-3.5">{cell(r.psi)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-ink-soft">Compared in November 2026.</p>
      </section>

      <section id="howto" aria-labelledby="howto-heading" className="container-x mt-32">
        <h2 id="howto-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">How to test page speed and fix Core Web Vitals</h2>
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
        <h2 id="faq-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">FAQs on Page Speed Test</h2>
        <div className="mt-8 max-w-3xl divide-y divide-rule border-y border-rule">
          {faqs.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold tracking-tight">
                {f.q}
                <span aria-hidden="true" className="text-ink-soft transition-transform group-open:rotate-45">
                  +
                </span>
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
              Built from the way I diagnose Core Web Vitals in real technical SEO audits. Updated <time dateTime={UPDATED}>21 November 2026</time>, with Google&apos;s thresholds and Lighthouse 13 current to that date.
            </p>
          </div>
          <LinkedInLink className="shrink-0" />
        </div>
      </section>
    </>
  );
}
