/* Schema inspector by neetshah.com. Run it (as a bookmark) on any page: it takes the page as your browser
   shows it, including structured data added by JavaScript or Google Tag Manager, and opens it in the
   neetshah.com Schema Validator. Scripts, styles and images are left out; nothing else is sent anywhere. */
(function () {
  var ORIGIN = "__ORIGIN__";
  var doc = document.documentElement.cloneNode(true);
  var drop = doc.querySelectorAll("script:not([type='application/ld+json']),style,noscript,svg,iframe,template,canvas,video,audio,source,picture>source");
  for (var i = 0; i < drop.length; i++) drop[i].parentNode && drop[i].parentNode.removeChild(drop[i]);
  var all = doc.querySelectorAll("*");
  for (var j = 0; j < all.length; j++) {
    all[j].removeAttribute("style");
    all[j].removeAttribute("srcset");
    var on = Array.prototype.slice.call(all[j].attributes).filter(function (a) { return /^on/i.test(a.name) || /^data-(v-|react|reactid)/.test(a.name); });
    on.forEach(function (a) { all[j].removeAttribute(a.name); });
  }
  var html = "<!doctype html>\n" + doc.outerHTML;
  var payload = { type: "ns-schema-inspector", v: 1, url: location.href, title: document.title, html: html };

  function fallback(msg) {
    var box = document.createElement("div");
    box.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;width:340px;background:#fff;color:#0E1A2B;border:1px solid #D9E0EA;border-radius:14px;box-shadow:0 18px 50px -20px rgba(14,26,43,.45);font:13px/1.5 system-ui,sans-serif;padding:14px";
    box.innerHTML = "<b>Schema inspector by neetshah.com</b><p style='margin:6px 0 10px;color:#4A5A70'>" + msg + "</p><button style='font:inherit;font-weight:600;background:#0E1A2B;color:#fff;border:0;border-radius:8px;padding:7px 12px;cursor:pointer'>Copy this page</button> <button style='font:inherit;border:1px solid #D9E0EA;background:#fff;border-radius:8px;padding:7px 10px;cursor:pointer'>Close</button>";
    var b = box.querySelectorAll("button");
    b[0].onclick = function () {
      var done = function () { b[0].textContent = "Copied. Paste it in Paste code"; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(html).then(done, function () { prompt("Copy the page:", html); });
      else prompt("Copy the page:", html);
    };
    b[1].onclick = function () { box.remove(); };
    document.documentElement.appendChild(box);
  }

  var w = window.open(ORIGIN + "/tools/schema-validator?from=inspector", "_blank");
  if (!w) { fallback("Your browser blocked the new tab. Allow pop-ups for this site and click the bookmark again, or copy the page and paste it into the validator's Paste code tab."); return; }
  var acked = false;
  // Sites that isolate their tabs (Cross-Origin-Opener-Policy) cut the link to the new tab straight away.
  setTimeout(function () { if (!acked && w.closed) { clearInterval(t); fallback("This site keeps its tabs isolated, so the page couldn't be sent. Copy it instead and paste it into the validator's Paste code tab."); } }, 1500);
  window.addEventListener("message", function (e) { if (e.origin === ORIGIN && e.data && e.data.type === "ns-schema-ack") acked = true; });
  var tries = 0;
  var t = setInterval(function () {
    tries++;
    if (acked) { clearInterval(t); return; }
    try { w.postMessage(payload, ORIGIN); } catch (e) { /* the tab is still loading */ }
    if (tries > 40) { clearInterval(t); fallback("The validator tab didn't receive the page (some sites isolate their tabs). Copy the page instead and paste it into the validator's Paste code tab."); }
  }, 500);
})();
