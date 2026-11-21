// Browser side: check one page's structured data through our API, without the page source.
import type { Report } from "./types";

export async function fetchSchema(url: string): Promise<Report> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("/api/schema-validator", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "url", url, lite: true }) });
    const data = await res.json().catch(() => null);
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 4000));
      continue;
    }
    if (!data) throw new Error("The server didn't answer. Check your connection and try again.");
    if (!res.ok) throw new Error(data.error ?? "Couldn't check that page.");
    return data as Report;
  }
}
