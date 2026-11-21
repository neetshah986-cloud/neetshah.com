// Plain explanations of the technical words used in the report, for beginners.

export type GlossaryEntry = { key: string; term: string; text: string; match: RegExp };

const E = (key: string, term: string, text: string, match: RegExp): GlossaryEntry => ({ key, term, text, match });

/** Longer phrases first, so "Total Blocking Time" wins over "TBT"-style shorter matches nearby. */
export const GLOSSARY: GlossaryEntry[] = [
  E("cwv", "Core Web Vitals", "Google's three page experience measurements: LCP (loading), INP (responsiveness) and CLS (visual stability). Google uses real visitors' results in Search.", /\bCore Web Vitals\b/),
  E("lcp", "Largest Contentful Paint (LCP)", "How long until the biggest thing on the screen (usually the main image or heading) appears. Good is 2.5 seconds or less.", /\bLargest Contentful Paint\b|\bLCP\b/),
  E("inp", "Interaction to Next Paint (INP)", "How long the page takes to react after a visitor taps, clicks or types. Good is 200 ms or less. Only real visitors can measure it.", /\bInteraction to Next Paint\b|\bINP\b/),
  E("cls", "Cumulative Layout Shift (CLS)", "How much the content jumps around while the page loads. Good is 0.1 or less.", /\bCumulative Layout Shift\b|\bCLS\b/),
  E("fcp", "First Contentful Paint (FCP)", "When the first text or image appears, so the visitor knows the page is loading.", /\bFirst Contentful Paint\b|\bFCP\b/),
  E("ttfb", "Time to First Byte (TTFB)", "How long the server takes to start sending the page. Everything else waits for it.", /\bTime to First Byte\b|\bTTFB\b/),
  E("tbt", "Total Blocking Time (TBT)", "How long JavaScript keeps the page too busy to respond during loading. The lab's stand-in for INP.", /\bTotal Blocking Time\b|\bTBT\b/),
  E("si", "Speed Index", "How quickly the visible part of the page fills in during loading.", /\bSpeed Index\b/),
  E("field", "Real-visitor (field) data", "Measurements from real Chrome users over the last 28 days, from Google's Chrome UX Report. This is what Google uses in Search.", /\bfield data\b|\breal-visitor data\b/i),
  E("lab", "Lab test", "One controlled test load on Google's servers, on a slow phone and network. Good for finding causes; numbers vary a little between runs.", /\blab test\b|\blab data\b/i),
  E("crux", "Chrome UX Report (CrUX)", "Google's public dataset of real Chrome users' experience on websites. It's where the real-visitor numbers come from.", /\bChrome UX Report\b|\bCrUX\b/),
  E("p75", "75th percentile", "Google judges the experience of 3 out of 4 visits: the slowest quarter of visits are allowed to be worse.", /\b75th percentile\b/),
  E("render", "Render-blocking", "Files (usually CSS and JavaScript in the page's <head>) that the browser must download before it can show anything.", /\brender-blocking\b/i),
  E("third", "Third party", "Code from another company running on the page, such as analytics, ads, chat widgets or video players.", /\bthird[- ]part(y|ies)\b/i),
  E("main", "Main thread", "The single worker in the browser that runs JavaScript, works out the layout and responds to taps. If it's busy, the page can't react.", /\bmain[- ]thread\b/i),
  E("long", "Long task", "A piece of JavaScript work over 50 ms. While it runs, the page can't respond to the visitor.", /\blong (JavaScript )?tasks?\b/i),
  E("lazy", "Lazy loading", "Telling the browser to load an image only when it's about to scroll into view. Good for images lower down; bad for the main image.", /\blazy[- ]load(ing|ed|s)?\b|loading="lazy"/i),
  E("fetchpriority", "fetchpriority", "An attribute that tells the browser which image to download first. fetchpriority=\"high\" on the main image makes it appear sooner.", /\bfetchpriority\b/),
  E("preload", "Preload", "A hint in the page's <head> that tells the browser to start downloading an important file straight away.", /\bpreload(ed|ing)?\b/i),
  E("cdn", "CDN", "A content delivery network: copies of your files on servers around the world, so visitors download them from somewhere nearby.", /\bCDN\b/),
  E("lighthouse", "Lighthouse", "Google's open-source tool that loads a page in a test browser and measures its speed. PageSpeed Insights runs it on Google's servers.", /\bLighthouse\b/),
  E("avif", "AVIF and WebP", "Modern image formats that are much smaller than JPEG or PNG at the same quality. AVIF is usually the smallest.", /\bAVIF\b|\bWebP\b/),
  E("srcset", "srcset and sizes", "Attributes that offer the browser several sizes of an image, so a phone downloads a small one and a big screen a larger one.", /\bsrcset\b/),
  E("dom", "DOM", "The page's structure of elements as the browser sees it. A very large DOM makes every change slower.", /\bDOM\b/),
  E("defer", "defer and async", "Attributes on a script tag that let the page keep loading while the script downloads, instead of stopping for it.", /\bdefer\b/),
  E("cache", "Browser cache", "Files the browser keeps after the first visit, so returning visitors don't download them again.", /\bcache(d|s)?\b/i),
];

export const glossaryByKey = new Map(GLOSSARY.map((g) => [g.key, g]));
