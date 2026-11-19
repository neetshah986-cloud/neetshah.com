import data from "./vocab.json";

type ClassDef = { p: string[]; s?: string; x?: 1; e?: 1 };
type PropDef = { d: string[]; r: string[]; s?: string; x?: 1 };

const vocab = data as unknown as {
  version: string;
  datatypes: string[];
  classes: Record<string, ClassDef>;
  props: Record<string, PropDef>;
  members: Record<string, string[]>;
};

export const VOCAB_VERSION = vocab.version;
export const DATATYPES = new Set(vocab.datatypes);

export const getClass = (name: string): ClassDef | undefined => vocab.classes[name];
export const getProp = (name: string): PropDef | undefined => vocab.props[name];
export const isEnumeration = (name: string) => vocab.classes[name]?.e === 1;

const memberIndex = new Map<string, string[]>(); // member -> enumeration types
for (const [type, list] of Object.entries(vocab.members)) for (const m of list) memberIndex.set(m, [...(memberIndex.get(m) ?? []), type]);
export const enumTypesOf = (member: string) => memberIndex.get(member) ?? [];
export const membersOf = (enumType: string): string[] => {
  // Members of the enumeration and of its subtypes.
  const out = new Set(vocab.members[enumType] ?? []);
  for (const [name, c] of Object.entries(vocab.classes)) if (c.p.includes(enumType)) for (const m of vocab.members[name] ?? []) out.add(m);
  return [...out];
};

const ancestorCache = new Map<string, Set<string>>();
/** The type itself plus every supertype. */
export function ancestors(type: string): Set<string> {
  const hit = ancestorCache.get(type);
  if (hit) return hit;
  const out = new Set<string>();
  const walk = (t: string) => {
    if (out.has(t)) return;
    out.add(t);
    for (const p of vocab.classes[t]?.p ?? []) walk(p);
  };
  walk(type);
  ancestorCache.set(type, out);
  return out;
}

export const isA = (type: string, target: string) => ancestors(type).has(target);

/** Does the property apply to an item with these types (via domainIncludes and inheritance)? */
export function propertyAppliesTo(prop: PropDef, types: string[]): boolean {
  return types.some((t) => prop.d.some((d) => isA(t, d)));
}

/** Which types does this property belong to, for "it belongs on X" hints. Most general first. */
export const domainsOf = (name: string) => vocab.props[name]?.d ?? [];

// ---------- "Did you mean" ----------

// Damerau-Levenshtein (optimal string alignment): a swapped pair of letters counts as one edit.
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

function suggest(term: string, pool: string[]): string | undefined {
  const lower = term.toLowerCase();
  const exactCase = pool.find((p) => p.toLowerCase() === lower);
  if (exactCase) return exactCase;
  let best: string | undefined;
  let bestD = Infinity;
  for (const p of pool) {
    if (Math.abs(p.length - term.length) > 3) continue;
    const d = distance(lower, p.toLowerCase());
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return bestD <= (term.length >= 6 ? 2 : 1) ? best : undefined;
}

const classNames = Object.keys(vocab.classes);
const propNames = Object.keys(vocab.props);
export const suggestType = (t: string) => suggest(t, classNames);
export const suggestProp = (p: string) => suggest(p, propNames);
