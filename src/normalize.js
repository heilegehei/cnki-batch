/**
 * Cross-database normalisation, deduplication and merging.
 *
 * Why this exists: a guideline search runs across CNKI, PubMed, Europe PMC,
 * Cochrane, Web of Science and Embase, then has to be reported as one
 * de-duplicated flow diagram. Each source exports a different format and
 * spellings differ, so records must be canonicalised before they can be
 * compared.
 *
 * Matching cascade (deterministic and explainable, in this order):
 *   1. DOI            - strongest identifier when present
 *   2. PMID           - for PubMed / Europe PMC overlap
 *   3. title + year   - exact match on a normalised title
 *   4. title (fuzzy)  - token-set Jaccard above a threshold, year-constrained
 *
 * A union-find merges transitively, so A~B by DOI and B~C by title become one
 * cluster. Every merge records the reason and the losing source, so the report
 * can be audited for the PRISMA flow diagram.
 */

// ------------------------------------------------------------ text helpers

const HTML_TAG = /<[^>]+>/g;
const HTML_ENTITIES = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
  "&#39;": "'", "&apos;": "'", "&nbsp;": " ",
};

function stripHtml(v) {
  let s = String(v ?? "");
  s = s.replace(/<br\s*\/?>/gi, " ");
  s = s.replace(HTML_TAG, " ");
  for (const [ent, ch] of Object.entries(HTML_ENTITIES)) s = s.split(ent).join(ch);
  return s;
}

export function collapse(v) {
  return stripHtml(v).replace(/\s+/g, " ").trim();
}

/**
 * Normalise a title for comparison: unify full-width/typographic punctuation,
 * strip brackets, remove punctuation and spaces, and lowercase Latin. CJK is
 * preserved as-is so Chinese and English titles never collide.
 *
 * Brackets are REMOVED but their contents are KEPT. CNKI commonly wraps a
 * translated title in brackets ("[Acupoint application for ...]"), and dropping
 * the bracketed span entirely would normalise such a title to the empty string,
 * which would then collide with any other empty-key title.
 */
export function normalizeTitle(v) {
  let s = collapse(v).toLowerCase();
  s = s.replace(/[\u2010-\u2015\uFE58\uFE63\uFF0D]/g, "-");
  s = s.replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)); // full-width -> ASCII
  s = s.replace(/[[\](){}<>【】（）《》「」『』]/g, " "); // unwrap, keep contents
  s = s.replace(/[^\p{Script=Han}\p{L}\p{N}]+/gu, ""); // keep only letters/digits/Han
  return s;
}

export function normalizeDoi(v) {
  if (!v) return "";
  let s = collapse(v).toLowerCase();
  s = s.replace(/^https?:\/\/(dx\.)?doi\.org\//, "");
  s = s.replace(/^doi:\s*/, "");
  return s.replace(/[.,;]+$/, "").trim();
}

export function normalizePmid(v) {
  if (!v) return "";
  const m = collapse(v).match(/(\d{6,9})/);
  return m ? m[1] : "";
}

export function extractYear(v) {
  if (!v) return "";
  const m = collapse(v).match(/(1[89]\d{2}|20\d{2}|21\d{2})/);
  return m ? m[1] : "";
}

/** Canonical author string for comparison ("Smith J", "smith, j." -> "smithj"). */
export function normalizeAuthors(authors) {
  const list = Array.isArray(authors) ? authors : [authors];
  return list
    .map((a) => collapse(a).toLowerCase().replace(/[^\p{Script=Han}\p{L}\p{N}]+/gu, ""))
    .filter(Boolean)
    .sort();
}

// ------------------------------------------------------------- similarity

const STOPWORDS = new Set([
  "a", "an", "the", "of", "in", "on", "for", "and", "or", "to", "with",
  "study", "analysis", "effect", "effects", "trial", "randomized", "randomised",
]);

/**
 * Comparison units for fuzzy matching: word tokens for Latin text, character
 * bigrams for CJK (which has no word delimiters). Mixed titles get both.
 */
export function titleTokens(title) {
  const s = collapse(title).toLowerCase();
  const tokens = new Set();
  const han = s.match(/\p{Script=Han}/gu) || [];
  if (han.length >= 2) {
    for (let i = 0; i < han.length - 1; i++) tokens.add(han[i] + han[i + 1]);
  } else if (han.length === 1) {
    tokens.add(han[0]);
  }
  const latinWords = s.match(/[a-z0-9]+/g) || [];
  for (const w of latinWords) {
    if (w.length >= 3 && !STOPWORDS.has(w)) tokens.add(w);
  }
  return tokens;
}

export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const t of small) if (large.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

// ------------------------------------------------------------- union-find

class UnionFind {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array(n).fill(0);
  }
  find(x) {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    if (this.rank[ra] < this.rank[rb]) this.parent[ra] = rb;
    else if (this.rank[ra] > this.rank[rb]) this.parent[rb] = ra;
    else {
      this.parent[rb] = ra;
      this.rank[ra]++;
    }
    return true;
  }
}

