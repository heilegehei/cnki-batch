/**
 * Second VIP probe: make the search actually happen, and find the export path.
 *
 * Findings from pass 1:
 *   - the result DOM is rich: checkbox data-id = article id, title link
 *     /Qikan/Article/Detail?id=<id>, per-record 题名/作者/出处/发文年/被引量
 *   - an export hook exists: javascript:quote('<id>')
 *   - but the keyword never reached the results (page still showed the default
 *     82,286,544-record listing), so submission needs the right interaction
 *     sequence for the layui widgets VIP uses.
 *
 * This probe tries several submission strategies and reports which one changes
 * the result set, then exercises the quote/export control.
 *
 * Run: node src/probe-vip-search2.js ["keyword"]
 */

import { launchChrome, connect, waitForCdp, sleep } from "./cdp.js";

const PORT = Number(process.env.CDP_PORT || 9222);
const KEY = process.argv[2] || "肺癌";

async function ensureChrome() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    if (res.ok) return await res.json();
  } catch {
    /* not running */
  }
  launchChrome({ port: PORT });
  return waitForCdp(PORT);
}

let page;
const apiLog = [];

/** A fingerprint of the current result set, used to detect that it changed. */
async function resultFingerprint() {
  return page.evaluate(() => {
    const t = document.body?.innerText || "";
    const first = document.querySelector("table tbody tr td.title a, table tr td.title a");
    return {
      total: (t.match(/共\s*找到\s*[\d,]+/) || [])[0] || "",
      firstTitle: first ? first.innerText.trim().slice(0, 50) : "",
      firstId: document.querySelector("input[data-id]")?.getAttribute("data-id") || "",
      rows: document.querySelectorAll("table tr").length,
    };
  });
}

