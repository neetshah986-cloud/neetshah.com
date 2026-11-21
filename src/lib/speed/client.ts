// Browser side: run one PageSpeed test through our API (background job + polling), and run many with a limit.
import type { SpeedRun, Strategy } from "./types";

type Started = { run?: SpeedRun; job?: string; error?: string };

async function post(url: string, strategy: Strategy, fresh: boolean): Promise<Started> {
  const res = await fetch("/api/page-speed", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, strategy, fresh }) });
  const data = await res.json().catch(() => null);
  if (!data) throw new Error("The server didn't answer. Check your connection and try again.");
  if (!res.ok) throw new Error(data.error ?? "The test failed. Try again.");
  return data;
}

/** Tests one page on one device. Google can take over a minute on heavy pages, so the test runs as a job we check on. */
export async function fetchRun(url: string, strategy: Strategy, fresh = false): Promise<SpeedRun> {
  let data = await post(url, strategy, fresh);
  const deadline = Date.now() + 210_000;
  let restarted = false;
  let tooMany = 0;
  while (!data.run && data.job) {
    if (Date.now() > deadline) throw new Error("Google is taking unusually long to test this page. Try again in a few minutes.");
    await new Promise((r) => setTimeout(r, 2500));
    const res = await fetch(`/api/page-speed?job=${encodeURIComponent(data.job)}`, { cache: "no-store" });
    const poll = await res.json().catch(() => null);
    if (!poll) continue; // a hiccup on one check: try the next one
    if (res.status === 404 && !restarted) {
      // The server restarted mid-test (for example during a deploy): start again once.
      restarted = true;
      data = await post(url, strategy, false);
      continue;
    }
    if (res.status === 429 && tooMany++ < 5) continue;
    if (!res.ok) throw new Error(poll.error === "lost" ? "The test was interrupted. Try again." : (poll.error ?? "The test failed. Try again."));
    if (poll.run) data = { run: poll.run };
  }
  if (!data.run) throw new Error("The test didn't return a result. Try again.");
  return data.run;
}

/** Runs tasks with at most `limit` at a time, reporting each result as it arrives. */
export async function runLimited<T>(tasks: (() => Promise<T>)[], limit: number, onDone: (i: number, r: { value?: T; error?: string }) => void) {
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      try {
        onDone(i, { value: await tasks[i]() });
      } catch (e) {
        onDone(i, { error: e instanceof Error ? e.message : "The test failed." });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}

/** Adds https:// when someone types a bare domain. */
export function normaliseUrl(s: string) {
  const t = s.trim();
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}
