/**
 * CNKI (中国知网) deterministic batch retrieval.
 *
 * Feeds a guideline / expert-consensus literature pipeline. Mirrors the design
 * of the existing PubMed module: no LLM involvement, records taken verbatim
 * from CNKI, and full provenance (query, timestamp, hit count) recorded so the
 * methodology section is reproducible.
 *
 * How it works (validated live against kns.cnki.net):
 *   1. Drive a visible Chrome over CDP inside the institution's IP session.
 *   2. Run a normal or professional (专业检索) query.
 *   3. Harvest `input.cbItem` values from the result table. Each value IS the
 *      encrypted export id (discovery credited to cookjohn/cnki-skills).
 *   4. POST each id to /dm8/API/GetExport for GBTREFER + ELEARNING + ENDNOTE.
 *      The ELEARNING payload carries the abstract; the result-page HTML does
 *      not, so this step is required for screening by abstract.
 *
 * Browser automation is used because CNKI has no public API and redirects
 * plain HTTP clients to a captcha (/verify/home?captchaType=blockPuzzle).
 *
 * Usage:
 *   node src/cnki-batch.js --query "中医药 肺癌 围手术期" --out out --maxPages 3
 *   node src/cnki-batch.js --query "SU=('肺癌') AND KY=('围手术期')" --advanced
 *   node src/cnki-batch.js --query "..." --reuse      # attach to existing :9222
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CNKI, connect, launchChrome, sleep, waitForCdp } from "./cdp.js";

// ---------------------------------------------------------------- CLI

function parseArgs(argv) {
  const out = {
    query: "",
    out: "out",
    maxPages: 1,
    limit: Infinity,
    delayMs: 1200,
    port: Number(process.env.CDP_PORT || 9222),
    advanced: false,
    reuse: false,
    sort: "",
    headless: false,
    timeoutMs: 60000,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--query": out.query = next(); break;
      case "--out": out.out = next(); break;
      case "--maxPages": out.maxPages = Number(next()); break;
      case "--limit": out.limit = Number(next()); break;
      case "--delayMs": out.delayMs = Number(next()); break;
      case "--port": out.port = Number(next()); break;
      case "--sort": out.sort = next(); break;
      case "--advanced": out.advanced = true; break;
      case "--reuse": out.reuse = true; break;
      case "--headless": out.headless = true; break;
      default:
        if (!a.startsWith("--") && !out.query) out.query = a;
        break;
    }
  }
  return out;
}

const args = parseArgs(process.argv);
if (!args.query) {
  console.error('Missing --query. Example: node src/cnki-batch.js --query "中医药 肺癌" --maxPages 2');
  process.exit(2);
}

const stamp = () =>
  new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);

// ------------------------------------------------------- ELEARNING parsing

// CNKI labels its ELEARNING fields as "<Chinese>-<English>: <value>". Splitting
// on the FIRST colon is safe because the Chinese label never contains one,
// even though abstract bodies contain many.
const FIELD_MAP = {
  "title": "title",
  "author": "authors",
  "source": "source",
  "year": "year",
  "pubtime": "pubDate",
  "keyword": "keywords",
  "summary": "abstract",
  "period": "issue",
  "pagecount": "pageCount",
  "srcdatabase": "srcDatabase",
  "teacher": "advisor",
  "degree": "degree",
  "organ": "institution",
  "link": "link",
  "doi": "doi",
  "volume": "volume",
  "page": "pages",
  "fund": "fund",
  "datatype": "dataType",
  "citedtimes": "citedTimes",
  "download": "downloadCount",
};

function labelToKey(label) {
  // Labels look like "PubTime-发表时间" / "Title-题名" / "Author-作者". Split on
  // the FIRST hyphen to isolate the English side; the Chinese side never
  // contains a hyphen, but some English names do.
  const english = label.includes("-") ? label.slice(0, label.indexOf("-")) : label;
  const norm = english.toLowerCase().replace(/[^a-z]/g, "");
  return FIELD_MAP[norm] || null;
}

// GB/T 7714 carries the document type as a bracketed letter, which is the most
// reliable type signal available from the export response.
const GBT_TYPE = {
  J: "期刊", D: "学位论文", C: "会议", N: "报纸", M: "图书",
  S: "标准", P: "专利", R: "报告", A: "析出文献", Z: "其他",
};

function docTypeFromGbt(gbt) {
  const m = String(gbt || "").match(/\[([A-Z])\]/);
  return m ? GBT_TYPE[m[1]] || "" : "";
}

export function parseElearning(text) {
  if (!text) return {};
  const lines = String(text).replace(/<br\s*\/?>/gi, "\n").split("\n");
  const rec = {};
  for (const raw of lines) {
    const line = raw.replace(/\u00a0/g, " ").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const label = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!value) continue;
    const key = labelToKey(label);
    if (!key) continue;
    if (rec[key]) {
      rec[key] = `${rec[key]}; ${value}`;
    } else {
      rec[key] = value;
    }
  }
  return rec;
}

export function parseEndnote(text) {
  if (!text) return {};
  const rec = {};
  const tagMap = { A: "authors", T: "title", J: "source", D: "year", K: "keywords",
                   X: "abstract", R: "doi", U: "link", I: "institution", V: "volume",
                   N: "issue", P: "pages", "9": "degree", Y: "advisor" };
  for (const raw of String(text).replace(/<br\s*\/?>/gi, "\n").split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("%")) continue;
    const tag = line.slice(1, 2);
    const value = line.slice(2).trim();
    const key = tagMap[tag];
    if (!key || !value) continue;
    rec[key] = rec[key] ? `${rec[key]}; ${value}` : value;
  }
  return rec;
}

const clean = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : v || "");

function normalizeRecord(elearning, endnote, gbt, meta) {
  const e = elearning || {};
  const n = endnote || {};
  const authors = clean(e.authors || n.authors);
  const keywords = clean(e.keywords || n.keywords)
    .split(/[;；]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join("; ");
  const gbtCitation = clean(gbt).replace(/<br\s*\/?>/gi, " ").trim();
  const docType = clean(meta.docType) || docTypeFromGbt(gbtCitation);
  return {
    title: clean(e.title || n.title),
    authors: authors.replace(/;+$/, "").split(/[;；]/).map((s) => s.trim()).filter(Boolean).join("; "),
    source: clean(e.source || n.source),
    year: clean(e.year || n.year),
    pubDate: clean(e.pubDate),
    docType,
    keywords,
    abstract: clean(e.abstract || n.abstract),
    doi: clean(e.doi || n.doi),
    institution: clean(e.institution || n.institution),
    degree: clean(e.degree || n.degree),
    advisor: clean(e.advisor || n.advisor),
    issue: clean(e.issue || n.issue),
    pages: clean(e.pageCount || n.pages),
    srcDatabase: clean(e.srcDatabase) || docTypeFromGbt(gbtCitation),
    link: clean(e.link || n.link),
    gbtCitation,
    detailUrl: clean(meta.detailUrl),
    exportId: meta.exportId,
    pageIndex: meta.pageIndex,
    seq: meta.seq,
  };
}

// ------------------------------------------------------------- page helpers

async function detectCaptcha(page) {
  return page
    .evaluate(() => {
      const el = document.querySelector("#tcaptcha_transform_dy");
      return {
        inVerifyUrl: location.href.includes("/verify/"),
        visible: !!el && el.getBoundingClientRect().top >= 0,
      };
    })
    .catch(() => ({ inVerifyUrl: false, visible: false }));
}

async function assertNoCaptcha(page, stage) {
  const c = await detectCaptcha(page);
  if (c.inVerifyUrl || c.visible) {
    throw new Error(
      `CAPTCHA_BLOCKED at ${stage}. Solve the slider in the Chrome window, then re-run with --reuse.`
    );
  }
}

async function submitSearch(page, query, advanced) {
  const target = advanced ? CNKI.advanced : CNKI.search;
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: args.timeoutMs });
  await sleep(2500);
  await assertNoCaptcha(page, "open search page");

  const submitted = await page.evaluate(
    (q, isAdvanced) => {
      const setNative = (el, value) => {
        const proto = el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter) setter.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };

      const input = isAdvanced
        ? document.querySelector("textarea.textarea-major.majorSearch, textarea.majorSearch")
        : document.querySelector("input.search-input") || document.querySelector("#txt_search");
      if (!input) return { ok: false, reason: "no input element" };
      input.focus();
      setNative(input, q);

      const btn = isAdvanced
        ? [...document.querySelectorAll("input, button, a")].find((el) =>
            /检索|搜索/.test(el.value || el.innerText || "")
          )
        : document.querySelector("input.search-btn") || document.querySelector(".search-btn");
      if (btn) {
        btn.click();
        return { ok: true, via: "click" };
      }
      return { ok: false, reason: "no submit control" };
    },
    query,
    advanced
  );
  if (!submitted.ok) throw new Error(`search submit failed: ${submitted.reason}`);

  // Wait for the result table or a verify redirect.
  const deadline = Date.now() + args.timeoutMs;
  while (Date.now() < deadline) {
    if (page.url().includes("/verify/")) break;
    const ready = await page
      .evaluate(() => !!document.querySelector(".result-table-list tbody tr, #gridTable tbody tr"))
      .catch(() => false);
    if (ready) break;
    await sleep(1000);
  }
  await sleep(1500);
  await assertNoCaptcha(page, "after search submit");
}

async function readMeta(page) {
  return page.evaluate(() => {
    const t = document.body.innerText || "";
    return {
      url: location.href,
      totalText: (t.match(/共\s*找到\s*[\d,]+\s*条/) || [])[0] || "",
      total: Number((t.match(/共\s*找到\s*([\d,]+)\s*条/) || [])[1]?.replace(/,/g, "") || 0),
      pageMark: document.querySelector(".countPageMark")?.innerText?.trim() || "",
    };
  });
}

async function harvestRows(page) {
  return page.evaluate(() => {
    const trs = [...document.querySelectorAll(".result-table-list tbody tr, #gridTable tbody tr")];
    return trs.map((tr, i) => {
      const cb = tr.querySelector("input.cbItem");
      const titleA = tr.querySelector("td.name a.fz14") || tr.querySelector("td.name a");
      return {
        seq: i + 1,
        exportId: cb ? cb.value : "",
        detailUrl: titleA ? titleA.href : "",
        docType: tr.querySelector("td.data, td.ctype, td.type")?.innerText?.trim() || "",
        rowTitle: titleA ? titleA.innerText.trim() : "",
      };
    });
  });
}

async function gotoNextPage(page, currentPageNumber, pageSign) {
  const clicked = await page.evaluate(() => {
    const links = [...document.querySelectorAll(".pages a, #PageNext")];
    const next =
      links.find((a) => a.innerText.trim() === "下一页") ||
      document.querySelector("#PageNext");
    if (!next) return false;
    next.click();
    return true;
  });
  if (!clicked) return { moved: false, reason: "last page" };

  const deadline = Date.now() + args.timeoutMs;
  while (Date.now() < deadline) {
    const sig = await page
      .evaluate(() => {
        const mark = document.querySelector(".countPageMark")?.innerText?.trim() || "";
        const first = document.querySelector(".result-table-list tbody tr input.cbItem")?.value || "";
        return `${mark}|${first.slice(0, 24)}`;
      })
      .catch(() => "");
    // A new page shows a different page counter (and different first record).
    if (sig && !sig.startsWith(String(currentPageNumber) + "|")) {
      return { moved: true };
    }
    await sleep(700);
  }
  return { moved: false, reason: "page change timed out" };
}

async function fetchExport(page, exportId, attempts = 3) {
  let lastErr = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const res = await page
      .evaluate(
        async (apiUrl, id) => {
          const body = new URLSearchParams({
            filename: id,
            displaymode: "GBTREFER,elearning,EndNote",
            uniplatform: "NZKPT",
          });
          try {
            const resp = await fetch(apiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body,
            });
            const text = await resp.text();
            let json = null;
            try { json = JSON.parse(text); } catch { /* non-JSON */ }
            return { status: resp.status, json, raw: json ? "" : text.slice(0, 400) };
          } catch (e) {
            return { status: 0, error: String(e) };
          }
        },
        CNKI.exportApi,
        exportId
      )
      .catch((e) => ({ status: 0, error: String(e) }));

    if (res.status === 200 && res.json && res.json.code === 1) {
      const byMode = {};
      for (const item of res.json.data || []) {
        const mode = String(item.mode || item.key || "").toUpperCase();
        const val = Array.isArray(item.value) ? item.value[0] : item.value;
        byMode[mode] = val;
      }
      return {
        gbt: byMode.GBTREFER || "",
        elearning: parseElearning(byMode.ELEARNING),
        endnote: parseEndnote(byMode.ENDNOTE),
      };
    }
    lastErr = `HTTP ${res.status} ${res.error || res.raw || ""}`.trim();
    if (res.status === 403) break; // security verification: retrying will not help
    await sleep(1500 * attempt);
  }
  throw new Error(lastErr || "export failed");
}

