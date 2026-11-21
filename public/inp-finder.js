/* INP finder by neetshah.com Page Speed Test. Paste into the DevTools console (or run as a bookmarklet)
   on your own page, then use the page. Slow taps, clicks and key presses are listed with what caused them.
   Uses the Event Timing and Long Animation Frames APIs (Chrome, Edge). Nothing is sent anywhere. */
(function () {
  if (window.__nsInp) { window.__nsInp.open(); return; }
  var types = (window.PerformanceObserver && PerformanceObserver.supportedEntryTypes) || [];
  var hasLoaf = types.indexOf("long-animation-frame") >= 0;
  var items = new Map();
  var loafs = [];
  var els = new Map();
  /* Clicking a link loads a new page, which ends any script, bookmarklets included. Results are kept in
     this tab's sessionStorage, so running the finder again on the next page continues the list. */
  var KEY = "__nsInpFinder";
  var page = location.pathname + location.search;
  var loadId = String(performance.timeOrigin);
  var earlier = [];
  try { earlier = (JSON.parse(sessionStorage.getItem(KEY) || "{}").items || []).filter(function (x) { return x.loadId !== loadId; }); } catch (e) { earlier = []; }
  function save() {
    try {
      var mine = Array.from(items.values()).map(function (it) { var c = Object.assign({}, it, { page: page, loadId: loadId }); c.scripts = scriptsFor(it.start, it.start + it.duration); return c; });
      sessionStorage.setItem(KEY, JSON.stringify({ items: earlier.concat(mine).slice(-60) }));
    } catch (e) { /* storage blocked: results last for this page only */ }
  }
  addEventListener("pagehide", save);

  function selector(el) {
    if (!el || el.nodeType !== 1) return "(element removed)";
    var parts = [];
    for (var i = 0; el && el.nodeType === 1 && i < 3; i++) {
      var s = el.tagName.toLowerCase();
      if (el.id) { parts.unshift(s + "#" + el.id); break; }
      var cls = (typeof el.className === "string" ? el.className : "").trim().split(/\s+/).filter(function (c) { return c && c.length < 30; }).slice(0, 2);
      if (cls.length) s += "." + cls.join(".");
      parts.unshift(s);
      el = el.parentElement;
    }
    return parts.join(" > ");
  }
  function label(el) {
    if (!el || el.nodeType !== 1) return "";
    var t = el.getAttribute("aria-label") || el.getAttribute("alt") || el.getAttribute("title") || el.innerText || el.value || "";
    t = String(t).replace(/\s+/g, " ").trim();
    return t.length > 40 ? t.slice(0, 39) + "…" : t;
  }
  function scriptsFor(start, end) {
    var map = {};
    loafs.forEach(function (f) {
      if (f.startTime > end || f.startTime + f.duration < start) return;
      (f.scripts || []).forEach(function (s) {
        var url = s.sourceURL || "(inline or unknown)";
        var key = url + "|" + (s.sourceFunctionName || "");
        var m = map[key] || (map[key] = { url: url, fn: s.sourceFunctionName || "", invoker: s.invoker || "", type: s.invokerType || "", ms: 0, layout: 0 });
        m.ms += s.duration || 0;
        m.layout += s.forcedStyleAndLayoutDuration || 0;
      });
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.ms - a.ms; }).slice(0, 4).map(function (m) {
      return { url: m.url, fn: m.fn, invoker: m.invoker, type: m.type, ms: Math.round(m.ms), layout: Math.round(m.layout) };
    });
  }
  function rating(ms) { return ms <= 200 ? "good" : ms <= 500 ? "ni" : "poor"; }
  var COLOR = { good: "#0B8A57", ni: "#B86E00", poor: "#C42B1C" };

  function list() {
    var arr = Array.from(items.values());
    arr.forEach(function (it) { it.scripts = scriptsFor(it.start, it.start + it.duration); it.page = page; });
    return arr.concat(earlier).sort(function (a, b) { return b.duration - a.duration; });
  }
  function inp(arr) {
    if (!arr.length) return 0;
    var sorted = arr.map(function (a) { return a.duration; }).sort(function (a, b) { return b - a; });
    return sorted[Math.min(sorted.length - 1, Math.floor(arr.length / 50))];
  }

  /* One tap fires several events (pointerdown, pointerup, click). They're combined per interaction,
     the way Chrome's web-vitals library does: wait = first event's queueing, code = all handlers, draw = the rest. */
  var groups = new Map();
  new PerformanceObserver(function (l) {
    l.getEntries().forEach(function (e) {
      if (!e.interactionId) return;
      var g = groups.get(e.interactionId) || [];
      g.push(e);
      groups.set(e.interactionId, g);
      var start = Math.min.apply(null, g.map(function (x) { return x.startTime; }));
      var end = Math.max.apply(null, g.map(function (x) { return x.startTime + x.duration; }));
      var firstProc = Math.min.apply(null, g.map(function (x) { return x.processingStart; }));
      var lastProcEnd = Math.max.apply(null, g.map(function (x) { return x.processingEnd; }));
      var main = g.reduce(function (a, x) { return x.processingEnd - x.processingStart > a.processingEnd - a.processingStart ? x : a; }, g[0]);
      var named = g.find(function (x) { return x.name === "click" || x.name === "keydown" || x.name === "keypress"; }) || main;
      var withTarget = g.find(function (x) { return x.target; });
      var target = named.target || main.target || (withTarget && withTarget.target);
      if (target) els.set(e.interactionId, target);
      items.set(e.interactionId, {
        id: e.interactionId,
        type: named.name === "pointerdown" || named.name === "pointerup" ? "tap" : named.name,
        target: selector(target),
        text: label(target),
        start: Math.round(start),
        duration: Math.round(end - start),
        inputDelay: Math.max(0, Math.round(firstProc - start)),
        processing: Math.max(0, Math.round(lastProcEnd - firstProc)),
        presentation: Math.max(0, Math.round(end - lastProcEnd))
      });
    });
    schedule();
  }).observe({ type: "event", durationThreshold: 16, buffered: true });
  if (hasLoaf) new PerformanceObserver(function (l) {
    l.getEntries().forEach(function (f) { loafs.push(f); });
    if (loafs.length > 400) loafs.splice(0, loafs.length - 400);
  }).observe({ type: "long-animation-frame", buffered: true });

  /* The panel lives in a shadow root so the page's CSS can't change it. */
  var host = document.createElement("div");
  host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;";
  var root = host.attachShadow({ mode: "open" });
  root.innerHTML = "<style>" +
    ".p{width:360px;max-height:62vh;display:flex;flex-direction:column;background:#fff;color:#0E1A2B;border:1px solid #D9E0EA;border-radius:14px;box-shadow:0 18px 50px -20px rgba(14,26,43,.45);font:13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}" +
    ".h{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;background:#0E1A2B;color:#fff;border-radius:13px 13px 0 0}" +
    ".h b{font-size:13px}.h span{opacity:.7;font-size:12px}" +
    ".s{padding:10px 12px;border-bottom:1px solid #D9E0EA}" +
    ".big{font-size:22px;font-weight:700}" +
    ".l{overflow:auto;padding:4px 0}" +
    ".i{padding:8px 12px;border-bottom:1px solid #EEF2F7;cursor:default}.i:hover{background:#F4F7FB}" +
    ".r{display:flex;justify-content:space-between;gap:8px}.t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,monospace;font-size:12px}" +
    ".bar{display:flex;height:6px;border-radius:3px;overflow:hidden;margin:6px 0 4px;background:#EEF2F7}" +
    ".k{display:flex;gap:10px;font-size:11px;color:#4A5A70}.d{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px;vertical-align:-1px}" +
    ".sc{font-size:11.5px;color:#4A5A70;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".f{display:flex;gap:6px;padding:10px 12px;border-top:1px solid #D9E0EA}" +
    "button{font:inherit;font-weight:600;border:1px solid #D9E0EA;background:#fff;border-radius:8px;padding:6px 10px;cursor:pointer;color:#0E1A2B}" +
    "button.m{background:#0E1A2B;color:#fff;border-color:#0E1A2B}.x{background:transparent;border:0;color:#fff;font-size:16px;padding:0 4px}" +
    ".e{color:#4A5A70;padding:10px 12px}" +
    "</style><div class='p'><div class='h'><div><b>INP finder</b> <span>by neetshah.com</span></div><button class='x' title='Close'>×</button></div>" +
    "<div class='s'></div><div class='l'></div><div class='f'><button class='m c'>Copy results</button><button class='z'>Clear</button></div></div>";
  document.documentElement.appendChild(host);
  var sum = root.querySelector(".s"), box = root.querySelector(".l");
  var outline = document.createElement("div");
  outline.style.cssText = "position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #1A3FD6;background:rgba(26,63,214,.08);border-radius:4px;display:none";
  document.documentElement.appendChild(outline);

  var pending = false;
  function schedule() { if (!pending) { pending = true; setTimeout(function () { pending = false; render(); }, 250); } }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function short(u) { try { var x = new URL(u); return (x.host === location.host ? "" : x.host) + x.pathname.split("/").slice(-2).join("/"); } catch (e) { return u; } }

  function render() {
    save();
    var arr = list();
    var v = inp(arr);
    sum.innerHTML = arr.length
      ? "<div class='r'><div>Estimated INP for this visit</div><div class='big' style='color:" + COLOR[rating(v)] + "'>" + v + " ms</div></div><div style='color:#4A5A70'>" + arr.length + " interaction" + (arr.length === 1 ? "" : "s") + " recorded. Good is 200 ms or less." + (hasLoaf ? "" : " Script names need Chrome 123 or newer.") + "</div>"
      : "<div><b>Now use the page.</b> Tap buttons, open menus, add to cart, type in search. Each interaction appears here with what slowed it down.</div><div style='color:#4A5A70;margin-top:4px'>Tip: in DevTools, Performance, set CPU to 4x slowdown to feel what a mid-range phone feels.</div>";
    sum.innerHTML += "<div style='color:#4A5A70;margin-top:6px;font-size:12px'>" + (earlier.length ? "Includes " + earlier.length + " from earlier pages in this tab. " : "") + "Clicking a link opens a new page and closes this panel: click the bookmark again there and your results carry on.</div>";
    box.innerHTML = arr.slice(0, 25).map(function (it) {
      var tot = Math.max(1, it.inputDelay + it.processing + it.presentation);
      var sc = it.scripts[0];
      var other = it.page && it.page !== page;
      return "<div class='i' data-id='" + (other ? "" : it.id) + "'><div class='r'><div class='t'>" + esc(it.type) + " on " + esc(it.target) + "</div><b style='color:" + COLOR[rating(it.duration)] + "'>" + it.duration + " ms</b></div>" +
        (it.text || other ? "<div class='sc'>" + (it.text ? "“" + esc(it.text) + "”" : "") + (other ? (it.text ? ", " : "") + "on " + esc(it.page) : "") + "</div>" : "") +
        "<div class='bar'><span style='width:" + (it.inputDelay / tot * 100) + "%;background:#B86E00'></span><span style='width:" + (it.processing / tot * 100) + "%;background:#1A3FD6'></span><span style='width:" + (it.presentation / tot * 100) + "%;background:#0B8A57'></span></div>" +
        "<div class='k'><span><i class='d' style='background:#B86E00'></i>wait " + it.inputDelay + "</span><span><i class='d' style='background:#1A3FD6'></i>code " + it.processing + "</span><span><i class='d' style='background:#0B8A57'></i>draw " + it.presentation + "</span></div>" +
        (sc ? "<div class='sc'>Slowest script: " + esc(short(sc.url)) + (sc.fn ? " (" + esc(sc.fn) + ")" : "") + ", " + sc.ms + " ms</div>" : "") +
        "</div>";
    }).join("") || "<div class='e'>Nothing slower than 16 ms yet.</div>";
  }
  box.addEventListener("mouseover", function (e) {
    var row = e.target.closest && e.target.closest(".i");
    var el = row && els.get(Number(row.getAttribute("data-id")));
    if (!el || !el.isConnected) { outline.style.display = "none"; return; }
    var r = el.getBoundingClientRect();
    outline.style.cssText += ";display:block;left:" + (r.left - 3) + "px;top:" + (r.top - 3) + "px;width:" + (r.width + 6) + "px;height:" + (r.height + 6) + "px";
  });
  box.addEventListener("mouseleave", function () { outline.style.display = "none"; });
  root.querySelector(".x").onclick = function () { host.style.display = "none"; outline.style.display = "none"; };
  root.querySelector(".z").onclick = function () { items.clear(); els.clear(); earlier = []; try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ } render(); };
  root.querySelector(".c").onclick = function () {
    var arr = list();
    var out = JSON.stringify({ tool: "neetshah-inp-finder", version: 1, url: location.href, when: new Date().toISOString(), ua: navigator.userAgent, inp: inp(arr), interactions: arr.slice(0, 30).map(function (it) { var c = Object.assign({}, it); delete c.id; delete c.loadId; return c; }) });
    var btn = this;
    var done = function () { btn.textContent = "Copied. Paste it in the tool"; setTimeout(function () { btn.textContent = "Copy results"; }, 2500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(out).then(done, function () { prompt("Copy these results:", out); });
    else prompt("Copy these results:", out);
  };
  window.__nsInp = { open: function () { host.style.display = ""; render(); } };
  render();
  console.log("%cINP finder by neetshah.com is running. Use the page; slow interactions appear in the panel.", "color:#1A3FD6;font-weight:bold");
})();
