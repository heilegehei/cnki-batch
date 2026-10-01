/**
 * Europe PMC retrieval via its free REST API.
 *
 * Europe PMC is the strongest zero-configuration source available here:
 *   - fielded Boolean query syntax (TITLE_ABS, AUTH, JOURNAL, SRC, PUB_YEAR ...)
 *   - abstracts on ~98% of records (measured)
 *   - DOIs on ~99% of records (measured)
 *   - no API key and no registration
 *
 * It reaches beyond PubMed: MEDLINE plus PMC full text, Agricola, preprints and
 * patents. Measured source mix for a TCM x NSCLC query was MED: 94, PPR: 5,
 * AGR: 1, i.e. it still overlaps MEDLINE heavily, so it complements rather
 * than replaces an Embase subscription.
 *
 * Query syntax reference:
 *   https://europepmc.org/help#fieldsearch
 */

import { fetchText, sleep, RetrieveError } from "./common.js";

const BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
const PAGE_SIZE = 100; // API maximum

export const name = "europepmc";
export const label = "Europe PMC";
export const requiresAuth = false;

function toRecord(r) {
  const journal = r.journalInfo?.journal;
  const doi = r.doi || "";
  const pmid = r.pmid || "";
  return {
    title: r.title || "",
    authors: r.authorString
      ? r.authorString
          .split(/,\s*/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    source: journal?.title || r.bookOrReportDetails?.publisher || "",
    sourceAbbrev: journal?.medlineAbbreviation || journal?.isoabbreviation || "",
    year: String(r.pubYear || ""),
    pubDate: r.firstPublicationDate || String(r.pubYear || ""),
    docType: r.pubTypeList?.pubType?.join("; ") || r.pubType || "",
    keywords: r.keywordList?.keyword || [],
    abstract: r.abstractText || "",
    doi,
    pmid,
    pmc: r.pmcId || "",
    volume: journal?.volume || "",
    issue: journal?.issue || "",
    pages: r.pageInfo || "",
    issn: journal?.issn || "",
    url: pmid
      ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
      : doi
        ? `https://doi.org/${doi}`
        : r.id
          ? `https://europepmc.org/article/${r.source || "MED"}/${r.id}`
          : "",
    language: r.language || "",
    // Europe PMC specific provenance, useful for screening notes.
    epmcSource: r.source || "",
    isOpenAccess: r.isOpenAccess === "Y",
    citedByCount: r.citedByCount ?? "",
  };
}

/**
 * Search Europe PMC.
 *
 * @param {string} query e.g. '(TITLE_ABS:"lung cancer") AND (TITLE_ABS:"acupuncture")'
 * @param {{limit?:number, sort?:string, cursorMark?:string}} [opts]
 */
export async function retrieve(query, opts = {}) {
  const limit = opts.limit ?? 200;
  const resultType = opts.resultType || "core";

  const records = [];
  let cursorMark = opts.cursorMark || "*";
  let totalHits = 0;
  let pages = 0;

  while (records.length < limit) {
    const want = Math.min(PAGE_SIZE, limit - records.length);
    const params = new URLSearchParams({
      query,
      format: "json",
      pageSize: String(want),
      resultType,
      cursorMark,
    });
    if (opts.sort) params.set("sort", opts.sort);

    const url = `${BASE}?${params}`;
    const data = await fetchText(url, { parse: "json" });

    if (data?.version === undefined && !data?.resultList) {
      throw new RetrieveError(`unexpected Europe PMC response: ${JSON.stringify(data).slice(0, 160)}`, { url });
    }
    if (pages === 0) totalHits = Number(data.hitCount || 0);

    const batch = data?.resultList?.result || [];
    if (!batch.length) break;

    for (const r of batch) {
      records.push(toRecord(r));
      if (records.length >= limit) break;
    }

    const next = data.nextCursorMark;
    if (!next || next === cursorMark || batch.length < want) break;
    cursorMark = next;
    pages++;
    if (pages > 100) break; // safety valve
    await sleep(250); // be polite to the EBI endpoint
  }

  return {
    source: label,
    sourceKey: name,
    query,
    totalHitsReported: totalHits,
    retrievedCount: records.length,
    records,
  };
}
