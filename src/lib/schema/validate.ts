import { shortName } from "./extract";
import type { GraphEdge, GraphNode, Issue, Item, Value } from "./types";
import {
  DATATYPES,
  domainsOf,
  enumTypesOf,
  getClass,
  getProp,
  isA,
  isEnumeration,
  membersOf,
  propertyAppliesTo,
  suggestProp,
  suggestType,
} from "./vocab";

const isExternalTerm = (t: string) => t.includes(":") || t.includes("/");
const list = (xs: string[], max = 4) =>
  xs.length <= max ? xs.join(", ") : `${xs.slice(0, max).join(", ")} and ${xs.length - max} more`;

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const ISO_DATETIME = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])[T ]([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?(Z|[+-]([01]\d|2[0-3]):?[0-5]\d)?$/;
const ISO_TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?(Z|[+-]([01]\d|2[0-3]):?[0-5]\d)?$/;
const ISO_DURATION = /^P(?!$)(\d+(\.\d+)?Y)?(\d+(\.\d+)?M)?(\d+(\.\d+)?W)?(\d+(\.\d+)?D)?(T(?=\d)(\d+(\.\d+)?H)?(\d+(\.\d+)?M)?(\d+(\.\d+)?S)?)?$/;
const NUMBER = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
const INTEGER = /^-?\d+$/;
const ABS_URL = /^https?:\/\/[^\s/$.?#][^\s]*$/i;
// ISO 4217 codes in common use; anything else that is 3 capital letters gets a softer note.
const CURRENCIES = new Set(
  "AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XOF XPF YER ZAR ZMW ZWL".split(" "),
);
const URL_PROPS = new Set(["url", "image", "logo", "sameAs", "thumbnailUrl", "contentUrl", "embedUrl", "item", "mainEntityOfPage", "acquireLicensePage", "license", "hasMap", "significantLink", "relatedLink"]);

type Ctx = {
  garbled: Set<string>; // items already flagged for encoding problems
  issues: Issue[];
  byId: Map<string, Item[]>;
  edges: GraphEdge[];
  seen: Set<string>;
};

const push = (ctx: Ctx, issue: Issue) => ctx.issues.push(issue);
const nodeKey = (item: Item) => item.id ?? item.uid;

function checkTypes(item: Item, ctx: Ctx, nested: boolean): string[] {
  // A nested node identified by @id doesn't need a type (Google's breadcrumb examples use {"@id": url, "name": ...}).
  if (item.types.length === 0 && nested && item.id) return [];
  if (item.types.length === 0) {
    push(ctx, {
      severity: nested ? "warning" : "error",
      code: "no-type",
      item: item.uid,
      message: nested
        ? "This nested object has no @type, so search engines can't tell what it is."
        : "This item has no @type, so search engines can't tell what it describes.",
      hint: 'Add "@type", for example "Organization" or "Product".',
    });
    return [];
  }
  const known: string[] = [];
  for (const t of item.types) {
    if (isExternalTerm(t)) {
      push(ctx, { severity: "info", code: "external-type", item: item.uid, message: `${t} isn't a schema.org type, so it isn't checked here.` });
      continue;
    }
    const def = getClass(t);
    if (!def) {
      if (enumTypesOf(t).length) {
        push(ctx, {
          severity: "error",
          code: "enum-as-type",
          item: item.uid,
          message: `${t} is a value of ${enumTypesOf(t)[0]}, not a type.`,
          hint: `Use it as a property value instead, for example "availability": "https://schema.org/${t}".`,
        });
        continue;
      }
      const s = suggestType(t);
      push(ctx, {
        severity: "error",
        code: "unknown-type",
        item: item.uid,
        message: `${t} isn't a schema.org type.`,
        hint: s ? `Did you mean ${s}? Type names are case-sensitive.` : "Check the spelling against schema.org/docs/full.html.",
      });
      continue;
    }
    known.push(t);
    if (def.s) push(ctx, { severity: "warning", code: "superseded-type", item: item.uid, message: `${t} has been superseded by ${def.s}.`, hint: `Use ${def.s} instead.` });
    if (def.x) push(ctx, { severity: "info", code: "pending-type", item: item.uid, message: `${t} is in schema.org's pending area, so its definition may still change.` });
  }
  return known;
}

// UTF-8 text decoded as Windows-1252 or Latin-1: ’ becomes â€™, é becomes Ã©, a non-breaking space becomes Â.
const MOJIBAKE = /â€[™˜œ“”\u009d\u0153\u2122\u02dc\u201c\u201d\u2018\u2019\u2013\u2014¦¢]|Ã[\u0080-\u00bf¡-ÿ]|Â[\u00a0-\u00bf ]|ï¿½|\ufffd/;
const repairMojibake = (s: string) => {
  try {
    const bytes = Uint8Array.from([...s].map((ch) => {
      const c = ch.charCodeAt(0);
      const cp1252: Record<number, number> = { 0x20ac: 0x80, 0x201a: 0x82, 0x192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x2c6: 0x88, 0x2030: 0x89, 0x160: 0x8a, 0x2039: 0x8b, 0x152: 0x8c, 0x17d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x2dc: 0x98, 0x2122: 0x99, 0x161: 0x9a, 0x203a: 0x9b, 0x153: 0x9c, 0x17e: 0x9e, 0x178: 0x9f };
      if (c < 256) return c;
      if (cp1252[c] !== undefined) return cp1252[c];
      throw new Error("not mojibake");
    }));
    const fixed = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return fixed !== s ? fixed : null;
  } catch {
    return null;
  }
};

function checkText(item: Item, prop: string, value: string, raw: string, ranges: string[], ctx: Ctx) {
  const v = value.trim();
  const at = { item: item.uid, prop };
  if (MOJIBAKE.test(v) && !ctx.garbled.has(item.uid)) {
    ctx.garbled.add(item.uid);
    const sample = v.slice(Math.max(0, v.search(MOJIBAKE) - 20), v.search(MOJIBAKE) + 30);
    const fixed = repairMojibake(sample);
    push(ctx, {
      severity: "warning",
      code: "mojibake",
      ...at,
      message: `${prop} contains garbled characters: "…${sample}…"`,
      hint: `This is an encoding mistake: UTF-8 text was read as a different character set${fixed ? `, so it should read "…${fixed}…"` : ""}. Search engines and AI answers will show the garbled text. Save the content as UTF-8 and make sure the page is served with charset=utf-8.`,
    });
  }
  if (!v) {
    push(ctx, { severity: "warning", code: "empty-value", ...at, message: `${prop} is empty.`, hint: "Remove the property or give it a value." });
    return;
  }

  // Enumerations (availability, eventStatus, itemCondition, dayOfWeek...)
  const enums = ranges.filter((r) => isEnumeration(r));
  if (enums.length) {
    const member = shortName(v);
    const allowed = [...new Set(enums.flatMap(membersOf))];
    if (allowed.includes(member)) {
      if (!/^https?:\/\/schema\.org\//i.test(v) && !v.startsWith("schema:"))
        push(ctx, { severity: "info", code: "enum-short", ...at, message: `${prop} uses "${v}".`, hint: `The canonical form is "https://schema.org/${member}". Google accepts both.` });
      return;
    }
    const canTakeText = ranges.some((r) => DATATYPES.has(r));
    if (!canTakeText) {
      const close = allowed.find((m) => m.toLowerCase() === member.toLowerCase().replace(/[\s_-]/g, ""));
      push(ctx, {
        severity: "error",
        code: "enum-value",
        ...at,
        message: `"${v}" isn't a valid ${enums[0]} value for ${prop}.`,
        hint: close ? `Did you mean "https://schema.org/${close}"?` : `Use one of: ${list(allowed.map((m) => `https://schema.org/${m}`), 5)}.`,
      });
      return;
    }
  }

  const has = (t: string) => ranges.includes(t);
  const textOk = has("Text") || has("PronounceableText") || has("CssSelectorType") || has("XPathType");

  if (has("Duration") && !textOk) {
    if (!ISO_DURATION.test(v))
      push(ctx, { severity: "error", code: "duration", ...at, message: `${prop} "${v}" isn't an ISO 8601 duration.`, hint: 'Write durations like "PT1H30M" (1 hour 30 minutes) or "P2D" (2 days).' });
    return;
  }

  const dateish = has("Date") || has("DateTime") || has("Time");
  if (dateish && !textOk) {
    const ok = (has("Date") && ISO_DATE.test(v)) || (has("DateTime") && (ISO_DATETIME.test(v) || ISO_DATE.test(v))) || (has("Time") && ISO_TIME.test(v));
    if (!ok) {
      const want = has("DateTime") ? '"2026-11-20" or "2026-11-20T09:30:00+05:30"' : has("Date") ? '"2026-11-20"' : '"09:30:00"';
      push(ctx, { severity: "error", code: "date-format", ...at, message: `${prop} "${v}" isn't in ISO 8601 format.`, hint: `Use ${want}.` });
      return;
    }
    if (has("DateTime") && ISO_DATE.test(v) && ["datePublished", "dateModified", "uploadDate", "startDate", "endDate"].includes(prop))
      push(ctx, { severity: "info", code: "date-no-time", ...at, message: `${prop} has a date but no time or timezone.`, hint: "Google recommends a full timestamp with timezone, for example 2026-11-20T09:30:00+05:30." });
    return;
  }

  const numeric = has("Number") || has("Integer") || has("Float");
  if (numeric && !textOk) {
    if (!(has("Integer") && !has("Number") ? INTEGER.test(v) : NUMBER.test(v)))
      push(ctx, { severity: "error", code: "number-format", ...at, message: `${prop} "${v}" isn't a number.`, hint: "Use digits only, with a dot for decimals." });
    return;
  }

  if (has("Boolean") && !textOk) {
    if (!/^(true|false|https?:\/\/schema\.org\/(True|False))$/i.test(v))
      push(ctx, { severity: "error", code: "boolean-format", ...at, message: `${prop} "${v}" isn't true or false.` });
    return;
  }

  if (has("URL") && !textOk) {
    if (raw !== "string" || /\s/.test(v))
      push(ctx, { severity: "error", code: "url-format", ...at, message: `${prop} "${v}" isn't a URL.` });
    else if (!ABS_URL.test(v))
      push(ctx, { severity: "warning", code: "url-relative", ...at, message: `${prop} is a relative URL.`, hint: "Use an absolute URL starting with https:// so it resolves the same everywhere." });
    else if (v.startsWith("http://") && URL_PROPS.has(prop))
      push(ctx, { severity: "info", code: "url-http", ...at, message: `${prop} uses http://.`, hint: "Use the https:// version if your site supports it." });
    return;
  }

  // Text where only objects are expected (author: "Jane", location: "Mumbai").
  // Plain numbers are accepted for measurements (width: 1200), so they aren't flagged.
  if (raw === "number" || (NUMBER.test(v) && ranges.some((r) => ["QuantitativeValue", "Distance", "Mass", "Energy", "MonetaryAmount"].includes(r)))) return;
  if (!ranges.some((r) => DATATYPES.has(r)) && !has("Duration") && !enums.length) {
    if (ABS_URL.test(v)) return; // a URL standing in for an entity is acceptable
    if (/^\.?\//.test(v) && !/\s/.test(v)) {
      push(ctx, { severity: "warning", code: "url-relative", ...at, message: `${prop} is a relative URL.`, hint: "Use an absolute URL starting with https:// so it resolves the same everywhere." });
      return;
    }
    push(ctx, {
      severity: "info",
      code: "text-for-object",
      ...at,
      message: `${prop} is plain text, but schema.org expects ${list(ranges, 3)} here.`,
      hint: `Text is allowed, but an object such as {"@type": "${ranges[0]}", "name": "${v.slice(0, 40)}"} is clearer for search engines.`,
    });
  }
}

function checkValueFormats(item: Item, ctx: Ctx) {
  const first = (name: string) => {
    const v = item.props.find((p) => p.name === name)?.values[0];
    return v?.kind === "text" ? v.value.trim() : undefined;
  };
  const at = (prop: string) => ({ item: item.uid, prop });

  const currency = first("priceCurrency");
  if (currency !== undefined) {
    if (!/^[A-Z]{3}$/.test(currency))
      push(ctx, { severity: "error", code: "currency", ...at("priceCurrency"), message: `priceCurrency "${currency}" isn't a 3-letter ISO 4217 code.`, hint: currency.length === 1 ? 'Use the code, not the symbol, for example "INR" instead of "₹".' : 'Use an uppercase code such as "INR", "USD" or "AED".' });
    else if (!CURRENCIES.has(currency))
      push(ctx, { severity: "warning", code: "currency-unknown", ...at("priceCurrency"), message: `priceCurrency "${currency}" isn't a known ISO 4217 currency code.` });
  }

  for (const name of ["price", "lowPrice", "highPrice"]) {
    const price = first(name);
    if (price === undefined) continue;
    if (!NUMBER.test(price)) {
      const cleaned = price.replace(/[^\d.,]/g, "");
      const suggestion = cleaned.includes(",") && !cleaned.includes(".") && /,\d{2}$/.test(cleaned) ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
      push(ctx, {
        severity: "error",
        code: "price-format",
        ...at(name),
        message: `${name} "${price}" should be a plain number.`,
        hint: `Google reads prices as digits with a dot for decimals, no currency symbol or thousands separator${suggestion && NUMBER.test(suggestion) ? `: "${suggestion}"` : ""}. Put the currency in priceCurrency.`,
      });
    }
  }

  const rating = first("ratingValue");
  if (rating !== undefined && NUMBER.test(rating)) {
    const best = Number(first("bestRating") ?? 5);
    const worst = Number(first("worstRating") ?? 1);
    if (Number(rating) > best)
      push(ctx, { severity: "error", code: "rating-range", ...at("ratingValue"), message: `ratingValue ${rating} is higher than bestRating (${best}).`, hint: first("bestRating") ? undefined : "If your scale isn't 1 to 5, set bestRating and worstRating." });
    if (Number(rating) < worst)
      push(ctx, { severity: "error", code: "rating-range", ...at("ratingValue"), message: `ratingValue ${rating} is lower than worstRating (${worst}).` });
  }
  for (const name of ["ratingCount", "reviewCount"]) {
    const c = first(name);
    if (c !== undefined && INTEGER.test(c) && Number(c) === 0)
      push(ctx, { severity: "warning", code: "zero-count", ...at(name), message: `${name} is 0.`, hint: "Google won't show rating stars without at least one rating. Remove aggregateRating until there are reviews." });
  }

  const published = first("datePublished");
  const modified = first("dateModified");
  const now = Date.now() + 36 * 3600 * 1000; // allow for timezones
  if (published && !Number.isNaN(Date.parse(published)) && Date.parse(published) > now)
    push(ctx, { severity: "warning", code: "future-date", ...at("datePublished"), message: `datePublished (${published}) is in the future.` });
  if (published && modified && !Number.isNaN(Date.parse(published)) && !Number.isNaN(Date.parse(modified)) && Date.parse(modified) < Date.parse(published))
    push(ctx, { severity: "warning", code: "modified-before-published", ...at("dateModified"), message: "dateModified is earlier than datePublished." });
  const start = first("startDate");
  const end = first("endDate");
  if (start && end && !Number.isNaN(Date.parse(start)) && !Number.isNaN(Date.parse(end)) && Date.parse(end) < Date.parse(start))
    push(ctx, { severity: "error", code: "end-before-start", ...at("endDate"), message: "endDate is earlier than startDate." });

  const pos = item.types.includes("ListItem") ? first("position") : undefined;
  if (pos !== undefined && !INTEGER.test(pos))
    push(ctx, { severity: "error", code: "position", ...at("position"), message: `position "${pos}" should be a whole number.` });
}

function checkItemTypesAgainstRange(valueTypes: string[], ranges: string[], item: Item, prop: string, ctx: Ctx, label: string) {
  const known = valueTypes.filter((t) => getClass(t));
  if (!known.length) return;
  const entityRanges = ranges.filter((r) => !DATATYPES.has(r));
  const ok = known.some((t) => ranges.some((r) => isA(t, r)));
  if (!ok) {
    push(ctx, {
      severity: "error",
      code: "wrong-type",
      item: item.uid,
      prop,
      message: `${prop} contains ${label} ${known.join("/")}, but schema.org expects ${entityRanges.length ? list(entityRanges) : list(ranges)}.`,
      hint: entityRanges.length ? undefined : `${prop} takes a plain value, not an object.`,
    });
  }
}

function validateItem(item: Item, ctx: Ctx, nested: boolean) {
  if (ctx.seen.has(item.uid)) return;
  ctx.seen.add(item.uid);
  const known = checkTypes(item, ctx, nested);

  for (const p of item.props) {
    const at = { item: item.uid, prop: p.name };
    if (/-(input|output)$/.test(p.name)) {
      const base = p.name.replace(/-(input|output)$/, "");
      if (getProp(base) || base === "query") continue; // valid Action annotation, e.g. query-input on SearchAction
    }
    if (isExternalTerm(p.name)) {
      push(ctx, { severity: "info", code: "external-prop", ...at, message: `${p.name} isn't a schema.org property, so it isn't checked here.` });
      continue;
    }
    const def = getProp(p.name);
    if (!def) {
      if (getClass(p.name))
        push(ctx, { severity: "error", code: "type-as-prop", ...at, message: `${p.name} is a type, not a property.`, hint: `Use a property such as "${p.name.charAt(0).toLowerCase() + p.name.slice(1)}" if one exists, with {"@type": "${p.name}"} as its value.` });
      else {
        const s = suggestProp(p.name);
        push(ctx, { severity: "error", code: "unknown-prop", ...at, message: `${p.name} isn't a schema.org property.`, hint: s ? `Did you mean ${s}? Property names are case-sensitive.` : undefined });
      }
      for (const v of p.values) if (v.kind === "item") validateItem(v.item, ctx, true);
      continue;
    }

    if (def.s) push(ctx, { severity: "warning", code: "superseded-prop", ...at, message: `${p.name} has been superseded by ${def.s}.`, hint: `Rename it to ${def.s}.` });
    if (def.x) push(ctx, { severity: "info", code: "pending-prop", ...at, message: `${p.name} is in schema.org's pending area.` });
    if (known.length && !propertyAppliesTo(def, known)) {
      const where = domainsOf(p.name);
      push(ctx, {
        severity: "error",
        code: "prop-not-in-domain",
        ...at,
        message: `${p.name} isn't a property of ${known.join("/")}.`,
        hint: where.length ? `schema.org defines ${p.name} on ${list(where)}. It may belong on a nested object.` : undefined,
      });
    }
    if (p.values.length === 0)
      push(ctx, { severity: "warning", code: "empty-value", ...at, message: `${p.name} is empty.`, hint: "Remove the property or give it a value." });

    for (const v of p.values) checkValue(item, p.name, v, def.r, ctx);
  }

  checkValueFormats(item, ctx);
}

function checkValue(item: Item, prop: string, v: Value, ranges: string[], ctx: Ctx) {
  if (v.kind === "text") return checkText(item, prop, v.value, v.raw, ranges, ctx);
  if (v.kind === "item") {
    checkItemTypesAgainstRange(v.item.types, ranges, item, prop, ctx, "a");
    if (v.item.id) ctx.edges.push({ from: nodeKey(item), to: v.item.id, prop, resolved: true });
    validateItem(v.item, ctx, true);
    return;
  }
  // @id reference
  const targets = ctx.byId.get(v.id);
  ctx.edges.push({ from: nodeKey(item), to: v.id, prop, resolved: Boolean(targets) });
  if (!targets) {
    push(ctx, {
      severity: "warning",
      code: "unresolved-ref",
      item: item.uid,
      prop,
      message: `${prop} points to "${v.id}", but nothing on this page has that @id.`,
      hint: "Search engines don't follow @id references across pages. Define that entity on this page, or check the @id for typos.",
    });
    return;
  }
  checkItemTypesAgainstRange([...new Set(targets.flatMap((t) => t.types))], ranges, item, prop, ctx, "a reference to");
}

export function validate(topLevel: Item[], all: Record<string, Item>) {
  const byId = new Map<string, Item[]>();
  for (const item of Object.values(all)) if (item.id) byId.set(item.id, [...(byId.get(item.id) ?? []), item]);
  const ctx: Ctx = { garbled: new Set(), issues: [], byId, edges: [], seen: new Set() };

  // JSON-LD merges nodes that share an @id, so an untyped {"@id": ..., "name": ...} takes the other node's type.
  for (const items of byId.values()) {
    const typed = items.find((i) => i.types.length);
    if (typed) for (const i of items) if (!i.types.length) i.types = [...typed.types];
  }

  for (const item of topLevel) validateItem(item, ctx, false);

  // Same @id defined with conflicting types.
  for (const [id, items] of byId) {
    const typeSets = new Set(items.map((i) => [...i.types].sort().join("+")).filter(Boolean));
    if (items.length > 1 && typeSets.size > 1)
      push(ctx, { severity: "warning", code: "id-conflict", item: items[1].uid, message: `@id "${id}" is used for different types: ${[...typeSets].join(", ")}.`, hint: "Each @id should identify one entity. Give the others their own @id." });
  }

  // The same kind of entity marked up in more than one format.
  const formatsByType = new Map<string, Set<string>>();
  for (const i of topLevel) for (const t of i.types) formatsByType.set(t, (formatsByType.get(t) ?? new Set()).add(i.format));
  for (const [t, formats] of formatsByType)
    if (formats.size > 1)
      push(ctx, { severity: "warning", code: "duplicate-formats", message: `${t} is marked up in both ${[...formats].join(" and ")}.`, hint: "Duplicate markup can send mixed signals. Keep one format, ideally JSON-LD." });

  // Several top-level entities of the same main type with different names.
  for (const mainType of ["Organization", "LocalBusiness", "Product", "Article", "WebSite"]) {
    const same = topLevel.filter((i) => i.types.some((t) => getClass(t) && isA(t, mainType)));
    const names = new Set(same.map((i) => i.props.find((p) => p.name === "name" || p.name === "headline")?.values[0]).filter((v) => v?.kind === "text").map((v) => (v as { value: string }).value.trim()));
    if (same.length > 1 && names.size > 1 && mainType !== "Product")
      push(ctx, { severity: "warning", code: "conflicting-entities", message: `There are ${same.length} ${mainType} items with different names: ${list([...names].map((n) => `"${n}"`), 3)}.`, hint: `If they describe the same ${mainType}, merge them under one @id.` });
  }

  // Graph: nodes are top-level items plus anything with an @id.
  const nodes: GraphNode[] = [];
  const added = new Set<string>();
  for (const i of [...topLevel, ...Object.values(all).filter((x) => x.id)]) {
    const key = nodeKey(i);
    if (added.has(key)) continue;
    added.add(key);
    nodes.push({ id: key, item: i.uid, types: i.types });
  }
  const jsonTop = topLevel.filter((i) => i.format === "json-ld");
  if (jsonTop.length >= 3) {
    const linked = new Set(ctx.edges.flatMap((e) => [e.from, e.to]));
    const islands = jsonTop.filter((i) => !linked.has(nodeKey(i)));
    if (islands.length >= 2)
      push(ctx, { severity: "info", code: "disconnected", message: `${islands.length} top-level entities aren't connected to anything else.`, hint: 'Link them with @id (for example WebPage "publisher": {"@id": "#organization"}) so search engines see how they relate.' });
  }

  return { issues: ctx.issues, graph: { nodes, edges: ctx.edges } };
}
