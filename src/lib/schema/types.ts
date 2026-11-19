export type Format = "json-ld" | "microdata" | "rdfa";
export type Severity = "error" | "warning" | "info";

export type Value =
  | { kind: "text"; value: string; raw: "string" | "number" | "boolean" }
  | { kind: "item"; item: Item }
  | { kind: "ref"; id: string };

export type Prop = { name: string; values: Value[] };

export type Item = {
  uid: string; // stable id for linking issues to the UI, e.g. "i3"
  format: Format;
  block: number; // which JSON-LD script / top-level microdata or RDFa item
  types: string[]; // schema.org short names; anything else as the full IRI
  id?: string; // @id / itemid / resource
  props: Prop[];
};

export type Issue = {
  severity: Severity;
  code: string;
  message: string;
  item?: string; // Item.uid
  prop?: string; // property name on that item
  hint?: string;
};

export type Block = {
  index: number;
  format: Format;
  line?: number; // line in the HTML where the block starts
  raw?: string; // JSON-LD source text
  items: Item[]; // top-level items in this block
};

export type RichResultStatus = "eligible" | "warnings" | "invalid" | "retired" | "limited";

export type RichResult = {
  feature: string;
  item: string; // Item.uid
  type: string;
  status: RichResultStatus;
  note?: string;
  missingRequired: string[];
  missingRecommended: string[];
  docs?: string;
};

export type ContentCheck = {
  item: string;
  prop: string;
  value: string;
  found: boolean; // true only when it's in the server HTML's visible text
  // page: in the server HTML. js: only in the page's JavaScript, so it appears after rendering. missing: not visible anywhere.
  where: "page" | "js" | "missing";
};

export type GraphNode = { id: string; item: string; types: string[] };
export type GraphEdge = { from: string; to: string; prop: string; resolved: boolean };

export type Rendering = {
  schemaInServerHtml: boolean; // structured data found in the HTML the server sent
  jsCreatesSchema: boolean; // inline JavaScript builds application/ld+json in the browser
  tagManager: boolean; // Google Tag Manager is installed (schema may be injected through it)
  emptyAppShell: boolean; // the body is an empty <div id="root|app|__next"> filled by JavaScript
  csrValues: number; // structured data values that only appear after JavaScript
  framework?: string;
};

export type Report = {
  source: { kind: "url" | "code"; url?: string; finalUrl?: string; status?: number; bytes?: number; ms?: number };
  vocabVersion: string;
  blocks: Block[];
  items: Record<string, Item>; // every item, nested ones included, by uid
  issues: Issue[];
  richResults: RichResult[];
  content: ContentCheck[] | null; // null when there is no page text to compare (code mode)
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  rendering: Rendering | null; // null for pasted JSON-LD snippets
  counts: { items: number; errors: number; warnings: number; info: number };
};
