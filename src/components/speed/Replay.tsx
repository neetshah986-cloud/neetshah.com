"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatBytes, formatMs } from "@/lib/speed/metrics";
import type { Rect, SpeedRun } from "@/lib/speed/types";

// A load replay drawn on a canvas from Google's test snapshots, with the timing, captions and
// overlays burned in, so the on-screen preview and the exported video are the same thing.

const W = 1280;
const H = 720;
const C = { ink: "#0E1A2B", soft: "#4A5A70", rule: "#D9E0EA", mist: "#EEF2F7", paper: "#FBFCFD", serp: "#1A3FD6", pass: "#0B8A57", warn: "#B86E00", fail: "#C42B1C" };
const FONT = '"Schibsted Grotesk", system-ui, sans-serif';

type Lane = {
  run: SpeedRun;
  label: string;
  frames: { t: number; img: HTMLImageElement }[];
  final?: HTMLImageElement;
  lcpRect?: Rect;
  shifted: Rect[];
  end: number;
};

function loadImg(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
}

async function makeLane(run: SpeedRun): Promise<Lane> {
  const frames = await Promise.all(run.filmstrip.map(async (f) => ({ t: f.ms, img: await loadImg(f.data) })));
  const final = run.screenshot ? await loadImg(run.screenshot).catch(() => undefined) : undefined;
  const lcp = run.diagnoses.find((d) => d.metric === "LCP")?.node?.rect;
  const layoutW = run.fullPage?.width ?? run.viewport.width;
  const screen = layoutW * (run.viewport.height * (layoutW / run.viewport.width));
  // Skip whole-page containers: they add noise, not insight.
  const shifted = (run.diagnoses.find((d) => d.metric === "CLS")?.causes ?? [])
    .map((c) => c.node?.rect)
    .filter((r): r is Rect => !!r && r.width * r.height < screen * 0.5)
    .slice(0, 3);
  const m = run.waterfall?.marks ?? {};
  const end = Math.max(m.load ?? 0, m.lcp ?? 0, frames.at(-1)?.t ?? 0) + 400;
  return { run, label: run.strategy === "mobile" ? "Mobile" : "Desktop", frames, final, lcpRect: lcp, shifted, end };
}

function frameAt(l: Lane, t: number): HTMLImageElement | null {
  const fcp = l.run.waterfall?.marks.fcp ?? 0;
  const loaded = l.run.waterfall?.marks.load ?? Infinity;
  if (l.final && t >= Math.max(loaded, l.frames.at(-1)?.t ?? 0)) return l.final;
  let pick: HTMLImageElement | null = null;
  for (const f of l.frames) if (f.t <= t) pick = f.img;
  if (!pick && t >= fcp && l.frames[0]) pick = l.frames[0].img;
  return pick;
}

function caption(l: Lane, t: number): string {
  const m = l.run.waterfall?.marks ?? {};
  const rows = l.run.waterfall?.rows ?? [];
  if (m.htmlEnd && t < m.htmlEnd) return "Waiting for the server to send the HTML.";
  if (m.fcp && t < m.fcp) {
    const blocking = rows.filter((r) => r.blocking && r.end > t);
    if (blocking.length) return `Blank screen: waiting for ${blocking[0].label}${blocking.length > 1 ? ` and ${blocking.length - 1} more` : ""} (render-blocking).`;
    return "Blank screen: the browser is still building the page (running JavaScript, applying CSS, loading fonts).";
  }
  if (m.lcp && t < m.lcp) {
    const lcpRow = rows.find((r) => r.lcp);
    if (lcpRow && lcpRow.sent > t) return "Something is on screen, but the main image hasn't even started downloading.";
    if (lcpRow && lcpRow.end > t) return "The main image is downloading.";
    return "Something is on screen, but the main content isn't painted yet.";
  }
  if (m.load && t < m.load) return "Main content is visible (LCP). The remaining files are still loading.";
  return "The page has finished loading.";
}

