/**
 * PubMed retrieval via the official NCBI E-utilities.
 *
 * PubMed needs TWO calls, which is the single most common mistake:
 *   esearch  -> returns PMIDs only, no citation data
 *   efetch   -> returns the actual records (XML)
 *
 * Verified live: 160 hits for a TCM x NSCLC query; efetch returns titles,
 * structured abstracts, DOIs and MeSH terms.
 *
 * Rate limits: 3 requests/second without an API key, 10/second with one.
 * Set NCBI_API_KEY to get the higher tier; the module then also sends
 * tool/email parameters as NCBI requests.
 */

import { fetchText, chunk, stripTags, sleep, RetrieveError, contactEmail } from "./common.js";
import { parseXml, child, children, childText, findAll } from "../xml.js";

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/";
const DEFAULT_RETMAX = 200;
const EFETCH_BATCH = 100;

export const name = "pubmed";
export const label = "PubMed";
export const requiresAuth = false;

/** Build the common query-string parameters E-utilities expects. */
function baseParams() {
  const p = new URLSearchParams();
  const key = process.env.NCBI_API_KEY;
  if (key) p.set("api_key", key);
  const email = contactEmail();
  if (email) {
    p.set("email", email);
    p.set("tool", "guideline-literature-tool");
  }
  return p;
}

/**
 * ESearch: translate a query into PMIDs.
 * @returns {Promise<{count:number, ids:string[], queryTranslation:string}>}
 */
export async function esearch(term, { retmax = DEFAULT_RETMAX, sort = "relevance" } = {}) {
  const params = baseParams();
  params.set("db", "pubmed");
  params.set("term", term);
  params.set("retmode", "json");
  params.set("retmax", String(retmax));
  if (sort) params.set("sort", sort === "date" ? "pub_date" : "relevance");

  const url = `${EUTILS}esearch.fcgi?${params}`;
  const data = await fetchText(url, { parse: "json" });
  const result = data?.esearchresult;
  if (!result) throw new RetrieveError("unexpected ESearch response shape", { url });
  if (result.error) throw new RetrieveError(`ESearch error: ${result.error}`, { url });

  return {
    count: Number(result.count || 0),
    ids: result.idlist || [],
    queryTranslation: result.querytranslation || "",
  };
}

/**
 * EFetch: retrieve full records for PMIDs as XML.
 * Batched to keep request URLs reasonable.
 */
export async function efetch(ids) {
  const records = [];
  for (const batch of chunk(ids, EFETCH_BATCH)) {
    const params = baseParams();
    params.set("db", "pubmed");
    params.set("id", batch.join(","));
    params.set("retmode", "xml");
    const url = `${EUTILS}efetch.fcgi?${params}`;
    const xml = await fetchText(url, { accept: "application/xml", parse: "text" });
    records.push(...parsePubmedXml(xml));
    // Be polite between batches even on the keyed tier.
    if (ids.length > EFETCH_BATCH) await sleep(400);
  }
  return records;
}

// --------------------------------------------------------------- XML parsing

/**
 * Small dependency-free PubMed XML reader.
 *
 * A general XML parser is unnecessary here: the record shape is fixed and the
 * only nesting that matters is a bounded set of containers. Tag extraction
 * tolerates attributes and writes the remainder of a non-greedy match, which is
 * sufficient for well-formed E-utilities output.
 */
export function parsePubmedXml(xml) {
  const src = String(xml || "");
  const blocks = src.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) || [];
  return blocks.map(parseArticle).filter(Boolean);
}

const tag = (xml, t) => {
  const m = xml.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`));
  return m ? m[1] : "";
};
const tagAll = (xml, t) => {
  const out = [];
  const re = new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`, "g");
  let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
};
const attr = (fragment, a) => {
  const m = fragment.match(new RegExp(`${a}="([^"]*)"`));
  return m ? m[1] : "";
};

function parseAbstract(articleXml) {
  const absBlocks = tagAll(articleXml, "Abstract");
  if (!absBlocks.length) return "";
  const parts = [];
  for (const block of absBlocks) {
    const texts = tagAll(block, "AbstractText");
    for (const t of texts) {
      const label = attr(t, "Label");
      const text = stripTags(t);
      if (!text) continue;
      parts.push(label ? `${label}: ${text}` : text);
    }
  }
  return parts.join(" ");
}

function parseAuthors(articleXml) {
  const list = tag(articleXml, "AuthorList");
  if (!list) return [];
  const out = [];
  for (const a of tagAll(list, "Author")) {
    const collective = stripTags(tag(a, "CollectiveName"));
    if (collective) {
      out.push(collective);
      continue;
    }
    const last = stripTags(tag(a, "LastName"));
    const fore = stripTags(tag(a, "ForeName")) || stripTags(tag(a, "Initials"));
    const full = [last, fore].filter(Boolean).join(" ");
    if (full) out.push(full);
  }
  return out;
}