async function typeKeyword(selector, kw) {
  return page.evaluate(
    (sel, value) => {
      const el = document.querySelector(sel);
      if (!el) return { ok: false, reason: `no element ${sel}` };
      el.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (setter) setter.call(el, value);
      else el.value = value;
      // layui listens on input/keyup; jQuery handlers want real events.
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keyup", { key: "l", bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, which: 13, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keypress", { key: "Enter", keyCode: 13, which: 13, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", keyCode: 13, which: 13, bubbles: true }));
      return { ok: true, value: el.value };
    },
    selector,
    kw
  );
}

async function clickByText(texts) {
  return page.evaluate((labels) => {
    const els = [...document.querySelectorAll("button, a, span, div, input[type=button], input[type=submit]")];
    for (const el of els) {
      if (el.offsetParent === null) continue;
      const t = (el.innerText || el.value || "").trim();
      if (labels.includes(t)) {
        el.click();
        return { ok: true, label: t, tag: el.tagName, cls: String(el.className).slice(0, 50) };
      }
    }
    return { ok: false, reason: "no button matched " + labels.join("/") };
  }, texts);
}

async function main() {
  const v = await ensureChrome();
  console.log(`Chrome: ${v.Browser} on :${PORT}\n`);

  const browser = await connect({ port: PORT });
  page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });

  page.on("request", (req) => {
    if (req.resourceType() !== "xhr" && req.resourceType() !== "fetch") return;
    const url = req.url();
    if (/captcha|cloudauth|LogRecord|GetBaseCookie|IsViewObject|IsStopServerice|CheckUserKind|BtnConfig/i.test(url)) return;
    apiLog.push({ method: req.method(), url: url.split("?")[0], query: url.includes("?") ? url.split("?")[1].slice(0, 200) : "", post: (req.postData() || "").slice(0, 300) });
  });

  await page.goto("https://qikan.cqvip.com/Qikan/Search/Index", { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(5000);

  const baseline = await resultFingerprint();
  console.log("baseline:", JSON.stringify(baseline));

  // Strategy 1: type into #searchKeywords then click 检索
  console.log("\n--- strategy 1: #searchKeywords + 检索 button ---");
  console.log("  type:", JSON.stringify(await typeKeyword("#searchKeywords", KEY)));
  console.log("  click:", JSON.stringify(await clickByText(["检索", "搜索"])));
  await sleep(9000);
  let fp = await resultFingerprint();
  console.log("  after:", JSON.stringify(fp));
  let changed = fp.total !== baseline.total || fp.firstId !== baseline.firstId;

  // Strategy 2: press Enter only (no button)
  if (!changed) {
    console.log("\n--- strategy 2: #searchKeywords + Enter ---");
    await typeKeyword("#searchKeywords", KEY);
    await page.keyboard.press("Enter");
    await sleep(9000);
    fp = await resultFingerprint();
    console.log("  after:", JSON.stringify(fp));
    changed = fp.total !== baseline.total || fp.firstId !== baseline.firstId;
  }

  // Strategy 3: navigate with the key= parameter in the documented form
  if (!changed) {
    console.log("\n--- strategy 3: direct URL with key= ---");
    for (const url of [
      `https://qikan.cqvip.com/Qikan/Search/Index?key=${encodeURIComponent(KEY)}`,
      `https://qikan.cqvip.com/Qikan/Search/Index?key=${encodeURIComponent("K=" + KEY)}`,
      `https://qikan.cqvip.com/Qikan/Search/Index?key=${encodeURIComponent("M=" + KEY)}`,
    ]) {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await sleep(7000);
      const f = await resultFingerprint();
      console.log(`  ${decodeURIComponent(url.split("key=")[1]).slice(0, 24).padEnd(26)} -> ${f.total} | first=${f.firstId} | ${f.firstTitle.slice(0, 36)}`);
      if (f.total !== baseline.total || f.firstId !== baseline.firstId) {
        changed = true;
        break;
      }
    }
  }

  console.log(`\nsearch submission ${changed ? "WORKS" : "did not change results"}`);

  // Inspect the export/quote path on whatever results are on screen.
  console.log("\n=== export path ===");
  const exportInfo = await page.evaluate(() => {
    const hasQuote = typeof window.quote === "function";
    const controls = [...document.querySelectorAll("a,button,span,li,div")]
      .filter((el) => el.offsetParent !== null)
      .map((el) => (el.innerText || "").trim())
      .filter((t) => /导出|引用|参考文献|EndNote|RIS|NoteExpress|BibTex|批量|导出文献|文献传递/i.test(t));
    return {
      quoteFunctionExists: hasQuote,
      exportControls: [...new Set(controls)].slice(0, 16),
      selectedCheckboxes: document.querySelectorAll("input[data-id]:checked").length,
      totalCheckboxes: document.querySelectorAll("input[data-id]").length,
    };
  });
  console.log(JSON.stringify(exportInfo, null, 2));

  // Select two records and open the quote control to capture the export request.
  console.log("\n=== select 2 records and trigger quote/export ===");
  await page.evaluate(() => {
    const boxes = [...document.querySelectorAll("input[data-id]")].slice(0, 2);
    for (const b of boxes) {
      b.click();
      b.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return boxes.length;
  });
  await sleep(1500);
  const sel = await page.evaluate(() => ({
    checked: document.querySelectorAll("input[data-id]:checked").length,
    selectedText: (document.querySelector("[class*=select], .layui-table-view") || {}).innerText?.slice(0, 80) || "",
  }));
  console.log("  selected:", JSON.stringify(sel));

  apiLog.length = 0;
  const quoteClicked = await page.evaluate(() => {
    // The row-level quote control opens the citation dialog.
    const a = document.querySelector("a.behavior-qutoe, a[href^='javascript:quote']");
    if (!a) return { ok: false, reason: "no quote link" };
    const href = a.getAttribute("href");
    a.click();
    return { ok: true, href };
  });
  console.log("  quote click:", JSON.stringify(quoteClicked));
  await sleep(6000);

  const dialog = await page.evaluate(() => {
    const dlgs = [...document.querySelectorAll("[class*=dialog], [class*=popup], [class*=modal], .layui-layer")].filter(
      (el) => el.offsetParent !== null
    );
    return {
      dialogCount: dlgs.length,
      dialogText: dlgs.map((d) => (d.innerText || "").replace(/\s+/g, " ").slice(0, 300)).slice(0, 3),
      citationSample: (document.body.innerText.match(/\[1\][^\n]{20,200}/) || [])[0] || "",
    };
  });
  console.log("  dialog:", JSON.stringify(dialog, null, 2));

  console.log("\n=== XHR/fetch during export attempt ===");
  for (const a of apiLog.slice(0, 12)) {
    console.log(`  ${a.method} ${a.url.slice(0, 90)}`);
    if (a.post) console.log(`    post: ${a.post}`);
  }

  console.log("\nreport complete. Chrome left open.");
}

main().catch((e) => {
  console.error("PROBE FAILED:", e.message || e);
  process.exit(1);
});