function network(l: Lane, t: number) {
  const rows = l.run.waterfall?.rows ?? [];
  let done = 0;
  let flight = 0;
  let total = 0;
  for (const r of rows) {
    total += r.bytes;
    if (r.end <= t) done += r.bytes;
    else if (r.sent <= t) {
      flight++;
      done += r.bytes * ((t - r.sent) / Math.max(1, r.end - r.sent));
    }
  }
  return { flight, done, total };
}

function lines(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(" ")) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      out.push(line);
      line = w;
    } else line = test;
  }
  if (line) out.push(line);
  if (out.length > maxLines) {
    const cut = out.slice(0, maxLines);
    let last = cut[maxLines - 1];
    while (ctx.measureText(last + "…").width > maxW && last.length) last = last.slice(0, -1);
    cut[maxLines - 1] = last + "…";
    return cut;
  }
  return out;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function drawReplay(ctx: CanvasRenderingContext2D, lanes: Lane[], t: number, total: number) {
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);
  const panelX = W - 400;
  const areaW = panelX - 70;
  const areaTop = 60;
  const areaH = H - areaTop - 70;

  // Devices
  const gap = 40;
  const slotW = (areaW - gap * (lanes.length - 1)) / lanes.length;
  lanes.forEach((l, k) => {
    const sample = l.frames[0]?.img ?? l.final;
    const aspect = sample ? sample.naturalWidth / sample.naturalHeight : 0.5;
    let h = areaH - 28;
    let w = h * aspect;
    if (w > slotW) {
      w = slotW;
      h = w / aspect;
    }
    const x = 40 + k * (slotW + gap) + (slotW - w) / 2;
    const y = areaTop + 28;
    ctx.fillStyle = C.ink;
    ctx.font = `600 18px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillText(lanes.length > 1 ? `${l.label}  ${formatMs(Math.min(t, l.end - 400))}` : l.label, x, areaTop + 14);
    // frame
    ctx.save();
    roundRect(ctx, x, y, w, h, 12);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.clip();
    const img = frameAt(l, t);
    if (img) ctx.drawImage(img, x, y, w, h);
    else {
      ctx.fillStyle = C.soft;
      ctx.font = `500 15px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("Blank screen", x + w / 2, y + h / 2);
      ctx.textAlign = "left";
    }
    // overlays, in page CSS pixels scaled to the frame
    const layoutW = l.run.fullPage?.width ?? l.run.viewport.width;
    const s = w / layoutW;
    const m = l.run.waterfall?.marks ?? {};
    const box = (r: Rect, color: string, label: string, dashed = false) => {
      if (r.top * s > h) return;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      if (dashed) ctx.setLineDash([8, 6]);
      ctx.strokeRect(x + r.left * s, y + r.top * s, Math.min(r.width * s, w - r.left * s), Math.min(r.height * s, h - r.top * s));
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = `700 12px ${FONT}`;
      const tw = ctx.measureText(label).width + 10;
      ctx.fillRect(x + r.left * s, Math.max(y, y + r.top * s - 18), tw, 18);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, x + r.left * s + 5, Math.max(y, y + r.top * s - 18) + 13);
      ctx.restore();
    };
    if (l.lcpRect && m.lcp && t >= m.lcp) box(l.lcpRect, C.serp, "LCP");
    if (m.load && t >= m.load) l.shifted.forEach((r) => box(r, C.fail, "Moved", true));
    ctx.restore();
    ctx.strokeStyle = C.rule;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, 12);
    ctx.stroke();
  });

  // Panel
  const px = panelX + 10;
  ctx.textAlign = "left";
  ctx.fillStyle = C.soft;
  ctx.font = `500 15px ${FONT}`;
  ctx.fillText("Page load replay", px, 70);
  let url = lanes[0].run.finalUrl.replace(/^https?:\/\//, "");
  ctx.font = `500 15px ${FONT}`;
  while (ctx.measureText(url).width > 350 && url.length > 10) url = url.slice(0, -2);
  ctx.fillStyle = C.ink;
  ctx.fillText(url === lanes[0].run.finalUrl.replace(/^https?:\/\//, "") ? url : `${url}…`, px, 94);
  ctx.font = `600 64px ${FONT}`;
  ctx.fillText(`${(t / 1000).toFixed(1)} s`, px, 170);

  let y = 215;
  lanes.forEach((l) => {
    const m = l.run.waterfall?.marks ?? {};
    if (lanes.length > 1) {
      ctx.fillStyle = C.ink;
      ctx.font = `600 15px ${FONT}`;
      ctx.fillText(l.label, px, y);
      y += 24;
    }
    const steps: [string, number | undefined][] = [
      ["First content (FCP)", m.fcp],
      ["Main content (LCP)", m.lcp],
      ["Fully loaded", m.load],
    ];
    for (const [name, at] of steps) {
      const reached = typeof at === "number" && t >= at;
      ctx.fillStyle = reached ? C.pass : C.rule;
      ctx.beginPath();
      ctx.arc(px + 8, y - 5, 8, 0, Math.PI * 2);
      ctx.fill();
      if (reached) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px + 4, y - 5);
        ctx.lineTo(px + 7, y - 2);
        ctx.lineTo(px + 12, y - 9);
        ctx.stroke();
      }
      ctx.fillStyle = reached ? C.ink : C.soft;
      ctx.font = `${reached ? 600 : 500} 16px ${FONT}`;
      ctx.fillText(name, px + 26, y);
      if (typeof at === "number") {
        ctx.textAlign = "right";
        ctx.fillText(formatMs(at), W - 40, y);
        ctx.textAlign = "left";
      }
      y += 28;
    }
    const n = network(l, t);
    ctx.fillStyle = C.soft;
    ctx.font = `500 14px ${FONT}`;
    ctx.fillText(`${n.flight} file${n.flight === 1 ? "" : "s"} loading, ${formatBytes(n.done)} of ${formatBytes(n.total)}`, px, y);
    y += lanes.length > 1 ? 34 : 40;
  });

  // Caption, in a box sized to its text
  if (lanes.length > 1) {
    ctx.font = `500 14px ${FONT}`;
    const blocks = lanes.map((l) => lines(ctx, caption(l, t), 340, 2));
    const hBox = blocks.reduce((sum, b) => sum + 22 + b.length * 18 + 10, 16);
    ctx.fillStyle = C.mist;
    roundRect(ctx, px - 10, y - 4, 370, hBox, 12);
    ctx.fill();
    let cy = y + 20;
    lanes.forEach((l, k) => {
      ctx.fillStyle = C.ink;
      ctx.font = `600 14px ${FONT}`;
      ctx.fillText(l.label, px + 4, cy);
      ctx.font = `500 14px ${FONT}`;
      blocks[k].forEach((ln, j) => ctx.fillText(ln, px + 4, cy + 20 + j * 18));
      cy += 22 + blocks[k].length * 18 + 10;
    });
  } else {
    ctx.font = `500 17px ${FONT}`;
    const ls = lines(ctx, caption(lanes[0], t), 340, 5);
    ctx.fillStyle = C.mist;
    roundRect(ctx, px - 10, y - 4, 370, 28 + ls.length * 24, 12);
    ctx.fill();
    ctx.fillStyle = C.ink;
    ls.forEach((ln, j) => ctx.fillText(ln, px + 4, y + 22 + j * 24));
  }

  // Timeline
  const tx = 40;
  const tw = W - 80;
  const ty = H - 34;
  ctx.fillStyle = C.rule;
  roundRect(ctx, tx, ty, tw, 6, 3);
  ctx.fill();
  ctx.fillStyle = C.ink;
  roundRect(ctx, tx, ty, Math.max(6, (Math.min(t, total) / total) * tw), 6, 3);
  ctx.fill();
  const m0 = lanes[0].run.waterfall?.marks ?? {};
  ctx.font = `700 11px ${FONT}`;
  ctx.textAlign = "center";
  // Markers; ones that land within a few pixels share a label ("FCP + LCP").
  const marks: [string, number, string][] = [];
  if (typeof m0.fcp === "number") marks.push(["FCP", m0.fcp, C.serp]);
  if (typeof m0.lcp === "number") marks.push(["LCP", m0.lcp, C.fail]);
  if (typeof m0.load === "number") marks.push(["Load", m0.load, C.soft]);
  const groups: { x: number; label: string; color: string }[] = [];
  for (const [k, v, col] of marks) {
    const mx = tx + (v / total) * tw;
    ctx.fillStyle = col;
    ctx.fillRect(mx - 1, ty - 6, 2, 18);
    const near = groups.find((g) => Math.abs(g.x - mx) < 36);
    if (near) near.label += ` + ${k}`;
    else groups.push({ x: mx, label: k, color: col });
  }
  for (const g of groups) {
    ctx.fillStyle = g.color;
    ctx.fillText(g.label, g.x, ty - 10);
  }
  ctx.textAlign = "right";
  ctx.fillStyle = C.soft;
  ctx.font = `500 12px ${FONT}`;
  ctx.fillText("neetshah.com Page Speed Test · from Google Lighthouse snapshots", W - 40, H - 8);
  ctx.textAlign = "left";
}