// ------------------------------------------------------------- dedupe

/**
 * Deduplicate records from one or many sources.
 *
 * @param {Array<{record:object, source:string, index:number}>} items
 * @param {{fuzzy?:boolean, threshold?:number, requireYear?:boolean}} [opts]
 * @returns {{clusters:Array, report:object}}
 */
export function dedupe(items, opts = {}) {
  const { fuzzy = true, threshold = 0.9, requireYear = true } = opts;

  const enriched = items.map((it, i) => {
    const r = it.record;
    return {
      ...it,
      id: i,
      doiKey: normalizeDoi(r.doi),
      pmidKey: normalizePmid(r.pmid),
      titleKey: normalizeTitle(r.title),
      year: extractYear(r.year || r.pubDate),
      tokens: titleTokens(r.title),
    };
  });

  const uf = new UnionFind(enriched.length);
  const reasons = []; // {merged:[i,j], reason, similarity}
  const record = (i, j, reason, similarity) => {
    if (uf.union(i, j)) reasons.push({ merged: [i, j], reason, similarity });
  };

  // --- pass 1: strong identifiers
  const byDoi = new Map();
  const byPmid = new Map();
  for (const e of enriched) {
    if (e.doiKey) {
      if (byDoi.has(e.doiKey)) record(e.id, byDoi.get(e.doiKey), "doi", 1);
      else byDoi.set(e.doiKey, e.id);
    }
    if (e.pmidKey) {
      if (byPmid.has(e.pmidKey)) record(e.id, byPmid.get(e.pmidKey), "pmid", 1);
      else byPmid.set(e.pmidKey, e.id);
    }
  }

  // --- pass 2: exact normalised title (+year)
  const byTitleYear = new Map();
  const byTitle = new Map();
  for (const e of enriched) {
    if (!e.titleKey || e.titleKey.length < 6) continue;
    const tyKey = `${e.titleKey}|${e.year}`;
    if (byTitleYear.has(tyKey)) {
      record(e.id, byTitleYear.get(tyKey), "title+year", 1);
    } else {
      byTitleYear.set(tyKey, e.id);
    }
    if (byTitle.has(e.titleKey)) {
      const other = byTitle.get(e.titleKey);
      const yA = e.year;
      const yB = enriched[other].year;
      // Only merge a bare title match when years agree or one is missing.
      if (!requireYear || !yA || !yB || yA === yB) {
        record(e.id, other, "title", 1);
      }
    } else {
      byTitle.set(e.titleKey, e.id);
    }
  }

  // --- pass 3: fuzzy title match within year buckets
  let comparisons = 0;
  if (fuzzy) {
    const buckets = new Map();
    for (const e of enriched) {
      if (!e.tokens.size) continue;
      const key = e.year || "unknown";
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(e);
    }
    for (const [, group] of buckets) {
      // Inverted index on rare tokens to avoid all-pairs comparison.
      const index = new Map();
      for (const e of group) {
        // Skip pairs already unified to keep this pass cheap.
        for (const t of e.tokens) {
          if (!index.has(t)) index.set(t, []);
          index.get(t).push(e);
        }
      }
      for (const e of group) {
        const candidates = new Set();
        for (const t of e.tokens) {
          const posting = index.get(t) || [];
          if (posting.length > 400) continue; // uninformative token
          for (const o of posting) if (o.id > e.id) candidates.add(o.id);
        }
        for (const oid of candidates) {
          if (uf.find(e.id) === uf.find(oid)) continue;
          const other = enriched[oid];
          comparisons++;
          const sim = jaccard(e.tokens, other.tokens);
          if (sim >= threshold) record(e.id, oid, "title-fuzzy", Number(sim.toFixed(4)));
        }
      }
    }
  }

  // --- build clusters
  const groups = new Map();
  for (const e of enriched) {
    const root = uf.find(e.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(e);
  }

  const clusters = [];
  for (const [, members] of groups) {
    const merged = mergeRecords(members.map((m) => m.record));
    clusters.push({
      primary: merged,
      members: members.map((m) => ({ source: m.source, index: m.index })),
      sources: [...new Set(members.map((m) => m.source))],
      duplicateCount: members.length - 1,
    });
  }
  clusters.sort((a, b) => b.members.length - a.members.length || String(a.primary.title).localeCompare(String(b.primary.title)));

  const report = {
    inputRecords: items.length,
    uniqueRecords: clusters.length,
    duplicatesRemoved: items.length - clusters.length,
    duplicateClusters: clusters.filter((c) => c.duplicateCount > 0).length,
    fuzzyComparisons: comparisons,
    matchReasons: reasons.reduce((acc, r) => {
      acc[r.reason] = (acc[r.reason] || 0) + 1;
      return acc;
    }, {}),
    perSource: items.reduce((acc, it) => {
      acc[it.source] = (acc[it.source] || 0) + 1;
      return acc;
    }, {}),
    // Clusters that merged records from different databases are the
    // cross-database duplicates a PRISMA diagram reports.
    crossSourceClusters: clusters.filter((c) => c.sources.length > 1).length,
    mergeDetails: reasons.map((r) => ({
      reason: r.reason,
      similarity: r.similarity,
      kept: enriched[r.merged[0]].record.title,
      dropped: enriched[r.merged[1]].record.title,
      sources: [enriched[r.merged[0]].source, enriched[r.merged[1]].source],
    })),
  };

  return { clusters, report };
}

// ------------------------------------------------------------- merging

const preferLonger = (a, b) => {
  const A = collapse(a);
  const B = collapse(b);
  if (!A) return B;
  if (!B) return A;
  return B.length > A.length ? B : A;
};

const unionList = (a, b) => {
  const out = [];
  const seen = new Set();
  for (const v of [...(a || []), ...(b || [])]) {
    const s = collapse(v);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
};

/**
 * Fields with dedicated merge rules. Any other key present on the input records
 * is carried through generically (see the extra-field handling below), so
 * source-specific data such as ClinicalTrials.gov registry numbers or VIP
 * journal-indexing badges is not silently dropped.
 */
const CORE_FIELDS = new Set([
  "title", "authors", "source", "year", "pubDate", "docType", "keywords",
  "abstract", "doi", "volume", "issue", "pages", "issn", "url", "pmid",
  "language", "publisher", "sources", "mergedFrom",
]);

/**
 * Merge duplicate records into one, preferring the most complete values.
 * Text fields take the longest non-empty variant (usually the richest source);
 * list fields are unioned; identifiers are taken from whichever source has one.
 * Non-core fields are preserved rather than discarded.
 */
export function mergeRecords(records) {
  const out = {
    title: "", authors: [], source: "", year: "", pubDate: "", docType: "",
    keywords: [], abstract: "", doi: "", volume: "", issue: "", pages: "",
    issn: "", url: "", pmid: "", language: "", publisher: "",
    sources: [], mergedFrom: 0,
  };
  for (const r of records) {
    if (!r) continue;
    out.title = preferLonger(out.title, r.title);
    out.authors = unionList(out.authors, r.authors);
    out.source = preferLonger(out.source, r.source);
    out.year = out.year || extractYear(r.year || r.pubDate);
    out.pubDate = preferLonger(out.pubDate, r.pubDate);
    out.docType = out.docType || collapse(r.docType);
    out.keywords = unionList(out.keywords, r.keywords);
    out.abstract = preferLonger(out.abstract, r.abstract);
    out.doi = out.doi || collapse(r.doi);
    out.volume = out.volume || collapse(r.volume);
    out.issue = out.issue || collapse(r.issue);
    out.pages = out.pages || collapse(r.pages);
    out.issn = out.issn || collapse(r.issn);
    out.url = out.url || collapse(r.url);
    out.pmid = out.pmid || collapse(r.pmid);
    out.language = out.language || collapse(r.language);
    out.publisher = out.publisher || collapse(r.publisher);
  }

  // Carry source-specific fields through instead of dropping them. Lists are
  // unioned, scalars take the first non-empty value.
  for (const r of records) {
    if (!r) continue;
    for (const [key, value] of Object.entries(r)) {
      if (CORE_FIELDS.has(key)) continue;
      if (Array.isArray(value)) {
        out[key] = unionList(out[key], value);
      } else if (value && value !== "" && (out[key] === undefined || out[key] === "")) {
        out[key] = value;
      }
    }
  }

  out.title = collapse(out.title);
  out.abstract = collapse(out.abstract);
  out.authors = out.authors.map(collapse).filter(Boolean);
  out.keywords = out.keywords.map(collapse).filter(Boolean);
  out.mergedFrom = records.filter(Boolean).length;
  return out;
}
