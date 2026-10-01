/**
 * VIP (维普 / 中文科技期刊数据库) retrieval, driven through real Chrome over CDP.
 *
 * Why a browser: the VIP search endpoint answers 412 to a plain client, and the
 * result list is rendered client-side.
 *
 * Verified live (2026-10):
 *   - Search works only through a real form interaction. Navigating with the
 *     "key=" URL parameter is IGNORED: the page then shows its default
 *     82,286,544-record listing. Typing into #searchKeywords and clicking the
 *     "检索" control produced the correct hits for a TCM query.
 *     The site uses layui, which ignores a plain `el.value = x` assignment, so
 *     native setter + input/change/Enter events are required.
 *   - Each result row carries: checkbox data-id (= article id), title link
 *     /Qikan/Article/Detail?id=<id>, authors, journal, year, cited count and
 *     journal indexing badges (CAS/CSCD/北大核心). The list does NOT include
 *     the abstract, even in the 文摘 display mode (that button is active by
 *     default yet the abstract text is still absent).
 *   - Detail pages DO render without a subscription: clicking "展开更多"
 *     yielded full abstracts of 664-835 characters, plus keyword links.
 *     So records are enriched from their detail page.
 *
 * Route summary: harvest the list for metadata, then fetch each detail page for
 * abstract + keywords. Detail fetching is what makes this slower than the API
 * sources, hence the delay default and the optional limit.
 */

import { ensureChrome, waitFor, detectWall, typeInto, clickByText, sleep } from "./browser-utils.js";
import { RetrieveError } from "./common.js";

const SEARCH_URL = "https://qikan.cqvip.com/Qikan/Search/Index";
const SEARCH_BOX = "#searchKeywords";

export const name = "vip";
export const label = "维普 VIP";
export const requiresBrowser = true;
export const requiresAuth = false;

/** Read the rendered result rows out of the list DOM. */
const EXTRACT_ROWS = () => {
  const rows = [...document.querySelectorAll("table tbody tr")];
  const totalText = (document.body.innerText.match(/共\s*找到\s*[\d,]+/) || [])[0] || "";
  const pageText = (document.body.innerText.match(/<\s*(\d+)\s+\d*\s*…?\s*(\d+)\s*>/) || [])[0] || "";

  const records = rows
    .map((tr) => {
      const box = tr.querySelector("input[data-id]");
      const relAnchor = tr.querySelector("td a[articleid]");
      const titleAnchor = relAnchor || (tr.querySelector("td.title a") || tr.querySelector("a[href*=Article/Detail]"));
      const title = titleAnchor ? titleAnchor.innerText.trim() : "";
      if (!title) return null;

      const articleId =
        box?.getAttribute("data-id") ||
        relAnchor?.getAttribute("articleid") ||
        (titleAnchor?.getAttribute("href") || "").match(/[?&]id=(\d+)/)?.[1] ||
        "";

      const authorLinks = [...tr.querySelectorAll("td.t-left a[href*='key=A']")];
      const authors =
        authorLinks.length > 0
          ? authorLinks.map((a) => a.getAttribute("title") || a.innerText.trim()).filter(Boolean)
          : [];

      const journalAnchor = tr.querySelector("td a[href*='Journal/Summary']");
      const journal = journalAnchor ? journalAnchor.getAttribute("title") || journalAnchor.innerText.replace(/[《》]/g, "").trim() : "";

      const year = (tr.querySelector("td.cited")?.innerText || "").match(/(1[89]\d{2}|20\d{2})/)?.[1] || "";

      // The list never carries an abstract or keyword links (confirmed against
      // the live DOM in every display mode), so both are filled from the detail
      // page during enrichment.
      const rowText = (tr.innerText || "").replace(/\s+/g, " ");
      const cited = Number((rowText.match(/被引量：\s*(\d+)/) || [])[1] || 0);

      return {
        title,
        authors: [...new Set(authors)],
        source: journal,
        year,
        pubDate: year,
        docType: "期刊",
        keywords: [],
        abstract: "",
        doi: "",
        pmid: "",
        articleId,
        url: articleId ? `https://qikan.cqvip.com/Qikan/Article/Detail?id=${articleId}` : "",
        language: "Chinese",
        citedByCount: cited,
        publishedAt: "",
        // Journal indexing badges shown next to the source name.
        sourceTags: ["CAS", "CSCD", "北大核心", "CSSCI", "EI", "SCI"].filter((t) => rowText.includes(t)),
      };
    })
    .filter(Boolean);

  return { totalText, pageText, records };
};

/**
 * Read one detail page: expand the abstract, then take the abstract text,
 * keywords and the publication date.
 *
 * Verified: works without a subscription, and "展开更多" raises the abstract
 * from a 398-character preview to the full 664-835 characters.
 */
