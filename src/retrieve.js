/**
 * Unified retrieval CLI for the zero-configuration sources.
 *
 * Runs one or more retrievers against the same search strategy, then (by
 * default) de-duplicates across them using the merge layer, so a guideline gets
 * a single screening table plus a PRISMA-ready duplicate count.
 *
 * Sources wired up and verified live:
 *   pubmed           NCBI E-utilities (esearch + efetch), needs 2 calls
 *   europepmc        free REST API, fielded Boolean search, ~98% abstracts
 *   clinicaltrials   ClinicalTrials.gov v2, trial registry records
 *   cnki             China National Knowledge Infrastructure, via Chrome/CDP
 *
 * Usage:
 *   node src/retrieve.js --query "acupuncture AND lung cancer" --sources pubmed,europepmc
 *   node src/retrieve.js --query-file search-strategy.txt --sources all --out results
 *   node src/retrieve.js --query "..." --sources pubmed --limit 50 --no-merge
 *   node src/retrieve.js --list
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { parseQuerySpec } from "./retrieve/common.js";
import { dedupe } from "./normalize.js";

// Registry of available retrievers. Imported lazily so a missing optional
// dependency (puppeteer-core, needed only by the browser-driven sources) does
// not break the API-based ones.
const REGISTRY = {
  pubmed: { label: "PubMed", load: () => import("./retrieve/pubmed.js") },
  europepmc: { label: "Europe PMC", load: () => import("./retrieve/europepmc.js") },
  clinicaltrials: { label: "ClinicalTrials.gov", load: () => import("./retrieve/clinicaltrials.js") },
  cnki: { label: "CNKI (中国知网)", load: () => import("./retrieve/cnki.js") },
  vip: { label: "维普 VIP", load: () => import("./retrieve/vip.js") },
};

const DEFAULT_SOURCES = ["pubmed", "europepmc", "clinicaltrials"];

function parseArgs(argv) {
  const o = {
    query: "",
    queryFile: "",
    sources: [],
    out: "results",
    limit: 200,
    fuzzy: true,
    threshold: 0.9,
    merge: true,
    maxPages: undefined,
    reuse: false,
    port: undefined,
    advanced: false,
    enrich: true,
    delayMs: undefined,
    json: false,
    list: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--query": o.query = next(); break;
      case "--query-file": o.queryFile = next(); break;
      case "--sources": o.sources = String(next()).split(",").map((s) => s.trim()).filter(Boolean); break;
      case "--out": o.out = next(); break;
      case "--limit": o.limit = Number(next()); break;
      case "--max-pages": o.maxPages = Number(next()); break;
      case "--threshold": o.threshold = Number(next()); break;
      case "--no-fuzzy": o.fuzzy = false; break;
      case "--no-merge": o.merge = false; break;
      case "--reuse": o.reuse = true; break;
      case "--port": o.port = Number(next()); break;
      case "--advanced": o.advanced = true; break;
      case "--enrich": o.enrich = true; break;
      case "--no-enrich": o.enrich = false; break;
      case "--delay-ms": o.delayMs = Number(next()); break;
      case "--json": o.json = true; break;
      case "--list": o.list = true; break;
      default:
        if (!a.startsWith("--") && !o.query) o.query = a;
        break;
    }
  }
  return o;
}

const args = parseArgs(process.argv);

if (args.list) {
  console.log("available sources:\n");
  for (const [key, meta] of Object.entries(REGISTRY)) {
    const mod = await meta.load().catch(() => null);
    const notes = [];
    if (mod?.requiresAuth) notes.push("needs institution IP");
    if (mod?.requiresBrowser) notes.push("drives Chrome");
    if (!notes.length) notes.push("no registration required");
    console.log(`  ${key.padEnd(16)} ${meta.label.padEnd(22)} ${notes.join("; ")}`);
  }
  console.log(`\ndefault sources: ${DEFAULT_SOURCES.join(",")}`);
  process.exit(0);
}

// ------------------------------------------------------------- query spec

let queries = [];
if (args.queryFile) {
  if (!existsSync(args.queryFile)) {
    console.error(`query file not found: ${args.queryFile}`);
    process.exit(2);
  }
  queries = parseQuerySpec(readFileSync(args.queryFile, "utf8"));
} else if (args.query) {
  queries = [{ name: "query_1", query: args.query }];
}

if (!queries.length) {
  console.error(
    "No query given.\n\n" +
      "Examples:\n" +
      '  node src/retrieve.js --query "acupuncture AND lung cancer" --sources pubmed,europepmc\n' +
      "  node src/retrieve.js --query-file strategy.txt --sources all\n" +
      "  node src/retrieve.js --list"
  );
  process.exit(2);
}

const sources = args.sources.length
  ? args.sources.flatMap((s) => (s === "all" ? Object.keys(REGISTRY) : [s]))
  : DEFAULT_SOURCES;
for (const s of sources) {
  if (!REGISTRY[s]) {
    console.error(`unknown source "${s}". Known: ${Object.keys(REGISTRY).join(", ")}, all`);
    process.exit(2);
  }
}

// ---------------------------------------------------------------- retrieve

console.log(`sources : ${sources.join(", ")}`);
console.log(`queries : ${queries.length}`);
console.log(`limit   : ${args.limit} per source per query\n`);

const perSource = [];
const allItems = [];
const runLog = [];

for (const q of queries) {
  for (const s of sources) {
    const meta = REGISTRY[s];
    process.stdout.write(`  [${meta.label}] "${q.query.slice(0, 52)}" ... `);
    const startedAt = new Date().toISOString();
    try {
      const mod = await meta.load();
      const payload = await mod.retrieve(q.query, {
        limit: args.limit,
        maxPages: args.maxPages,
        reuse: args.reuse,
        port: args.port,
        advanced: args.advanced,
        enrich: args.enrich,
        delayMs: args.delayMs,
        onProgress: (m) => process.stdout.write(`${m}\n`),
      });
      const records = payload.records || [];
      console.log(`${records.length} record(s) / ${payload.totalHitsReported ?? "?"} hits`);

      perSource.push({
        source: payload.source,
        sourceKey: s,
        queryName: q.name,
        query: q.query,
        totalHitsReported: payload.totalHitsReported ?? null,
        retrievedCount: records.length,
        retrievedAt: startedAt,
        outputFile: payload.outputFile,
      });
      records.forEach((record, index) => allItems.push({ record, source: payload.source, index }));
    } catch (e) {
      console.log(`FAILED (${e.message})`);
      runLog.push({ source: meta.label, query: q.query, error: String(e.message) });
    }
  }
}

console.log(`\nretrieved ${allItems.length} raw record(s) total`);
if (!allItems.length) {
  console.error("\nNothing retrieved. See errors above.");
  if (runLog.length) process.exit(1);
  process.exit(0);
}

// ------------------------------------------------------------------ merge

let merged = null;
let report = null;

if (args.merge) {
  console.log(`de-duplicating (fuzzy=${args.fuzzy}, threshold=${args.threshold})...`);
  const res = dedupe(allItems, { fuzzy: args.fuzzy, threshold: args.threshold });
  report = res.report;
  merged = res.clusters.map((c, i) => ({
    seq: i + 1,
    ...c.primary,
    sources: c.sources,
    duplicateCount: c.duplicateCount,
  }));
  console.log(
    `  ${report.inputRecords} raw -> ${report.uniqueRecords} unique ` +
      `(${report.duplicatesRemoved} duplicates, ${report.crossSourceClusters} cross-source)`
  );
  console.log(`  match reasons: ${JSON.stringify(report.matchReasons)}`);
}

// ----------------------------------------------------------------- output

const outDir = path.resolve(args.out);
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

const payload = {
  generatedAt: new Date().toISOString(),
  queries: queries.map((q) => ({ name: q.name, query: q.query })),
  sources,
  limits: { perSource: args.limit },
  perSource,
  errors: runLog,
  report,
  records: merged || allItems.map((it) => ({ ...it.record, sources: [it.source] })),
};

writeFileSync(path.join(outDir, `retrieved_${stamp}.json`), JSON.stringify(payload, null, 2), "utf8");

const cols = [
  ["seq", "#"], ["title", "题名/Title"], ["authors", "作者/Authors"], ["source", "来源/Source"],
  ["docType", "类型/Type"], ["year", "年/Year"], ["pubDate", "发表日期/Date"],
  ["keywords", "关键词/Keywords"], ["abstract", "摘要/Abstract"], ["doi", "DOI"],
  ["pmid", "PMID"], ["registryId", "注册号/Registry"], ["volume", "卷"], ["issue", "期"],
  ["pages", "页"], ["url", "链接/URL"], ["sources", "来源库/Databases"],
  ["duplicateCount", "重复数/Dupes"],
];
const cell = (v) => `"${String(Array.isArray(v) ? v.join("; ") : (v ?? "")).replace(/"/g, '""')}"`;
const lines = [cols.map(([, h]) => cell(h)).join(",")];
for (const r of payload.records) lines.push(cols.map(([k]) => cell(r[k])).join(","));
writeFileSync(path.join(outDir, `retrieved_${stamp}.csv`), "\uFEFF" + lines.join("\r\n"), "utf8");

if (report) {
  writeFileSync(path.join(outDir, `dedup-report_${stamp}.json`), JSON.stringify(report, null, 2), "utf8");
}

console.log(`\noutputs in ${outDir}`);
console.log(`  retrieved_${stamp}.json`);
console.log(`  retrieved_${stamp}.csv${report ? `\n  dedup-report_${stamp}.json` : ""}`);
if (runLog.length) console.log(`\n${runLog.length} source(s) failed; see "errors" in the JSON.`);
