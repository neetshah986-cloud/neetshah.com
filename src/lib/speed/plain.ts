// One plain sentence a beginner can act on: the first thing to do for a page.
import type { SpeedRun } from "./types";

const PLAIN: Record<string, string> = {
  "lcp-discovery-insight": "make the main image load first: take loading=\"lazy\" off it and mark it fetchpriority=\"high\"",
  "lcp-breakdown-insight": "make the main image or heading show sooner; the Root causes tab shows which part of the wait is too long",
  "image-delivery-insight": "shrink the images: serve them at the size they're shown, in AVIF or WebP",
  "render-blocking-insight": "stop CSS and JavaScript files from holding up the first paint: defer scripts and inline the CSS for the top of the page",
  "document-latency-insight": "make the server answer faster: turn on page caching or put the site behind a CDN that caches HTML",
  "server-response-time": "make the server answer faster: turn on page caching or put the site behind a CDN that caches HTML",
  "unused-javascript": "remove JavaScript the page doesn't use: unused plugins, apps and libraries",
  "bootup-time": "cut the JavaScript that keeps the page busy, starting with the biggest file listed",
  "third-parties-insight": "delay chat, tracking and marketing scripts until after the page has loaded",
  "cls-culprits-insight": "stop the layout jumping: give images, ads and banners a fixed space before they load",
  "unsized-images": "add width and height to images so the page doesn't jump when they load",
  "font-display-insight": "let text show straight away while web fonts load (font-display: swap)",
  "unused-css-rules": "remove CSS the page doesn't use",
  "redirects": "link straight to the final address so the page doesn't redirect first",
  "dom-size-insight": "make the page lighter: fewer elements, especially in menus and long lists",
  "network-dependency-tree-insight": "load important files sooner: preload them instead of waiting for other files to request them",
  "legacy-javascript-insight": "stop sending old-browser JavaScript to modern browsers",
  "duplicated-javascript-insight": "remove libraries that are loaded twice",
  "offscreen-images": "lazy-load the images further down the page",
  "viewport-insight": "add a mobile viewport tag so phones don't wait before responding",
  "forced-reflow-insight": "stop scripts from forcing extra layout work",
  "modern-http-insight": "turn on HTTP/2 or HTTP/3 on the server or CDN",
  "cache-insight": "let browsers keep your static files longer, so returning visitors load faster",
};

export type DoFirst = { text: string; who?: string; findingId?: string; platform?: string };

export function doFirst(run: SpeedRun): DoFirst | null {
  const f = run.findings[0];
  if (!f) return null;
  const plain = PLAIN[f.auditId] ?? f.title.charAt(0).toLowerCase() + f.title.slice(1);
  const step = f.platformSteps?.steps[0];
  return { text: plain, who: f.owner, findingId: f.id, platform: step && f.platformSteps ? `${f.platformSteps.title}: ${step}` : undefined };
}
