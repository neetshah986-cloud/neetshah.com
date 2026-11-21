"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatBytes, formatMs } from "@/lib/speed/metrics";
import type { Rect, SpeedRun } from "@/lib/speed/types";
import { hostOf } from "@/lib/speed/compare";

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

async function makeLane(run: SpeedRun, label?: string): Promise<Lane> {
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
  return { run, label: label ?? (run.strategy === "mobile" ? "Mobile" : "Desktop"), frames, final, lcpRect: lcp, shifted, end };
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

type Phase = { key: "server" | "blank" | "painting" | "finishing" | "done"; label: string; color: string; glow: string };

function phaseAt(l: Lane, t: number): Phase {
  const m = l.run.waterfall?.marks ?? {};
  if (m.htmlEnd && t < m.htmlEnd) return { key: "server", label: "Waiting for the server", color: C.warn, glow: "184,110,0" };
  if (m.fcp && t < m.fcp) return { key: "blank", label: "Blank screen", color: C.warn, glow: "184,110,0" };
  if (m.lcp && t < m.lcp) return { key: "painting", label: "Content appearing", color: C.serp, glow: "26,63,214" };
  if (m.load && t < m.load) return { key: "finishing", label: "Main content visible", color: C.serp, glow: "26,63,214" };
  return { key: "done", label: "Loaded", color: C.pass, glow: "11,138,87" };
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 4 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s}…`;
}

function drawLogo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const k = size / 28;
  ctx.fillStyle = "#1B2A40";
  roundRect(ctx, x, y, size, size, 7 * k);
  ctx.fill();
  ctx.fillStyle = "#6F8CFF";
  roundRect(ctx, x + 6 * k, y + 8 * k, 16 * k, 3 * k, 1.5 * k);
  ctx.fill();
  ctx.fillStyle = "#8A9AB2";
  roundRect(ctx, x + 6 * k, y + 14 * k, 12 * k, 2 * k, 1 * k);
  ctx.fill();
  roundRect(ctx, x + 6 * k, y + 18.5 * k, 9 * k, 2 * k, 1 * k);
  ctx.fill();
}

/** Draws the screen content (snapshot plus overlays) into a rectangle. */
function drawScreen(ctx: CanvasRenderingContext2D, l: Lane, t: number, x: number, y: number, w: number, h: number, radius: number) {
  ctx.save();
  roundRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.clip();
  const img = frameAt(l, t);
  if (img) {
    // cover the screen width, top-aligned (a page is read from the top)
    const ih = (img.naturalHeight / img.naturalWidth) * w;
    ctx.drawImage(img, x, y, w, ih);
  } else {
    ctx.fillStyle = "#F4F6FA";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = C.soft;
    ctx.font = `500 15px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText("Nothing on screen yet", x + w / 2, y + h / 2);
    ctx.textAlign = "left";
  }
  const layoutW = l.run.fullPage?.width ?? l.run.viewport.width;
  const s = w / layoutW;
  const m = l.run.waterfall?.marks ?? {};
  const box = (r: Rect, color: string, label: string, dashed = false) => {
    if (r.top * s > h - 10) return;
    const bx = x + r.left * s;
    const by = y + r.top * s;
    const bw = Math.min(r.width * s, w - r.left * s);
    const bh = Math.min(r.height * s, h - r.top * s);
    ctx.save();
    ctx.fillStyle = color === C.serp ? "rgba(26,63,214,0.08)" : "rgba(196,43,28,0.08)";
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    if (dashed) ctx.setLineDash([8, 6]);
    ctx.strokeRect(bx, by, bw, bh);
    ctx.setLineDash([]);
    ctx.font = `700 12px ${FONT}`;
    const tw = ctx.measureText(label).width + 12;
    const ly = by - 20 < y ? by + 2 : by - 20;
    ctx.fillStyle = color;
    roundRect(ctx, bx, ly, tw, 18, 4);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText(label, bx + 6, ly + 13);
    ctx.restore();
  };
  if (l.lcpRect && m.lcp && t >= m.lcp) box(l.lcpRect, C.serp, "LCP element");
  if (m.load && t >= m.load) l.shifted.forEach((r) => box(r, C.fail, "Moved", true));
  ctx.restore();
}

