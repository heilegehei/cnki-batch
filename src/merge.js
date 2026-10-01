/**
 * Cross-database merge and de-duplication CLI.
 *
 * Takes exports from any mix of databases (CNKI EndNote/JSON, PubMed, Cochrane,
 * Web of Science, Embase RIS/BibTeX), normalises them, de-duplicates across
 * sources, and writes one merged dataset plus a de-duplication report that can
 * be cited in a guideline's PRISMA flow diagram.
 *
 * Usage:
 *   node src/merge.js --in a.ris b.txt c.json --out merged
 *   node src/merge.js --in wos.ris --source "Web of Science" --out merged
 *   node src/merge.js --in a.ris b.ris --no-fuzzy --threshold 0.92
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { parseRIS, parseBibTeX, parseEndNote, parseJSONRecords } from "./parse-formats.js";
import { dedupe } from "./normalize.js";

// ------------------------------------------------------------------- args

function parseArgs(argv) {
  const o = { inputs: [], sources: [], out: "merged", fuzzy: true, threshold: 0.9, requireYear: true, dry: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--in": while (argv[i + 1] && !argv[i + 1].startsWith("--")) o.inputs.push(next()); break;
      case "--source": o.sources.push(next()); break;
      case "--out": o.out = next(); break;
      case "--threshold": o.threshold = Number(next()); break;
      case "--no-fuzzy": o.fuzzy = false; break;
      case "--no-year-check": o.requireYear = false; break;
      case "--dry": o.dry = true; break;
      default:
        if (!a.startsWith("--")) o.inputs.push(a);
        break;
    }
  }
  return o;
}

const args = parseArgs(process.argv);
if (!args.inputs.length) {
  console.error(
    "Missing input files.\n" +
      'Example: node src/merge.js --in cnki.txt pubmed.ris cochrane.ris --out merged'
  );
  process.exit(2);
}

// ------------------------------------------------------- format detection

function detectFormat(file, text) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".ris") return "ris";
  if (ext === ".bib" || ext === ".bibtex") return "bibtex";
  if (ext === ".json" || ext === ".jsonl") return "json";
  const head = text.slice(0, 4000);
  if (/^\s*@[A-Za-z]+\s*[{(]/m.test(head)) return "bibtex";
  if (/^TY\s{1,2}-\s/m.test(head)) return "ris";
  if (/^%[A-Z0-9]\s/m.test(head)) return "endnote";
  if (/^\s*[[{]/.test(head)) return "json";
  // RIS tag lines without an explicit TY are still worth trying.
  if (/^(TI|AU|PY|JO|AB|DO)\s{1,2}-\s/m.test(head)) return "ris";
  return "unknown";
}

function parseByFormat(format, text, file) {
  switch (format) {
    case "ris": return parseRIS(text);
    case "bibtex": return parseBibTeX(text);
    case "endnote": return parseEndNote(text);
    case "json": return parseJSONRecords(text);
    default:
      throw new Error(
        `could not detect format of ${path.basename(file)}; ` +
          `rename it with a .ris/.bib/.json extension or check the export`
      );
  }
}

/** Guess a database label from the filename, overridable with --source. */
function guessSource(file) {
  const n = path.basename(file).toLowerCase();
  if (/cnki|知网/.test(n)) return "CNKI";
  if (/pubmed|medline/.test(n)) return "PubMed";
  if (/embase/.test(n)) return "Embase";
  if (/cochrane|central/.test(n)) return "Cochrane";
  if (/wos|web.?of.?science|sci-?expanded|isi/.test(n)) return "Web of Science";
  if (/europepmc|europe_pmc|epmc/.test(n)) return "Europe PMC";
  if (/scopus/.test(n)) return "Scopus";
  if (/cinahl/.test(n)) return "CINAHL";
  if (/wanfang|万方/.test(n)) return "万方";
  if (/vip|维普/.test(n)) return "维普";
  if (/sinomed|cbm/.test(n)) return "SinoMed";
  if (/crossref/.test(n)) return "Crossref";
  return "Unknown";
}

// ------------------------------------------------------------------- load

const items = [];
const fileSummary = [];

