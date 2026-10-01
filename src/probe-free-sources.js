/**
 * Test whether the free sources can actually deliver guideline-grade data:
 * fielded/Boolean querying, abstracts, identifiers, and export volume.
 *
 * This is an empirical check, not an assumption. Each source is queried with a
 * realistic systematic-review search for the running topic (TCM x lung cancer
 * x perioperative care) and the returned records are inspected for the fields a
 * guideline needs.
 *
 * Run: node src/probe-free-sources.js ["query"]
 */

const TOPIC = process.argv[2] || "lung cancer";

const sources = [
  {
    name: "Europe PMC",
    // Free REST API, no key. Fielded Boolean query, abstracts included.
    url:
      "https://www.ebi.ac.uk/europepmc/webservices/rest/search" +
      `?query=${encodeURIComponent(`(TITLE_ABS:"${TOPIC}") AND (TITLE_ABS:"acupuncture" OR TITLE_ABS:"moxibustion")`)}` +
      "&format=json&pageSize=5&resultType=core",
  },
  {
    name: "Europe PMC (MEDLINE only)",
    url:
      "https://www.ebi.ac.uk/europepmc/webservices/rest/search" +
      `?query=${encodeURIComponent(`(TITLE_ABS:"${TOPIC}") AND SRC:MED`)}` +
      "&format=json&pageSize=3&resultType=core",
  },
  {
    name: "Crossref",
    url: `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(TOPIC)}&rows=3&mailto=research@example.org`,
  },
  {
    name: "Cochrane (free API)",
    url: "https://www.cochranelibrary.com/api/search?q=lung%20cancer&page=1",
  },
  {
    name: "ClinicalTrials.gov",
    url: `https://clinicaltrials.gov/api/v2/studies?query.cond=${encodeURIComponent(TOPIC)}&pageSize=3`,
  },
  {
    name: "OpenAlex",
    url: `https://api.openalex.org/works?search=${encodeURIComponent(TOPIC + " acupuncture")}&per-page=3&mailto=research@example.org`,
  },
  {
    name: "PubMed E-utilities",
    url:
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi" +
      `?db=pubmed&term=${encodeURIComponent(`${TOPIC}[tiab] AND acupuncture[tiab]`)}&retmode=json&retmax=3`,
  },
];

async function fetchJSON(url, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; guideline-literature-tool/1.0; +https://github.com/heilegehei/cnki-batch)",
        Accept: "application/json, text/plain, */*",
      },
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: res.status, json, text };
  } catch (e) {
    return { status: `ERR ${e.name}`, json: null, text: String(e.message) };
  } finally {
    clearTimeout(timer);
  }
}

// --------------------------------------------------------- shape adapters