function drawPhone(ctx: CanvasRenderingContext2D, l: Lane, t: number, cx: number, top: number, maxH: number, maxW: number) {
  const sample = l.frames[0]?.img ?? l.final;
  const aspect = sample ? sample.naturalWidth / sample.naturalHeight : 0.5;
  const bezel = 10;
  let sh = maxH - bezel * 2;
  let sw = sh * aspect;
  if (sw + bezel * 2 > maxW) {
    sw = maxW - bezel * 2;
    sh = sw / aspect;
  }
  const ow = sw + bezel * 2;
  const oh = sh + bezel * 2;
  const x = cx - ow / 2;
  ctx.save();
  ctx.shadowColor = "rgba(14,26,43,0.25)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = C.ink;
  roundRect(ctx, x, top, ow, oh, 30);
  ctx.fill();
  ctx.restore();
  drawScreen(ctx, l, t, x + bezel, top + bezel, sw, sh, 22);
  ctx.fillStyle = C.ink;
  roundRect(ctx, cx - 28, top + bezel + 6, 56, 14, 7);
  ctx.fill();
  return { x, w: ow, h: oh };
}

function drawBrowser(ctx: CanvasRenderingContext2D, l: Lane, t: number, cx: number, top: number, maxH: number, maxW: number) {
  const sample = l.frames[0]?.img ?? l.final;
  const aspect = sample ? sample.naturalWidth / sample.naturalHeight : 1.6;
  const bar = 30;
  let sw = maxW;
  let sh = sw / aspect;
  if (sh + bar > maxH) {
    sh = maxH - bar;
    sw = sh * aspect;
  }
  const x = cx - sw / 2;
  ctx.save();
  ctx.shadowColor = "rgba(14,26,43,0.22)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = "#E7ECF3";
  roundRect(ctx, x, top, sw, sh + bar, 12);
  ctx.fill();
  ctx.restore();
  ["#E06656", "#E9B44C", "#5DBB79"].forEach((c, k) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x + 16 + k * 16, top + bar / 2, 5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = "#fff";
  const pillX = x + 70;
  roundRect(ctx, pillX, top + 6, sw - 84, bar - 12, 9);
  ctx.fill();
  ctx.fillStyle = C.soft;
  ctx.font = `500 11px ${FONT}`;
  ctx.fillText(fitText(ctx, l.run.finalUrl.replace(/^https?:\/\//, ""), sw - 104), pillX + 10, top + bar / 2 + 4);
  ctx.save();
  roundRect(ctx, x, top + bar, sw, sh, 0);
  ctx.restore();
  drawScreen(ctx, l, t, x, top + bar, sw, sh, 0);
  // round the bottom corners back over the screen
  ctx.strokeStyle = "#E7ECF3";
  ctx.lineWidth = 2;
  roundRect(ctx, x, top, sw, sh + bar, 12);
  ctx.stroke();
  return { x, w: sw, h: sh + bar };
}

export function drawReplay(ctx: CanvasRenderingContext2D, lanes: Lane[], t: number, total: number) {
  const compare = lanes.length > 1;
  const lead = lanes[0];
  const phase = phaseAt(lead, t);

  // Background with a glow that follows the loading phase
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);
  const areaRight = 820;
  const g = ctx.createRadialGradient(areaRight / 2, 330, 40, areaRight / 2, 330, 460);
  g.addColorStop(0, `rgba(${phase.glow},0.16)`);
  g.addColorStop(1, `rgba(${phase.glow},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 64, areaRight + 100, H - 64);
  // faint dot grid
  ctx.fillStyle = "rgba(14,26,43,0.06)";
  for (let gx = 20; gx < W; gx += 28) for (let gy = 84; gy < H - 70; gy += 28) ctx.fillRect(gx, gy, 2, 2);

  // Brand header
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, 64);
  drawLogo(ctx, 28, 16, 32);
  ctx.textAlign = "left";
  ctx.fillStyle = "#fff";
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText("neetshah.com", 72, 40);
  const bw = ctx.measureText("neetshah.com").width;
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(72 + bw + 14, 22, 1.5, 22);
  ctx.fillStyle = "#C9D3E3";
  ctx.font = `500 20px ${FONT}`;
  ctx.fillText("Page Speed Test", 72 + bw + 30, 40);
  ctx.font = `500 15px ${FONT}`;
  const race = compare && lanes[0].run.strategy === lanes[1].run.strategy;
  const tested = race
    ? `${lead.run.strategy === "mobile" ? "Mobile" : "Desktop"} race: ${lanes.map((l) => l.label).join(" vs ")}`
    : `${compare ? "Mobile and desktop" : lead.label} test of ${lead.run.finalUrl.replace(/^https?:\/\//, "")}`;
  const tt = fitText(ctx, tested, 520);
  const tw = ctx.measureText(tt).width;
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  roundRect(ctx, W - 28 - tw - 28, 17, tw + 28, 30, 15);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillText(tt, W - 28 - tw - 14, 37);

  // Devices
  const top = 92;
  const deviceH = compare ? 520 : 440;
  if (compare) {
    lanes.forEach((l, k) => {
      const bothDesktop = lanes.every((x) => x.run.strategy === "desktop");
      const cx = bothDesktop ? (k === 0 ? 212 : 620) : k === 0 ? 200 : 590;
      const isPhone = l.run.strategy === "mobile";
      ctx.fillStyle = C.ink;
      ctx.font = `600 16px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(fitText(ctx, l.label, 360), cx, top + 4);
      ctx.textAlign = "left";
      if (isPhone) drawPhone(ctx, l, t, cx, top + 18, deviceH, 300);
      else drawBrowser(ctx, l, t, cx, top + 18 + 80, deviceH - 80, bothDesktop ? 392 : 400);
    });
  } else if (lead.run.strategy === "mobile") drawPhone(ctx, lead, t, areaRight / 2, top, deviceH, 400);
  else drawBrowser(ctx, lead, t, areaRight / 2, top + 6, deviceH, 740);

  // Panel
  const px = 860;
  const pw = W - px - 32;
  ctx.textAlign = "left";
  // status pill
  ctx.font = `600 14px ${FONT}`;
  const pillW = ctx.measureText(phase.label).width + 34;
  ctx.fillStyle = phase.color;
  ctx.globalAlpha = 0.12;
  roundRect(ctx, px, 92, pillW, 28, 14);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = phase.color;
  ctx.beginPath();
  ctx.arc(px + 15, 106, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillText(phase.label, px + 26, 111);
  // clock
  ctx.fillStyle = C.ink;
  ctx.font = `700 76px ${FONT}`;
  ctx.fillText((t / 1000).toFixed(1), px - 3, 196);
  const cw = ctx.measureText((t / 1000).toFixed(1)).width;
  ctx.font = `600 30px ${FONT}`;
  ctx.fillStyle = C.soft;
  ctx.fillText("s", px + cw + 6, 196);

  let y = 226;
  lanes.forEach((l) => {
    const m = l.run.waterfall?.marks ?? {};
    if (compare) {
      ctx.fillStyle = C.ink;
      ctx.font = `700 14px ${FONT}`;
      ctx.fillText(l.label, px, y + 4);
      y += 14;
    }
    const chips: [string, string, number | undefined][] = [
      ["First content", "FCP", m.fcp],
      ["Main content (LCP)", "LCP", m.lcp],
      ["Fully loaded", "Loaded", m.load],
    ];
    if (compare) {
      // one compact row of three chips per device
      const cw2 = (pw - 16) / 3;
      chips.forEach(([, short, at], k) => {
        const reached = typeof at === "number" && t >= at;
        const cx2 = px + k * (cw2 + 8);
        ctx.fillStyle = reached ? "rgba(11,138,87,0.10)" : "#fff";
        roundRect(ctx, cx2, y, cw2, 46, 10);
        ctx.fill();
        ctx.strokeStyle = reached ? "rgba(11,138,87,0.35)" : C.rule;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = reached ? C.pass : C.soft;
        ctx.font = `600 12px ${FONT}`;
        ctx.fillText(`${reached ? "✓ " : ""}${short}`, cx2 + 10, y + 18);
        ctx.fillStyle = reached ? C.ink : C.soft;
        ctx.font = `700 15px ${FONT}`;
        ctx.fillText(typeof at === "number" ? formatMs(at) : "–", cx2 + 10, y + 37);
      });
      y += 54;
    } else
      for (const [name, , at] of chips) {
        const reached = typeof at === "number" && t >= at;
        ctx.fillStyle = reached ? "rgba(11,138,87,0.10)" : "#fff";
        roundRect(ctx, px, y, pw, 36, 10);
        ctx.fill();
        ctx.strokeStyle = reached ? "rgba(11,138,87,0.35)" : C.rule;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        const cy = y + 18;
        ctx.fillStyle = reached ? C.pass : C.rule;
        ctx.beginPath();
        ctx.arc(px + 18, cy, 8, 0, Math.PI * 2);
        ctx.fill();
        if (reached) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px + 14, cy);
          ctx.lineTo(px + 17, cy + 3);
          ctx.lineTo(px + 22, cy - 3);
          ctx.stroke();
        }
        ctx.fillStyle = reached ? C.ink : C.soft;
        ctx.font = `${reached ? 600 : 500} 15px ${FONT}`;
        ctx.fillText(name, px + 34, cy + 5);
        if (typeof at === "number") {
          ctx.textAlign = "right";
          ctx.fillText(formatMs(at), px + pw - 12, cy + 5);
          ctx.textAlign = "left";
        }
        y += 44;
      }
    // download progress
    const n = network(l, t);
    const frac = n.total ? n.done / n.total : 0;
    ctx.fillStyle = C.rule;
    roundRect(ctx, px, y + 2, pw, 6, 3);
    ctx.fill();
    ctx.fillStyle = phaseAt(l, t).color;
    roundRect(ctx, px, y + 2, Math.max(6, pw * frac), 6, 3);
    ctx.fill();
    ctx.fillStyle = C.soft;
    ctx.font = `500 13px ${FONT}`;
    ctx.fillText(`${formatBytes(n.done)} of ${formatBytes(n.total)} downloaded${n.flight ? `, ${n.flight} file${n.flight === 1 ? "" : "s"} in progress` : ""}`, px, y + 26);
    y += compare ? 40 : 48;
  });

  // caption bubble
  ctx.font = `500 ${compare ? 14 : 17}px ${FONT}`;
  const blocks = lanes.map((l) => lines(ctx, caption(l, t), pw - 28, compare ? 2 : 4));
  const lh = compare ? 18 : 23;
  const hBox = 34 + blocks.reduce((sum, b) => sum + b.length * lh + (compare ? 22 : 4), 0);
  const maxY = compare ? 612 : 520;
  const by = Math.min(y, maxY - hBox);
  ctx.fillStyle = "#fff";
  roundRect(ctx, px, by, pw, hBox, 14);
  ctx.fill();
  ctx.fillStyle = phase.color;
  roundRect(ctx, px, by, 5, hBox, 2.5);
  ctx.fill();
  ctx.fillStyle = C.soft;
  ctx.font = `600 12px ${FONT}`;
  ctx.fillText("What's happening", px + 18, by + 22);
  let cy = by + 46;
  lanes.forEach((l, k) => {
    if (compare) {
      ctx.fillStyle = C.ink;
      ctx.font = `700 13px ${FONT}`;
      ctx.fillText(l.label, px + 18, cy);
      cy += 18;
    }
    ctx.fillStyle = C.ink;
    ctx.font = `500 ${compare ? 14 : 17}px ${FONT}`;
    blocks[k].forEach((ln, j) => ctx.fillText(ln, px + 18, cy + j * lh));
    cy += blocks[k].length * lh + (compare ? 8 : 0);
  });

  // Filmstrip (single device)
  if (!compare && lead.frames.length) {
    const fy = 540;
    const fh = 70;
    const sample = lead.frames[0].img;
    const fw = Math.min(110, fh * (sample.naturalWidth / sample.naturalHeight));
    const gap = 10;
    const stripW = lead.frames.length * fw + (lead.frames.length - 1) * gap;
    const sx = Math.max(32, (areaRight + 40 - stripW) / 2);
    const current = lead.frames.reduce((k, f, i) => (f.t <= t ? i : k), -1);
    lead.frames.forEach((f, i) => {
      const fx = sx + i * (fw + gap);
      ctx.save();
      ctx.globalAlpha = f.t <= t ? 1 : 0.35;
      roundRect(ctx, fx, fy, fw, fh, 6);
      ctx.clip();
      ctx.fillStyle = "#fff";
      ctx.fillRect(fx, fy, fw, fh);
      ctx.drawImage(f.img, fx, fy, fw, (f.img.naturalHeight / f.img.naturalWidth) * fw);
      ctx.restore();
      ctx.strokeStyle = i === current ? phase.color : C.rule;
      ctx.lineWidth = i === current ? 3 : 1;
      roundRect(ctx, fx, fy, fw, fh, 6);
      ctx.stroke();
      ctx.fillStyle = i === current ? C.ink : C.soft;
      ctx.font = `${i === current ? 700 : 500} 11px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(formatMs(f.t), fx + fw / 2, fy + fh + 14);
      ctx.textAlign = "left";
    });
  }

  // Timeline coloured by phase
  const tx = 32;
  const twd = W - 64;
  const ty = H - 62;
  const m0 = lead.run.waterfall?.marks ?? {};
  const xAt = (v: number) => tx + (Math.min(v, total) / total) * twd;
  const segs: [number, number, string][] = [];
  const b1 = m0.fcp ?? 0;
  const b2 = Math.max(b1, m0.lcp ?? b1);
  const b3 = Math.max(b2, m0.load ?? b2);
  segs.push([0, b1, C.warn], [b1, b2, C.serp], [b2, b3, "#6F8CFF"], [b3, total, C.pass]);
  for (const [a0, a1, col] of segs) {
    if (a1 <= a0) continue;
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.22;
    ctx.fillRect(xAt(a0), ty, xAt(a1) - xAt(a0), 10);
    ctx.globalAlpha = 1;
    if (t > a0) ctx.fillRect(xAt(a0), ty, xAt(Math.min(t, a1)) - xAt(a0), 10);
  }
  // playhead
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  ctx.arc(xAt(t), ty + 5, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(xAt(t), ty + 5, 3, 0, Math.PI * 2);
  ctx.fill();
  // markers, merged when they land together
  const marks: [string, number, string][] = [];
  if (typeof m0.fcp === "number") marks.push(["FCP", m0.fcp, C.serp]);
  if (typeof m0.lcp === "number") marks.push(["LCP", m0.lcp, C.fail]);
  if (typeof m0.load === "number") marks.push(["Loaded", m0.load, C.pass]);
  const groups: { x: number; label: string; color: string }[] = [];
  for (const [k, v, col] of marks) {
    const mx = xAt(v);
    const near = groups.find((gr) => Math.abs(gr.x - mx) < 44);
    if (near) near.label += ` + ${k}`;
    else groups.push({ x: mx, label: k, color: col });
  }
  ctx.font = `700 12px ${FONT}`;
  ctx.textAlign = "center";
  for (const gr of groups) {
    ctx.fillStyle = gr.color;
    ctx.fillRect(gr.x - 1, ty - 4, 2, 18);
    ctx.fillText(gr.label, gr.x, ty + 30);
  }
  ctx.textAlign = "right";
  // call to action
  ctx.font = `600 13px ${FONT}`;
  ctx.fillStyle = C.ink;
  ctx.fillText("Test yours free at neetshah.com/tools/page-speed-test", W - 32, H - 8);
  ctx.textAlign = "left";
}

const SPEEDS = [0.25, 0.5, 1];


/** `other` is the same page on the other device; `versus` is a competitor's page on the same device. */
export function ReplaySection({ run, other, versus }: { run: SpeedRun; other?: SpeedRun; versus?: SpeedRun }) {
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
    if (versus) return [run, versus];
    if (compare && other) return run.strategy === "mobile" ? [run, other] : [other, run];
    return [run];
  }, [compare, other, run, versus]);

  useEffect(() => {
    let alive = true;
    const label = (r: SpeedRun) => (versus ? hostOf(r.finalUrl) : undefined);
    Promise.all(runs.map((r) => makeLane(r, label(r)))).then((l) => {
      if (alive) setLanes(l);
    });
    return () => {
      alive = false;
    };
  }, [runs, versus]);

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

  const slug = (r: SpeedRun, n: number) => hostOf(r.finalUrl).replace(/[^a-z0-9]+/gi, "-").slice(0, n);
  const name = versus
    ? `neetshah-page-load-${slug(run, 28)}-vs-${slug(versus, 28)}-${run.strategy}`
    : `neetshah-page-load-${slug(run, 40)}${compare ? "-compare" : `-${run.strategy}`}`;

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
            {other && !versus && (
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