for (let f = 0; f < args.inputs.length; f++) {
  const file = args.inputs[f];
  if (!existsSync(file)) {
    console.error(`! file not found: ${file}`);
    process.exit(2);
  }
  const text = readFileSync(file, "utf8");
  const format = detectFormat(file, text);
  const source = args.sources[f] || guessSource(file);
  let records;
  try {
    records = parseByFormat(format, text, file);
  } catch (e) {
    console.error(`! ${file}: ${e.message}`);
    process.exit(2);
  }
  const withAbstract = records.filter((r) => r.abstract && r.abstract.trim()).length;
  const withDoi = records.filter((r) => r.doi && r.doi.trim()).length;
  fileSummary.push({
    file: path.basename(file),
    format,
    source,
    records: records.length,
    withAbstract,
    withDoi,
  });
  console.log(
    `  ${String(records.length).padStart(4)} records  [${format.padEnd(7)}] ${source.padEnd(16)} ${path.basename(file)}` +
      `  (abstract ${withAbstract}, doi ${withDoi})`
  );
  records.forEach((record, index) => items.push({ record, source, index, file: path.basename(file) }));
}

if (!items.length) {
  console.error("\nNo records parsed from any input. Check the exports.");
  process.exit(1);
}

if (args.dry) {
  console.log(`\n--dry: parsed ${items.length} records, no output written.`);
  process.exit(0);
}

// ---------------------------------------------------------------- dedupe

console.log(`\ndeduplicating ${items.length} records (fuzzy=${args.fuzzy}, threshold=${args.threshold})...`);
const { clusters, report } = dedupe(items, {
  fuzzy: args.fuzzy,
  threshold: args.threshold,
  requireYear: args.requireYear,
});

// ---------------------------------------------------------------- output

const outDir = path.resolve(args.out);
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

const merged = clusters.map((c, i) => ({
  seq: i + 1,
  ...c.primary,
  sources: c.sources,
  duplicateCount: c.duplicateCount,
}));

const payload = {
  generatedAt: new Date().toISOString(),
  inputs: fileSummary,
  options: { fuzzy: args.fuzzy, threshold: args.threshold, requireYear: args.requireYear },
  report,
  records: merged,
};

writeFileSync(path.join(outDir, `merged_${stamp}.json`), JSON.stringify(payload, null, 2), "utf8");
writeFileSync(path.join(outDir, `dedup-report_${stamp}.json`), JSON.stringify(report, null, 2), "utf8");

// CSV for screening in Excel / Rayyan / Covidence.
const cols = [
  ["seq", "#"], ["title", "题名/Title"], ["authors", "作者/Authors"], ["source", "来源/Source"],
  ["docType", "类型/Type"], ["year", "年/Year"], ["pubDate", "发表日期/Date"],
  ["keywords", "关键词/Keywords"], ["abstract", "摘要/Abstract"], ["doi", "DOI"],
  ["pmid", "PMID"], ["volume", "卷"], ["issue", "期"], ["pages", "页"],
  ["url", "链接/URL"], ["sources", "来源库/Databases"], ["duplicateCount", "重复数/Dupes"],
];
const cell = (v) => `"${String(Array.isArray(v) ? v.join("; ") : v ?? "").replace(/"/g, '""')}"`;
const lines = [cols.map(([, h]) => cell(h)).join(",")];
for (const r of merged) lines.push(cols.map(([k]) => cell(r[k])).join(","));
writeFileSync(path.join(outDir, `merged_${stamp}.csv`), "\uFEFF" + lines.join("\r\n"), "utf8");

// ---------------------------------------------------------------- summary

console.log("\n--- de-duplication report ---");
console.log(`  input records        : ${report.inputRecords}`);
console.log(`  unique records       : ${report.uniqueRecords}`);
console.log(`  duplicates removed   : ${report.duplicatesRemoved}`);
console.log(`  duplicate clusters   : ${report.duplicateClusters}`);
console.log(`  cross-database merges: ${report.crossSourceClusters}`);
console.log(`  match reasons        : ${JSON.stringify(report.matchReasons)}`);
console.log(`  per source           : ${JSON.stringify(report.perSource)}`);
console.log(`\n  outputs: ${outDir}`);
console.log(`    merged_${stamp}.json`);
console.log(`    merged_${stamp}.csv`);
console.log(`    dedup-report_${stamp}.json`);

if (report.duplicateClusters) {
  console.log("\n  sample merges:");
  for (const d of report.mergeDetails.slice(0, 5)) {
    console.log(`    [${d.reason}${d.similarity < 1 ? " " + d.similarity : ""}] ${d.sources.join(" + ")}`);
    console.log(`      kept   : ${String(d.kept).slice(0, 70)}`);
    console.log(`      dropped: ${String(d.dropped).slice(0, 70)}`);
  }
}
