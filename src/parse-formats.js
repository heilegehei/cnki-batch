/**
 * Bibliographic record parsers: RIS, BibTeX and EndNote tagged format.
 *
 * These are the export formats offered by Web of Science, Cochrane, Embase
 * (via RIS/BibTeX) and CNKI (EndNote), so the merge layer can absorb a manual
 * export from any of them without needing API credentials.
 *
 * All parsers return the same normalised shape (see normalize.js).
 */

// ----------------------------------------------------------------- RIS

/**
 * RIS is line-based: "TAG  - value", records terminated by "ER  -".
 * Repeated tags (AU, KW) accumulate; continuation lines are indented.
 */
export function parseRIS(text) {
  const records = [];
  let current = null;
  let lastTag = null;

  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) continue;

    const m = line.match(/^([A-Z][A-Z0-9])\s{1,2}-\s?(.*)$/);
    if (!m) {
      // Indented continuation of the previous tag's value.
      if (current && lastTag && /^\s/.test(raw)) {
        const arr = current[lastTag];
        if (Array.isArray(arr) && arr.length) arr[arr.length - 1] += ` ${line.trim()}`;
      }
      continue;
    }

    const tag = m[1];
    const value = m[2].trim();

    if (tag === "TY") {
      current = { __type: value, __tags: {} };
      lastTag = null;
      continue;
    }
    if (tag === "ER") {
      if (current) records.push(risToRecord(current));
      current = null;
      lastTag = null;
      continue;
    }
    if (!current) continue;

    if (current.__tags[tag]) current.__tags[tag].push(value);
    else current.__tags[tag] = [value];
    lastTag = tag;
  }
  // Tolerate a missing trailing ER.
  if (current) records.push(risToRecord(current));
  return records;
}

const RIS_TYPE = {
  JOUR: "期刊", CONF: "会议", THES: "学位论文", BOOK: "图书",
  CHAP: "图书章节", RPRT: "报告", STD: "标准", PAT: "专利",
  NEWS: "报纸", ELEC: "电子资源", GEN: "其他",
};

function risToRecord({ __type, __tags }) {
  const one = (t) => (__tags[t] ? __tags[t][0] : "");
  const all = (t) => __tags[t] || [];
  return {
    title: one("TI") || one("T1") || one("CT"),
    authors: [...all("AU"), ...all("A1")],
    source: one("JO") || one("JF") || one("T2") || one("JA"),
    year: one("PY") || one("Y1") || one("DA"),
    pubDate: one("DA") || one("PY") || one("Y1"),
    docType: RIS_TYPE[String(__type).toUpperCase()] || __type || "",
    keywords: all("KW"),
    abstract: one("AB") || one("N2"),
    doi: one("DO"),
    volume: one("VL"),
    issue: one("IS"),
    pages: one("SP") ? (one("EP") ? `${one("SP")}-${one("EP")}` : one("SP")) : "",
    issn: one("SN"),
    url: one("UR") || one("L2"),
    pmid: one("AN") && /^\d+$/.test(one("AN")) ? one("AN") : "",
    language: one("LA"),
    publisher: one("PB"),
  };
}

// -------------------------------------------------------------- BibTeX

/** Minimal BibTeX reader: enough for reference-manager exports. */
export function parseBibTeX(text) {
  const records = [];
  const src = String(text);
  let i = 0;

  while (i < src.length) {
    const at = src.indexOf("@", i);
    if (at < 0) break;
    const braceOrParen = src.slice(at).match(/^@([A-Za-z]+)\s*([{(])/);
    if (!braceOrParen) {
      i = at + 1;
      continue;
    }
    const type = braceOrParen[1];
    const open = braceOrParen[2];
    const close = open === "{" ? "}" : ")";
    let depth = 0;
    let j = at + braceOrParen[0].length - 1;
    let body = "";
    for (; j < src.length; j++) {
      const ch = src[j];
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) break;
      }
      if (depth >= 1) body += ch;
    }
    i = j + 1;

    // body: "key, field = {value}, field = "value""
    const commaIdx = body.indexOf(",");
    const fieldsText = commaIdx >= 0 ? body.slice(commaIdx + 1) : body;
    const fields = {};
    const fieldRe = /([A-Za-z]+)\s*=\s*(\{([^{}]*(?:\{[^{}]*\})?[^{}]*)\}|"([^"]*)"|([^,}\s]+))/g;
    let fm;
    while ((fm = fieldRe.exec(fieldsText))) {
      const name = fm[1].toLowerCase();
      const value = (fm[3] ?? fm[4] ?? fm[5] ?? "").replace(/[{}]/g, "").trim();
      if (name) fields[name] = value;
    }
    records.push(bibToRecord(type, fields));
  }
  return records;
}

const BIB_TYPE = {
  article: "期刊", inproceedings: "会议", conference: "会议",
  phdthesis: "学位论文", mastersthesis: "学位论文", book: "图书",
  inbook: "图书章节", techreport: "报告", misc: "其他",
};

