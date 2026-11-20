import type { MetricKey, Rating } from "./metrics";

export type Strategy = "mobile" | "desktop";

export type Rect = { top: number; left: number; width: number; height: number };

/** An element on the page, as Lighthouse reports it. */
export type NodeRef = {
  selector: string;
  snippet: string;
  label: string;
  rect?: Rect;
  path?: string;
};

export type MetricValue = { key: MetricKey; value: number; display: string; rating: Rating };

export type FieldMetric = MetricValue & {
  /** Share of page loads that were good, needed improvement and poor. */
  distribution: [number, number, number];
};

export type FieldData = {
  scope: "url" | "origin";
  metrics: Partial<Record<MetricKey, FieldMetric>>;
  /** Core Web Vitals assessment: null when there isn't enough data. */
  passed: boolean | null;
};

export type Impact = "high" | "medium" | "low";

export type CodeBlock = { label: string; lang: "html" | "css" | "js" | "text" | "apache" | "nginx"; code: string };

export type FindingElement = {
  node: NodeRef;
  note?: string;
  /** The element's current HTML, and the same element with the fix applied. */
  current?: string;
  fixed?: string;
};

export type FindingResource = { url: string; bytes?: number; wastedBytes?: number; ms?: number; note?: string; thirdParty?: boolean };

export type Finding = {
  id: string;
  auditId: string;
  title: string;
  /** What's wrong, in one or two plain sentences. */
  summary: string;
  /** Why it matters, for a beginner. */
  why: string;
  metrics: MetricKey[];
  savingsMs?: number;
  savingsBytes?: number;
  savingsCls?: number;
  impact: Impact;
  weight: number;
  elements: FindingElement[];
  resources: FindingResource[];
  steps: string[];
  code: CodeBlock[];
  /** Who usually makes the change. */
  owner?: string;
};

export type Phase = { label: string; ms: number; share: number; tip: string; main: boolean };

export type Diagnosis = {
  metric: MetricKey;
  rating: Rating;
  value: string;
  headline: string;
  detail: string;
  node?: NodeRef;
  phases?: Phase[];
  causes?: { node?: NodeRef; text: string; score?: number }[];
  scripts?: { url: string; ms: number; thirdParty: boolean }[];
  findingIds: string[];
};

export type CrawlerView = {
  ttfbMs?: number;
  htmlBytes?: number;
  htmlTransferBytes?: number;
  compressed?: boolean;
  protocol?: string;
  redirects: number;
  requests: number;
  totalBytes: number;
  jsBytes: number;
  rawWords?: number;
  rawHasH1?: boolean;
  rawTitle?: string;
  appShell?: boolean;
  rawError?: string;
};

export type SpeedRun = {
  strategy: Strategy;
  requestedUrl: string;
  finalUrl: string;
  fetchedAt: string;
  lighthouseVersion: string;
  score: number;
  lab: Partial<Record<MetricKey, MetricValue>>;
  field: FieldData | null;
  originField: FieldData | null;
  screenshot?: string;
  filmstrip: { ms: number; data: string }[];
  fullPage?: { data: string; width: number; height: number };
  viewport: { width: number; height: number };
  diagnoses: Diagnosis[];
  findings: Finding[];
  passed: string[];
  weight: { type: string; label: string; requests: number; bytes: number }[];
  thirdParties: { name: string; bytes: number; mainThreadMs: number }[];
  crawler: CrawlerView;
  warnings: string[];
};