// ------------------------------------------------------------------- main

async function main() {
  let browser;
  if (args.reuse) {
    browser = await connect({ port: args.port });
    console.log(`[setup] attached to existing Chrome on :${args.port}`);
  } else {
    launchChrome({ port: args.port, headless: args.headless });
    const v = await waitForCdp(args.port);
    browser = await connect({ port: args.port });
    console.log(`[setup] launched ${v.Browser} on :${args.port}`);
  }

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });

  const startedAt = new Date().toISOString();
  console.log(`[1/4] searching (${args.advanced ? "professional" : "one-box"}): ${args.query}`);
  await submitSearch(page, args.query, args.advanced);

  const meta = await readMeta(page);
  console.log(`      ${meta.totalText || "hits unknown"} | page ${meta.pageMark || "?"}`);

  console.log(`[2/4] harvesting result rows across up to ${args.maxPages} page(s)`);
  const rows = [];
  const seen = new Set();
  let pageNo = 1;

  while (pageNo <= args.maxPages && rows.length < args.limit) {
    await assertNoCaptcha(page, `page ${pageNo}`);
    const pageRows = await harvestRows(page);
    let added = 0;
    for (const r of pageRows) {
      if (!r.exportId || seen.has(r.exportId)) continue;
      seen.add(r.exportId);
      rows.push({ ...r, pageIndex: pageNo });
      added++;
      if (rows.length >= args.limit) break;
    }
    const mk = await readMeta(page);
    console.log(`      page ${pageNo}: +${added} new (total ${rows.length}) [${mk.pageMark}]`);

    if (pageNo >= args.maxPages || rows.length >= args.limit) break;
    const nav = await gotoNextPage(page, pageNo, mk.pageMark);
    if (!nav.moved) {
      console.log(`      stopping at page ${pageNo} (${nav.reason})`);
      break;
    }
    pageNo++;
    await sleep(args.delayMs);
  }

  if (!rows.length) {
    console.error("No results harvested. Nothing to export.");
    await browser.disconnect();
    process.exit(1);
  }

  console.log(`[3/4] exporting ${rows.length} record(s) via GetExport`);
  const records = [];
  const failures = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const exp = await fetchExport(page, r.exportId);
      const rec = normalizeRecord(exp.elearning, exp.endnote, exp.gbt, r);
      records.push(rec);
      const flag = rec.abstract ? "abstract" : "NO-ABSTRACT";
      console.log(
        `      [${String(i + 1).padStart(3)}/${rows.length}] ${flag}  ${rec.title.slice(0, 48)}`
      );
    } catch (e) {
      failures.push({ ...r, error: String(e.message || e) });
      console.log(`      [${String(i + 1).padStart(3)}/${rows.length}] FAILED  ${e.message}`);
      if (String(e.message).includes("CAPTCHA") || String(e.message).includes("403")) break;
    }
    await sleep(args.delayMs);
  }

  // ------------------------------------------------------------ output
  console.log("[4/4] writing outputs");
  const outDir = path.resolve(args.out);
  mkdirSync(outDir, { recursive: true });
  const base = `cnki_${stamp()}`;

  const payload = {
    source: "CNKI (中国知网)",
    database: "CNKI",
    query: args.query,
    searchMode: args.advanced ? "professional" : "one-box",
    searchUrl: meta.url,
    totalHitsReported: meta.total,
    totalText: meta.totalText,
    retrievedAt: startedAt,
    finishedAt: new Date().toISOString(),
    pagesRequested: args.maxPages,
    pagesRead: pageNo,
    recordCount: records.length,
    failureCount: failures.length,
    records,
    failures,
  };

  const jsonPath = path.join(outDir, `${base}.json`);
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");

  const cols = [
    ["seq", "#"],
    ["title", "题名"],
    ["authors", "作者"],
    ["source", "来源"],
    ["docType", "文献类型"],
    ["year", "年"],
    ["pubDate", "发表日期"],
    ["keywords", "关键词"],
    ["abstract", "摘要"],
    ["doi", "DOI"],
    ["institution", "机构"],
    ["degree", "学位"],
    ["advisor", "导师"],
    ["issue", "期"],
    ["pages", "页数"],
    ["srcDatabase", "来源库"],
    ["gbtCitation", "GB/T 7714"],
    ["detailUrl", "知网链接"],
  ];
  const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csvLines = [cols.map(([, h]) => csvCell(h)).join(",")];
  records.forEach((rec, i) => {
    csvLines.push(cols.map(([k]) => csvCell(k === "seq" ? i + 1 : rec[k])).join(","));
  });
  const csvPath = path.join(outDir, `${base}.csv`);
  writeFileSync(csvPath, "\uFEFF" + csvLines.join("\r\n"), "utf8");

  console.log(`      JSON: ${jsonPath}`);
  console.log(`      CSV : ${csvPath}`);
  const withAbs = records.filter((r) => r.abstract).length;
  console.log(
    `\nDone. ${records.length} record(s), ${withAbs} with abstract, ${failures.length} failure(s).`
  );

  await browser.disconnect();
}

main().catch((e) => {
  console.error("\nBATCH FAILED:", e.message || e);
  process.exit(1);
});
