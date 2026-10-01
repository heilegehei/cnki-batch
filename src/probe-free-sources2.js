/**
 * Follow-up probe: fix the calling mistakes from the first pass and answer the
 * real question - can these free sources deliver the FIELDS a guideline needs?
 *
 * Fixes applied vs the first probe:
 *   - Crossref requires a descriptive User-Agent (429 otherwise)
 *   - Europe PMC returns hitCount at the top level, not inside a wrapper
 *   - PubMed esearch returns IDs only; a complete record needs efetch, so this
 *     script performs the two-step call and parses the MEDLINE/XML result
 *   - Cochrane's own API is behind Cloudflare; test whether a plain page fetch
 *     of a review landing page or the CENTRAL route is reachable at all
 *
 * Run: node src/probe-free-sources2.js ["topic"]
 */

const TOPIC = process.argv[2] || "non-small cell lung cancer";
const UA =
  "guideline-literature-tool/1.0 (mailto:research@example.org; +https://github.com/heilegehei/cnki-batch)";

async function get(url, { accept = "application/json", timeoutMs = 40000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA, Accept: accept } });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: res.status, json, text, headers: res.headers };
  } catch (e) {
    return { status: `ERR ${e.name}`, json: null, text: String(e.message) };
  } finally {
    clearTimeout(t);
  }
}

const line = (s) => console.log(s);

// ---------------------------------------------------------------- Crossref

line("=== 1. Crossref with a proper User-Agent ===");
{
  const r = await get(
    `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(TOPIC)}&rows=3`
  );
  line(`  HTTP: ${r.status}`);
  if (r.status === 200) {
    const items = r.json?.message?.items || [];
    line(`  total: ${r.json?.message?.["total-results"]}`);
    for (const it of items) {
      const abs = (it.abstract || "").replace(/<[^>]+>/g, "");
      line(`    - ${String((it.title || [])[0]).slice(0, 62)}`);
      line(
        `      year=${it.issued?.["date-parts"]?.[0]?.[0] || "-"} doi=${it.DOI ? "yes" : "no"} abstract=${abs.length} chars type=${it.type}`
      );
    }
  } else {
    line(`  body: ${r.text.slice(0, 150)}`);
  }
}

// --------------------------------------------------------- Europe PMC core

line("\n=== 2. Europe PMC: total hits + abstract coverage ===");
{
  const q = `(TITLE_ABS:"${TOPIC}") AND (TITLE_ABS:"acupuncture" OR TITLE_ABS:"moxibustion" OR TITLE_ABS:"Chinese herbal")`;
  const r = await get(
    `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(q)}&format=json&pageSize=100&resultType=core`
  );
  const j = r.json;
  const recs = j?.resultList?.result || [];
  const withAbs = recs.filter((x) => (x.abstractText || "").length > 100).length;
  const withDoi = recs.filter((x) => x.doi).length;
  const oa = recs.filter((x) => x.isOpenAccess === "Y").length;
  line(`  HTTP: ${r.status}  totalHits: ${j?.hitCount}`);
  line(`  returned: ${recs.length} | abstract>100chars: ${withAbs} | DOI: ${withDoi} | open access: ${oa}`);
  line("  source breakdown:");
  const bySrc = {};
  for (const x of recs) bySrc[x.source] = (bySrc[x.source] || 0) + 1;
  for (const [s, n] of Object.entries(bySrc).sort((a, b) => b[1] - a[1])) line(`    ${s}: ${n}`);
  line("  example records:");
  for (const x of recs.slice(0, 3)) {
    line(`    - ${String(x.title).slice(0, 64)}`);
    line(
      `      ${x.pubYear} | ${x.journalInfo?.journal?.title?.slice(0, 40) || "-"} | DOI:${x.doi ? "y" : "n"} PMID:${x.pmid || "-"} abs:${(x.abstractText || "").length}`
    );
  }
}

// ------------------------------------------------- PubMed esearch + efetch

line("\n=== 3. PubMed two-step (esearch -> efetch) ===");
{
  const term = `${TOPIC}[tiab] AND (acupuncture[tiab] OR moxibustion[tiab] OR "Chinese herbal"[tiab])`;
  const s = await get(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=5&term=${encodeURIComponent(term)}`
  );
  const ids = s.json?.esearchresult?.idlist || [];
  line(`  esearch HTTP: ${s.status} | total: ${s.json?.esearchresult?.count} | ids: ${ids.length}`);
  if (ids.length) {
    const f = await get(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&retmode=xml&id=${ids.join(",")}`,
      { accept: "application/xml" }
    );
    const xml = f.text || "";
    const articles = (xml.match(/<PubmedArticle>/g) || []).length;
    const abstracts = (xml.match(/<AbstractText/g) || []).length;
    const dois = (xml.match(/<ArticleId IdType="doi">/g) || []).length;
    const titles = [...xml.matchAll(/<ArticleTitle[^>]*>([\s\S]*?)<\/ArticleTitle>/g)].map((m) =>
      m[1].replace(/<[^>]+>/g, "").trim()
    );
    line(`  efetch HTTP: ${f.status} | articles: ${articles} | AbstractText nodes: ${abstracts} | DOIs: ${dois}`);
    line("  example records:");
    for (const t of titles.slice(0, 3)) line(`    - ${t.slice(0, 68)}`);
    line(`  conclusion: PubMed NEEDS the two-step call; esearch alone has no citations.`);
  }
}

// --------------------------------------------------------------- Cochrane

line("\n=== 4. Cochrane reachability (several routes) ===");
for (const [label, url, accept] of [
  ["search page", "https://www.cochranelibrary.com/search", "text/html"],
  ["CENTRAL page", "https://www.cochranelibrary.com/central", "text/html"],
  ["api v1", "https://www.cochranelibrary.com/api/search?q=lung+cancer", "application/json"],
  [
    "CDSR DOI resolve",
    "https://doi.org/10.1002/14651858.CD012345.pub2",
    "text/html",
  ],
]) {
  const r = await get(url, { accept, timeoutMs: 25000 });
  const cf = /just a moment|cloudflare/i.test(r.text || "");
  line(`  ${String(r.status).padEnd(12)} ${label.padEnd(18)} cloudflare=${cf}`);
}

// ------------------------------------------------------------ OpenAlex full

line("\n=== 5. OpenAlex: abstract reconstruction + citation counts ===");
{
  const r = await get(
    `https://api.openalex.org/works?search=${encodeURIComponent(TOPIC + " acupuncture")}&per-page=5`
  );
  const j = r.json;
  line(`  HTTP: ${r.status} | total: ${j?.meta?.count}`);
  const inv = j?.results?.[0]?.abstract_inverted_index;
  let rebuilt = "";
  if (inv) {
    const positions = [];
    for (const [w, idxs] of Object.entries(inv)) for (const i of idxs) positions.push([i, w]);
    positions.sort((a, b) => a[0] - b[0]);
    rebuilt = positions.map((p) => p[1]).join(" ");
  }
  line(`  abstracts reconstructable: ${rebuilt ? "YES" : "no"} (${rebuilt.length} chars rebuilt for record 1)`);
  if (rebuilt) line(`    "${rebuilt.slice(0, 120)}..."`);
  const withCited = (j?.results || []).filter((x) => x.cited_by_count > 0).length;
  line(`  records with citation counts: ${withCited}/${(j?.results || []).length}`);
  const withRefs = (j?.results || []).filter((x) => (x.referenced_works || []).length > 0).length;
  line(`  records with reference lists: ${withRefs}/${(j?.results || []).length}`);
}
