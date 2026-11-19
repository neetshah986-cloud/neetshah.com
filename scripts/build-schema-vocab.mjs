// Compiles the official schema.org release into the compact vocabulary the validator uses.
//
//   curl -o /tmp/schemaorg.jsonld https://raw.githubusercontent.com/schemaorg/schemaorg/main/data/releases/30.1/schemaorg-current-https.jsonld
//   node scripts/build-schema-vocab.mjs /tmp/schemaorg.jsonld 30.1
//
// Output: src/lib/schema/vocab.json
import fs from "node:fs";
import path from "node:path";

const [input, version] = process.argv.slice(2);
if (!input || !version) {
  console.error("Usage: node scripts/build-schema-vocab.mjs <schemaorg-current-https.jsonld> <version>");
  process.exit(1);
}

const graph = JSON.parse(fs.readFileSync(input, "utf8"))["@graph"];
const short = (id) => (typeof id === "string" ? id.replace(/^schema:/, "") : id);
const ids = (v) => (v == null ? [] : (Array.isArray(v) ? v : [v]).map((x) => short(x["@id"] ?? x)));
const isSchema = (id) => typeof id === "string" && id.startsWith("schema:");
const isPending = (n) => ids(n["schema:isPartOf"]).some((p) => String(p).includes("pending"));
const isAttic = (n) => ids(n["schema:isPartOf"]).some((p) => String(p).includes("attic"));

const DATATYPES = ["Text", "URL", "Number", "Integer", "Float", "Boolean", "Date", "DateTime", "Time", "CssSelectorType", "XPathType", "PronounceableText"];

const classes = {};
const props = {};
const members = {}; // enumeration type -> member names

for (const n of graph) {
  if (!isSchema(n["@id"]) || isAttic(n)) continue;
  const name = short(n["@id"]);
  const types = ids(n["@type"]);
  if (types.includes("rdfs:Class") || types.includes("schema:DataType") || DATATYPES.includes(name)) {
    const c = { p: ids(n["rdfs:subClassOf"]).filter((x) => !String(x).includes(":")) };
    const sup = ids(n["schema:supersededBy"])[0];
    if (sup) c.s = sup;
    if (isPending(n)) c.x = 1;
    classes[name] = c;
  } else if (types.includes("rdf:Property")) {
    const p = { d: ids(n["schema:domainIncludes"]), r: ids(n["schema:rangeIncludes"]) };
    const sup = ids(n["schema:supersededBy"])[0];
    if (sup) p.s = sup;
    if (isPending(n)) p.x = 1;
    props[name] = p;
  } else {
    // Anything else typed with a schema.org class is an enumeration member (e.g. InStock: ItemAvailability).
    const rawTypes = (Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]]).filter(isSchema).map(short);
    for (const t of rawTypes) (members[t] ??= []).push(name);
  }
}

// Mark enumerations: classes whose ancestry reaches Enumeration.
const isEnum = (name, seen = new Set()) => {
  if (name === "Enumeration") return true;
  if (seen.has(name) || !classes[name]) return false;
  seen.add(name);
  return classes[name].p.some((p) => isEnum(p, seen));
};
for (const name of Object.keys(classes)) if (name !== "Enumeration" && isEnum(name)) classes[name].e = 1;
for (const t of Object.keys(members)) members[t].sort();

const out = { version, datatypes: DATATYPES, classes, props, members };
const dest = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "src", "lib", "schema", "vocab.json");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out));
console.log(
  `schema.org ${version}: ${Object.keys(classes).length} types, ${Object.keys(props).length} properties, ` +
    `${Object.values(members).flat().length} enumeration members -> ${dest} (${(fs.statSync(dest).size / 1024).toFixed(0)} KB)`,
);