function parseArticleYear(articleXml) {
  // Prefer the journal issue pub date, then the article date, then MedlineDate.
  const pubDate = tag(articleXml, "PubDate");
  const yearFrom = (frag) => {
    const y = stripTags(tag(frag, "Year"));
    if (y) return y;
    const medline = stripTags(tag(frag, "MedlineDate"));
    const m = medline.match(/(1[89]\d{2}|20\d{2})/);
    return m ? m[1] : "";
  };
  let year = yearFrom(pubDate);
  if (!year) {
    for (const ad of tagAll(articleXml, "ArticleDate")) {
      year = yearFrom(ad);
      if (year) break;
    }
  }
  if (!year) {
    const art = tag(articleXml, "Article");
    const first = tagAll(art, "PubDate")[0] || "";
    year = yearFrom(first);
  }
  const month = stripTags(tag(pubDate, "Month"));
  const day = stripTags(tag(pubDate, "Day"));
  const monthNum = /^\d+$/.test(month)
    ? month.padStart(2, "0")
    : String(
        ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(
          month.toLowerCase().slice(0, 3)
        ) + 1
      ).padStart(2, "0");
  const pubDateStr = year
    ? monthNum !== "00" && month
      ? day
        ? `${year}-${monthNum}-${day.padStart(2, "0")}`
        : `${year}-${monthNum}`
      : year
    : "";
  return { year, pubDate: pubDateStr };
}

function parseIds(articleXml) {
  const out = {};
  const idList = tag(articleXml, "ArticleIdList");
  for (const id of tagAll(idList, "ArticleId")) {
    const type = attr(id, "IdType");
    const value = stripTags(id);
    if (type === "doi") out.doi = value;
    else if (type === "pmc") out.pmc = value;
  }
  return out;
}

function parseArticle(block) {
  const article = tag(block, "Article");
  if (!article) return null;

  const title = stripTags(tag(article, "ArticleTitle"));
  const journal = stripTags(tag(tag(article, "Journal"), "Title"));
  const journalIso = stripTags(tag(tag(article, "Journal"), "ISOAbbreviation"));
  const { year, pubDate } = parseArticleYear(article);
  const ids = parseIds(block);
  const pmid = stripTags(tag(tag(block, "MedlineCitation"), "PMID")) || stripTags(tag(block, "PMID"));

  const journalIssue = tag(article, "JournalIssue");
  const volume = stripTags(tag(journalIssue, "Volume"));
  const issue = stripTags(tag(journalIssue, "Issue"));
  const pages = stripTags(tag(tag(article, "Pagination"), "MedlinePgn"));

  const keywords = [];
  for (const kwList of tagAll(block, "KeywordList")) {
    for (const kw of tagAll(kwList, "Keyword")) {
      const v = stripTags(kw);
      if (v) keywords.push(v);
    }
  }
  // MeSH headings are a useful fallback when no author keywords exist.
  const mesh = [];
  for (const mh of tagAll(block, "MeshHeading")) {
    const d = stripTags(tag(mh, "DescriptorName"));
    if (d) mesh.push(d);
  }

  const pubTypes = tagAll(block, "PublicationType").map(stripTags).filter(Boolean);
  const lang = stripTags(tag(article, "Language"));

  return {
    title,
    authors: parseAuthors(article),
    source: journal,
    sourceAbbrev: journalIso,
    year,
    pubDate,
    docType: pubTypes.join("; "),
    keywords: keywords.length ? keywords : mesh,
    abstract: parseAbstract(article),
    doi: ids.doi || "",
    pmid,
    pmc: ids.pmc || "",
    volume,
    issue,
    pages,
    issn: stripTags(tag(journalIssue, "ISSN")) || "",
    url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : "",
    language: lang,
  };
}

// ------------------------------------------------------------------ retrieve

/**
 * Full retrieval: ESearch then EFetch.
 *
 * @param {string} query PubMed query syntax, e.g.
 *   '(lung neoplasms[MeSH]) AND (acupuncture[tiab] OR moxibustion[tiab])'
 * @param {{limit?:number, sort?:string}} [opts]
 */
export async function retrieve(query, opts = {}) {
  const limit = opts.limit ?? 200;
  const search = await esearch(query, { retmax: limit, sort: opts.sort });
  const ids = search.ids.slice(0, limit);
  const records = ids.length ? await efetch(ids) : [];
  return {
    source: label,
    sourceKey: name,
    query,
    queryTranslation: search.queryTranslation,
    totalHitsReported: search.count,
    retrievedCount: records.length,
    records,
  };
}