const adapters = {
  "Europe PMC": (j) => ({
    total: j?.hitCount,
    records: (j?.resultList?.result || []).map((r) => ({
      title: r.title,
      year: r.pubYear,
      journal: r.journalInfo?.journal?.title || r.bookOrReportDetails?.publisher || "",
      doi: r.doi,
      pmid: r.pmid,
      abstractLen: (r.abstractText || "").length,
      type: r.pubType,
      hasFullText: r.isOpenAccess === "Y" || !!r.fullTextIdList,
    })),
  }),
  "Crossref": (j) => ({
    total: j?.message?.["total-results"],
    records: (j?.message?.items || []).map((r) => ({
      title: (r.title || [])[0],
      year: (r.issued?.["date-parts"]?.[0]?.[0] || "").toString(),
      journal: (r["container-title"] || [])[0] || "",
      doi: r.DOI,
      pmid: "",
      abstractLen: (r.abstract || "").length,
      type: r.type,
      hasFullText: false,
    })),
  }),
  "ClinicalTrials.gov": (j) => ({
    total: j?.totalCount,
    records: (j?.studies || []).map((s) => ({
      title: s.protocolSection?.identificationModule?.briefTitle,
      year: s.protocolSection?.statusModule?.startDateStruct?.date || "",
      journal: s.protocolSection?.sponsorCollaboratorsModule?.leadSponsor?.name || "",
      doi: "",
      pmid: s.protocolSection?.identificationModule?.nctId || "",
      abstractLen: (s.protocolSection?.descriptionModule?.briefSummary || "").length,
      type: s.protocolSection?.designModule?.studyType || "",
      hasFullText: false,
    })),
  }),
  "OpenAlex": (j) => ({
    total: j?.meta?.count,
    records: (j?.results || []).map((r) => ({
      title: r.title,
      year: (r.publication_year || "").toString(),
      journal: r.primary_location?.source?.display_name || "",
      doi: (r.doi || "").replace(/^https?:\/\/doi\.org\//, ""),
      pmid: "",
      abstractLen: r.abstract_inverted_index ? 200 : 0,
      type: r.type,
      hasFullText: r.open_access?.is_oa || false,
    })),
  }),
};

function summarize(name, j, text) {
  const adapter = adapters[name];
  if (adapter) {
    try {
      return adapter(j);
    } catch {
      /* fall through */
    }
  }
  // Generic fallbacks for shapes we did not model.
  if (Array.isArray(j?.records)) {
    return {
      total: j.totalRecords ?? j.records.length,
      records: j.records.slice(0, 3).map((r) => ({
        title: r.title,
        year: r.year || r.pubYear,
        journal: r.journal || r.source,
        doi: r.doi,
        pmid: r.pmid,
        abstractLen: (r.abstract || "").length,
        type: r.type,
      })),
    };
  }
  if (j?.esearchresult) {
    return { total: Number(j.esearchresult.count), records: [], note: "esearch: IDs only" };
  }
  if (j?.message && typeof j.message === "string") return { total: null, records: [], note: j.message };
  return { total: null, records: [], note: (text || "").slice(0, 120) };
}

// -------------------------------------------------------------------- run

console.log(`topic: "${TOPIC}"\n`);
const out = [];

for (const s of sources) {
  const r = await fetchJSON(s.url);
  const sum = summarize(s.name, r.json, r.text);
  const recs = (sum.records || []).filter((x) => x && x.title);
  const withAbstract = recs.filter((x) => x.abstractLen > 0).length;

  console.log(`=== ${s.name} ===`);
  console.log(`  HTTP       : ${r.status}`);
  console.log(`  total hits : ${sum.total ?? "(n/a)"}${sum.note ? `   [${sum.note}]` : ""}`);
  console.log(`  sample     : ${recs.length} record(s), ${withAbstract} with abstract`);
  for (const rec of recs.slice(0, 3)) {
    console.log(`    - ${String(rec.title).slice(0, 66)}`);
    console.log(
      `      year=${rec.year || "-"} doi=${rec.doi ? "yes" : "no"} pmid=${rec.pmid || "-"} abs=${rec.abstractLen} type=${rec.type || "-"}`
    );
  }
  console.log();

  out.push({
    name: s.name,
    status: r.status,
    total: sum.total ?? null,
    sampleRecords: recs.length,
    sampleWithAbstract: withAbstract,
    doiRate: recs.length ? recs.filter((x) => x.doi).length / recs.length : 0,
    abstractRate: recs.length ? withAbstract / recs.length : 0,
  });
}

console.log("--- summary ---");
console.log(
  ["source", "HTTP", "hits", "sample", "absRate", "doiRate"].map((h) => h.padEnd(24)).join("")
);
for (const o of out) {
  console.log(
    [
      o.name.slice(0, 23).padEnd(24),
      String(o.status).padEnd(24),
      String(o.total ?? "-").padEnd(24),
      String(o.sampleRecords).padEnd(24),
      `${Math.round(o.abstractRate * 100)}%`.padEnd(24),
      `${Math.round(o.doiRate * 100)}%`.padEnd(24),
    ].join("")
  );
}