function bibToRecord(type, f) {
  const splitAuthors = (v) =>
    v ? v.split(/\s+and\s+/i).map((s) => s.replace(/[{}]/g, "").trim()).filter(Boolean) : [];
  return {
    title: f.title || "",
    authors: splitAuthors(f.author),
    source: f.journal || f.booktitle || f.publisher || "",
    year: f.year || (f.date || "").slice(0, 4),
    pubDate: f.date || f.year || "",
    docType: BIB_TYPE[String(type).toLowerCase()] || type,
    keywords: f.keywords ? f.keywords.split(/[;,]/).map((s) => s.trim()).filter(Boolean) : [],
    abstract: f.abstract || "",
    doi: f.doi || "",
    volume: f.volume || "",
    issue: f.number || "",
    pages: f.pages || "",
    issn: f.issn || "",
    url: f.url || "",
    pmid: f.pmid || "",
    language: f.language || "",
    publisher: f.publisher || "",
  };
}

// ------------------------------------------------------------- EndNote

/**
 * EndNote tagged export ("%A author", "%T title", ...), as produced by CNKI's
 * GetExport endpoint and by Web of Science's "EndNote Desktop" export.
 */
export function parseEndNote(text) {
  const records = [];
  let cur = null;

  const flush = () => {
    if (cur && Object.keys(cur.__tags).length) records.push(endnoteToRecord(cur.__tags));
    cur = null;
  };

  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/<br\s*\/?>/gi, "").replace(/\s+$/, "");
    const m = line.match(/^%([A-Za-z0-9])\s*(.*)$/);
    if (m) {
      const tag = m[1];
      const value = m[2].trim();
      if (!cur) cur = { __tags: {} };
      if (tag === "0" && Object.keys(cur.__tags).length) flush();
      if (!cur) cur = { __tags: {} };
      if (!cur.__tags[tag]) cur.__tags[tag] = [];
      if (value) cur.__tags[tag].push(value);
      continue;
    }
    // Indented continuation line.
    if (cur && /^\s+\S/.test(raw)) {
      const tags = Object.keys(cur.__tags);
      const last = tags[tags.length - 1];
      if (last && cur.__tags[last].length) {
        cur.__tags[last][cur.__tags[last].length - 1] += ` ${line.trim()}`;
      }
    }
  }
  flush();
  return records;
}

const ENDNOTE_TYPE = {
  "journal article": "期刊", book: "图书", "book section": "图书章节",
  "conference paper": "会议", thesis: "学位论文", report: "报告",
  webpage: "电子资源", newspaper: "报纸", patent: "专利",
};

function endnoteToRecord(t) {
  const first = (tag) => (t[tag] && t[tag][0] ? t[tag][0].trim() : "");
  const all = (tag) => (t[tag] || []).map((s) => s.trim()).filter(Boolean);
  const keywordAll = [...all("K"), ...all("6")].flatMap((v) => v.split(/[;；]/)).map((s) => s.trim()).filter(Boolean);
  const rawType = first("0");
  return {
    title: first("T"),
    authors: [...all("A"), ...all("E")],
    source: first("J") || first("B") || first("I"),
    year: first("D") || first("8"),
    pubDate: first("D") || first("8"),
    docType: ENDNOTE_TYPE[rawType.toLowerCase()] || rawType,
    keywords: [...new Set(keywordAll)],
    abstract: first("X") || first("N"),
    doi: first("R"),
    volume: first("V"),
    issue: first("N"),
    pages: first("P"),
    issn: first("7"),
    url: first("U"),
    pmid: first("M") || "",
    language: "",
    publisher: first("I"),
  };
}

// ----------------------------------------------------------------- JSON

/**
 * Accepts either a single record object, an array of records, or a CNKI module
 * output payload ({ records: [...] }) and maps known field names onto the
 * normalised schema.
 */
export function parseJSONRecords(input) {
  const data = typeof input === "string" ? JSON.parse(input) : input;
  const list = Array.isArray(data) ? data : data.records || data.records_ || [data];
  return list.map((r) => ({
    title: r.title || r["题名"] || "",
    authors: Array.isArray(r.authors)
      ? r.authors
      : String(r.authors || r["作者"] || "")
          .split(/[;；]/)
          .map((s) => s.trim())
          .filter(Boolean),
    source: r.source || r.journal || r["来源"] || "",
    year: String(r.year || r["年"] || ""),
    pubDate: r.pubDate || r["发表日期"] || "",
    docType: r.docType || r["文献类型"] || "",
    keywords: Array.isArray(r.keywords)
      ? r.keywords
      : String(r.keywords || r["关键词"] || "")
          .split(/[;；]/)
          .map((s) => s.trim())
          .filter(Boolean),
    abstract: r.abstract || r["摘要"] || "",
    doi: r.doi || r.DOI || "",
    volume: r.volume || r["卷"] || "",
    issue: r.issue || r["期"] || "",
    pages: r.pages || r["页数"] || "",
    issn: r.issn || "",
    url: r.url || r.link || r["知网链接"] || "",
    pmid: r.pmid || "",
    language: r.language || "",
    publisher: r.publisher || r.institution || "",
  }));
}