const SPEEDS = [0.25, 0.5, 1];

export function ReplaySection({ run, other }: { run: SpeedRun; other?: SpeedRun }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [lanes, setLanes] = useState<Lane[] | null>(null);
  const [compare, setCompare] = useState(false);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(0.5);
  const [busy, setBusy] = useState<string | null>(null);
  const raf = useRef<number | null>(null);
  const clock = useRef<{ start: number; from: number } | null>(null);

  const runs = useMemo(() => {
    if (compare && other) return run.strategy === "mobile" ? [run, other] : [other, run];
    return [run];
  }, [compare, other, run]);

  useEffect(() => {
    let alive = true;
    Promise.all(runs.map(makeLane)).then((l) => {
      if (alive) setLanes(l);
    });
    return () => {
      alive = false;
    };
  }, [runs]);

  const total = lanes ? Math.max(...lanes.map((l) => l.end)) : 1;

  const paint = useCallback(
    (time: number) => {
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx && lanes) drawReplay(ctx, lanes, time, total);
    },
    [lanes, total],
  );

  useEffect(() => {
    paint(t);
  }, [paint, t]);

  useEffect(() => {
    if (!playing) return;
    clock.current = { start: performance.now(), from: t >= total ? 0 : t };
    const tick = () => {
      const c = clock.current!;
      const now = c.from + (performance.now() - c.start) * speed;
      if (now >= total) {
        setT(total);
        setPlaying(false);
        return;
      }
      setT(now);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, total]);

  const name = `page-load-${run.finalUrl.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}${compare ? "-compare" : `-${run.strategy}`}`;

  function save(blob: Blob, ext: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function exportVideo() {
    const canvas = canvasRef.current;
    if (!canvas || !lanes || typeof MediaRecorder === "undefined") {
      setBusy("Your browser can't record video. Try Chrome, Edge or Safari, or export a GIF.");
      return;
    }
    const type = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m));
    if (!type) {
      setBusy("Your browser can't record video. Export a GIF instead.");
      return;
    }
    setPlaying(false);
    setBusy("Recording the video…");
    const stream = canvas.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<void>((r) => (rec.onstop = () => r()));
    rec.start();
    const dur = total / speed;
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const step = () => {
        const el = performance.now() - start;
        const time = Math.min(total, el * speed);
        drawReplay(canvas.getContext("2d")!, lanes, time, total);
        setBusy(`Recording the video… ${Math.min(100, Math.round((el / (dur + 1200)) * 100))}%`);
        if (el < dur + 1200) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    rec.stop();
    await done;
    save(new Blob(chunks, { type: type.split(";")[0] }), type.includes("mp4") ? "mp4" : "webm");
    setT(total);
    setBusy(null);
  }

  async function exportGif() {
    if (!lanes) return;
    setPlaying(false);
    setBusy("Making the GIF…");
    const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
    const big = document.createElement("canvas");
    big.width = W;
    big.height = H;
    const small = document.createElement("canvas");
    small.width = 640;
    small.height = 360;
    const bctx = big.getContext("2d")!;
    const sctx = small.getContext("2d", { willReadFrequently: true })!;
    const gif = GIFEncoder();
    const stepMs = 100; // 10 frames a second of output
    const frames = Math.ceil(total / speed / stepMs);
    for (let k = 0; k <= frames; k++) {
      const time = Math.min(total, k * stepMs * speed);
      drawReplay(bctx, lanes, time, total);
      sctx.drawImage(big, 0, 0, 640, 360);
      const { data } = sctx.getImageData(0, 0, 640, 360);
      const palette = quantize(data, 256);
      gif.writeFrame(applyPalette(data, palette), 640, 360, { palette, delay: k === frames ? 2000 : stepMs });
      if (k % 5 === 0) {
        setBusy(`Making the GIF… ${Math.round((k / frames) * 100)}%`);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    gif.finish();
    save(new Blob([gif.bytes() as BlobPart], { type: "image/gif" }), "gif");
    setBusy(null);
  }

  const m = run.waterfall?.marks ?? {};

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-rule bg-white">
        <canvas ref={canvasRef} width={W} height={H} className="block aspect-video w-full" role="img" aria-label={`Replay of the page loading. Now at ${(t / 1000).toFixed(1)} seconds. ${lanes ? caption(lanes[0], t) : ""}`} />
        <div className="space-y-3 border-t border-rule px-4 py-3">
          <div className="relative">
            <input
              type="range"
              min={0}
              max={total}
              step={10}
              value={Math.min(t, total)}
              onChange={(e) => {
                setPlaying(false);
                setT(parseFloat(e.target.value));
              }}
              aria-label="Replay position"
              className="w-full accent-ink"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!lanes || !!busy}
              onClick={() => {
                if (t >= total) setT(0);
                setPlaying((p) => !p);
              }}
              className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-serp disabled:opacity-50"
            >
              {playing ? "Pause" : t >= total ? "Replay" : "Play"}
            </button>
            <div role="group" aria-label="Speed" className="inline-flex rounded-lg bg-mist p-1 text-sm">
              {SPEEDS.map((s) => (
                <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)} className={`rounded-md px-2.5 py-1 font-medium ${speed === s ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}>
                  {s}×
                </button>
              ))}
            </div>
            {[
              ["FCP", m.fcp],
              ["LCP", m.lcp],
              ["Loaded", m.load],
            ].map(([k, v]) =>
              typeof v === "number" ? (
                <button
                  key={k as string}
                  type="button"
                  onClick={() => {
                    setPlaying(false);
                    setT(v as number);
                  }}
                  className="rounded-md border border-rule px-2.5 py-1 text-sm font-medium text-ink-soft hover:border-ink-soft hover:text-ink"
                >
                  Jump to {k}
                </button>
              ) : null,
            )}
            {other && (
              <label className="ml-auto flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="h-4 w-4 accent-ink" />
                Mobile and desktop side by side
              </label>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-rule pt-3">
            <button type="button" disabled={!lanes || !!busy} onClick={exportVideo} className="rounded-md border border-rule bg-white px-3.5 py-2 text-sm font-medium hover:border-ink-soft disabled:opacity-50">
              Download video
            </button>
            <button type="button" disabled={!lanes || !!busy} onClick={exportGif} className="rounded-md border border-rule bg-white px-3.5 py-2 text-sm font-medium hover:border-ink-soft disabled:opacity-50">
              Download GIF
            </button>
            <span className="text-sm text-ink-soft" aria-live="polite">
              {busy ?? `Exports at ${speed}× speed, with the clock, captions and markers included.`}
            </span>
          </div>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-ink-soft">
        Built from the {run.filmstrip.length} snapshots Google&apos;s test takes while the page loads, so the picture changes in steps rather than smoothly. Times are from the real load on Google&apos;s test machine, before the slow-phone simulation, so they&apos;re shorter than the lab metrics. The blue box marks the element Google counts for LCP; red dashed boxes mark elements that moved.
      </p>
    </div>
  );
}
