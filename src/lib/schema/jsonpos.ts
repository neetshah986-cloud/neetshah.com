// A JSON parser that remembers where each object and key starts, so the UI can jump to it in the source.
// Call only on text that JSON.parse has already accepted.

export type Loc = { start: number; end: number; keys: Map<string, number> };

export function parseWithLocations(text: string, base = 0): { value: unknown; locs: WeakMap<object, Loc> } {
  const locs = new WeakMap<object, Loc>();
  let i = 0;

  const ws = () => {
    while (i < text.length && (text[i] === " " || text[i] === "\n" || text[i] === "\r" || text[i] === "\t")) i++;
  };

  const str = (): string => {
    const start = i;
    i++; // opening quote
    while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
    i++; // closing quote
    return JSON.parse(text.slice(start, i));
  };

  const value = (): unknown => {
    ws();
    const c = text[i];
    if (c === "{") {
      const start = i;
      const obj: Record<string, unknown> = {};
      const keys = new Map<string, number>();
      i++;
      ws();
      if (text[i] === "}") i++;
      else
        for (;;) {
          ws();
          const keyAt = i;
          const k = str();
          ws();
          i++; // colon
          obj[k] = value();
          if (!keys.has(k)) keys.set(k, base + keyAt);
          ws();
          if (text[i] === ",") {
            i++;
            continue;
          }
          i++; // closing brace
          break;
        }
      locs.set(obj, { start: base + start, end: base + i, keys });
      return obj;
    }
    if (c === "[") {
      const start = i;
      const arr: unknown[] = [];
      i++;
      ws();
      if (text[i] === "]") i++;
      else
        for (;;) {
          arr.push(value());
          ws();
          if (text[i] === ",") {
            i++;
            continue;
          }
          i++;
          break;
        }
      locs.set(arr, { start: base + start, end: base + i, keys: new Map() });
      return arr;
    }
    if (c === '"') return str();
    const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?|^true|^false|^null/.exec(text.slice(i, i + 40));
    if (!m) throw new SyntaxError(`Unexpected token at position ${i}`);
    i += m[0].length;
    return m[0] === "true" ? true : m[0] === "false" ? false : m[0] === "null" ? null : Number(m[0]);
  };

  return { value: value(), locs };
}