const EXTRACT_DETAIL = () => {
  const expand = [...document.querySelectorAll("a, span, div, button")].find(
    (el) => /^展开更多$/.test((el.innerText || "").trim()) && el.offsetParent !== null
  );
  if (expand) expand.click();

  const abstractNode =
    document.querySelector(".abstract, [class*=abstract]") ||
    [...document.querySelectorAll("div, p")].find((el) => /^摘\s*要/.test((el.innerText || "").trim()));

  const abstract = abstractNode
    ? (abstractNode.innerText || "")
        .replace(/^摘\s*要\s*/, "")
        .replace(/展开更多|收起/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";

  const keywords = [...document.querySelectorAll("a[href*='key=']")]
    .filter((a) => /key=(K|M)=/i.test(decodeURIComponent(a.getAttribute("href") || "")))
    .map((a) => a.innerText.trim())
    .filter(Boolean);

  const body = document.body?.innerText || "";
  const pubDate = (body.match(/(20\d{2})[-年/](\d{1,2})[-月/](\d{1,2})/) || [])[0] || "";

  return { abstract, keywords: [...new Set(keywords)], pubDate, expanded: !!expand };
};

/**
 * Run a search on VIP.
 *
 * @param {string} query keyword(s); VIP field syntax such as "K=肺癌" also works
 * @param {{limit?:number, maxPages?:number, port?:number, reuse?:boolean,
 *          perPage?:20|50|100, delayMs?:number, enrich?:boolean,
 *          onProgress?:Function, signal?:AbortSignal}} [opts]
 */
export async function retrieve(query, opts = {}) {
  const limit = opts.limit ?? 100;
  const maxPages = opts.maxPages ?? Math.max(1, Math.ceil(limit / (opts.perPage || 20)));
  const delayMs = opts.delayMs ?? 1500;
  const enrich = opts.enrich !== false;

  const { browser, version, launched } = await ensureChrome({ port: opts.port ?? 9222, reuse: opts.reuse !== false });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });

  const collected = [];
  const seen = new Set();
  let totalHits = 0;
  let pagesRead = 0;

  try {
    await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitFor(page, () => !!document.querySelector("#searchKeywords"), {
      label: "VIP search box",
      timeoutMs: 45000,
    });
    await sleep(2500);

    const wall = await detectWall(page);
    if (wall.verifyInUrl || wall.wallText) {
      throw new RetrieveError("VIP presented a verification wall before searching", { url: SEARCH_URL });
    }

    // A real interaction is required; the URL parameter alone is ignored.
    const typed = await typeInto(page, SEARCH_BOX, query);
    if (!typed.ok) throw new RetrieveError(`could not fill the VIP search box: ${typed.reason}`);
    const clicked = await clickByText(page, ["检索", "搜索"]);
    if (!clicked.ok) {
      await page.keyboard.press("Enter");
    }

    await waitFor(
      page,
      (kw) => {
        const t = document.body.innerText || "";
        const hasRows = document.querySelectorAll("table tbody tr td.title a").length > 0;
        // Confirm the result set reflects our term rather than the default list.
        return hasRows && !/共\s*找到\s*82,286,544/.test(t);
      },
      { label: "VIP results reflecting the query", timeoutMs: 45000 }
    );
    await sleep(2000);

    for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
      const state = await page.evaluate(EXTRACT_ROWS);
      if (pageNo === 1) {
        const m = state.totalText.match(/([\d,]+)/);
        totalHits = m ? Number(m[1].replace(/,/g, "")) : 0;
      }
      const before = collected.length;
      for (const r of state.records) {
        if (!r.title || seen.has(r.title)) continue;
        seen.add(r.title);
        collected.push({ ...r, pageIndex: pageNo });
        if (collected.length >= limit) break;
      }
      pagesRead = pageNo;
      opts.onProgress?.(`      VIP page ${pageNo}: +${collected.length - before} (total ${collected.length})`);
      if (collected.length >= limit) break;

      const advanced = await page.evaluate(() => {
        const links = [...document.querySelectorAll("a")];
        const next = links.find((a) => a.innerText.trim() === "下一页" && a.offsetParent !== null);
        if (!next) return false;
        next.click();
        return true;
      });
      if (!advanced) break;
      await sleep(delayMs);
      const stillThere = await page
        .evaluate(() => document.querySelectorAll("table tbody tr td.title a").length > 0)
        .catch(() => false);
      if (!stillThere) break;
    }

    // --- enrichment: the list has no abstract, so read each detail page
    let enriched = 0;
    if (enrich) {
      for (const rec of collected) {
        if (opts.signal?.aborted) break;
        if (!rec.articleId || rec.abstract) continue;
        try {
          await page.goto(rec.url, { waitUntil: "domcontentloaded", timeout: 60000 });
          await waitFor(page, () => !!document.querySelector("[class*=abstract], .abstract, h1"), {
            label: "detail page",
            timeoutMs: 30000,
          }).catch(() => {});
          await sleep(1200);
          const detail = await page.evaluate(EXTRACT_DETAIL);
          // Give the expansion a moment, then read again for the full text.
          await sleep(900);
          const after = await page.evaluate(() => {
            const node =
              document.querySelector(".abstract, [class*=abstract]") ||
              [...document.querySelectorAll("div, p")].find((el) => /^摘\s*要/.test((el.innerText || "").trim()));
            return node
              ? (node.innerText || "").replace(/^摘\s*要\s*/, "").replace(/展开更多|收起/g, " ").replace(/\s+/g, " ").trim()
              : "";
          });
          rec.abstract = after.length > detail.abstract.length ? after : detail.abstract;
          if (detail.keywords.length) rec.keywords = detail.keywords;
          if (detail.pubDate) rec.pubDate = detail.pubDate;
          if (rec.abstract) enriched++;
          opts.onProgress?.(`      VIP detail ${enriched}/${collected.length}: ${rec.articleId} (${rec.abstract.length} chars)`);
        } catch (e) {
          opts.onProgress?.(`      VIP detail failed for ${rec.articleId}: ${e.message}`);
        }
        await sleep(delayMs);
      }
    }

    return {
      source: label,
      sourceKey: name,
      query,
      totalHitsReported: totalHits,
      retrievedCount: collected.length,
      pagesRead,
      enriched,
      records: collected,
      browser: { launched, version: version?.Browser },
    };
  } finally {
    try {
      await page.close();
    } catch {
      /* ignore */
    }
    await browser.disconnect();
  }
}
