/**
 * Focused re-probe of VIP (维普): the first pass showed rendered results but the
 * URL "key=" parameter was ignored, so the results were unrelated to the query.
 * This performs a real form submission and then works out the result DOM and
 * the export path.
 *
 * Also checks whether Wanfang releases its Alibaba Cloud verification wall after
 * a manual solve, by polling in the same session.
 *
 * Run: node src/probe-vip-search.js ["keyword"]
 */

import { launchChrome, connect, waitForCdp, sleep } from "./cdp.js";

const PORT = Number(process.env.CDP_PORT || 9222);
const KEY = process.argv[2] || "肺癌 中医药";

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

const json = [];
let page;

async function renderState() {
  return page.evaluate(() => {
    const text = document.body?.innerText || "";
    return {
      url: location.href,
      totalLine: (text.match(/共\s*找到[^\n]{0,30}/) || [])[0] || "",
      rowCount: document.querySelectorAll("table tr").length,
      checkboxCount: document.querySelectorAll("input[type=checkbox]").length,
      titleSample: [...document.querySelectorAll("table tr")]
        .slice(1, 4)
        .map((tr) => (tr.innerText || "").replace(/\s+/g, " ").slice(0, 110)),
    };
  });
}

async function main() {
  const v = await ensureChrome();
  console.log(`Chrome: ${v.Browser} on :${PORT}`);
  console.log(`keyword: "${KEY}"\n`);

  const browser = await connect({ port: PORT });
  page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });

  page.on("response", async (res) => {
    const ct = (res.headers()["content-type"] || "").toLowerCase();
    if (!ct.includes("json")) return;
    const url = res.url();
    if (/captcha|cloudauth|LogRecord|GetBaseCookie|IsViewObject|IsStopServerice|CheckUserKind|BtnConfig|getUserState/i.test(url)) return;
    try {
      const t = await res.text();
      if (t.length < 60 || t.length > 300000) return;
      json.push({ url, method: res.request().method(), body: t.slice(0, 900), size: t.length });
    } catch {
      /* ignore */
    }
  });

  console.log("=== open VIP search page ===");
  await page.goto("https://qikan.cqvip.com/Qikan/Search/Index", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await sleep(5000);

  const inputs = await page.evaluate(() =>
    [...document.querySelectorAll("input,textarea")]
      .filter((el) => el.offsetParent !== null)
      .slice(0, 10)
      .map((el) => ({
        type: el.type || el.tagName,
        id: el.id || "",
        name: el.name || "",
        cls: (el.className || "").toString().slice(0, 50),
        ph: el.placeholder || "",
        visible: el.getBoundingClientRect().width > 100,
      }))
  );
  console.log("  visible inputs:", JSON.stringify(inputs, null, 2));

  console.log("\n=== submit the search form ===");
  const submitted = await page.evaluate((kw) => {
    const cands = [...document.querySelectorAll("input[type=text], input:not([type])")].filter(
      (el) => el.offsetParent !== null && el.getBoundingClientRect().width > 150
    );
    if (!cands.length) return { ok: false, reason: "no visible search box" };

    const box = cands.find((el) => /search|key|q/i.test(el.id + el.name + el.className)) || cands[0];
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(box, kw);
    else box.value = kw;
    box.dispatchEvent(new Event("input", { bubbles: true }));
    box.dispatchEvent(new Event("change", { bubbles: true }));
    box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }));

    const btns = [...document.querySelectorAll("button, input[type=button], input[type=submit], a, span, div")].filter(
      (el) => el.offsetParent !== null
    );
    const btn = btns.find((el) => /^(检索|搜索|搜一下)$/.test((el.innerText || el.value || "").trim()));
    if (btn) {
      btn.click();
      return { ok: true, via: "button", box: { id: box.id, cls: box.className } };
    }
    return { ok: true, via: "enter", box: { id: box.id, cls: box.className } };
  }, KEY);
  console.log("  submit:", JSON.stringify(submitted));

  await sleep(9000);
  const state = await renderState();
  console.log("\n=== after submit ===");
  console.log(`  url        : ${state.url}`);
  console.log(`  total line : ${state.totalLine}`);
  console.log(`  table rows : ${state.rowCount} | checkboxes: ${state.checkboxCount}`);
  console.log("  sample rows:");
  for (const t of state.titleSample) console.log(`    ${t}`);

  console.log("\n=== result DOM structure ===");
  const dom = await page.evaluate(() => {
    const table = document.querySelector("table");
    if (!table) return { note: "no table" };
    const headers = [...table.querySelectorAll("thead th, thead td")].map((th) =>
      (th.innerText || "").replace(/\s+/g, " ").trim()
    );
    const firstRow = table.querySelector("tbody tr") || table.querySelectorAll("tr")[1];
    return {
      headers,
      firstRowHtml: firstRow ? firstRow.outerHTML.slice(0, 2200) : "",
      checkboxAttrs: (() => {
        const cb = document.querySelector("table input[type=checkbox]");
        if (!cb) return null;
        return {
          name: cb.name,
          value: cb.value,
          id: cb.id,
          // VIP often stores the article id in a data attribute or the row.
          dataAttrs: Object.fromEntries([...cb.attributes].map((a) => [a.name, a.value])),
        };
      })(),
      linkSample: [...document.querySelectorAll("table a")].slice(0, 6).map((a) => ({
        text: (a.innerText || "").trim().slice(0, 40),
        href: a.getAttribute("href"),
      })),
      exportControls: [...document.querySelectorAll("a,button,span,li")]
        .map((el) => (el.innerText || "").trim())
        .filter((t) => /导出|引用|参考文献|EndNote|RIS|NoteExpress|BibTex|批量/i.test(t))
        .slice(0, 14),
    };
  });
  console.log(JSON.stringify(dom, null, 2));

  console.log("\n=== non-telemetry JSON responses ===");
  for (const r of json.slice(0, 10)) {
    console.log(`  ${r.method} ${r.url.split("?")[0].slice(0, 96)} (${r.size} bytes)`);
    console.log(`    ${r.body.replace(/\s+/g, " ").slice(0, 260)}`);
  }

  console.log("\n=== Wanfang: poll for the verification wall to clear ===");
  const wf = await browser.newPage();
  await wf.setViewport({ width: 1400, height: 900 });
  await wf.goto("https://s.wanfangdata.com.cn/paper?q=" + encodeURIComponent(KEY), {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  for (let i = 0; i < 6; i++) {
    await sleep(5000);
    const s = await wf.evaluate(() => {
      const t = document.body?.innerText || "";
      return {
        onVerify: /verify/i.test(location.href),
        wall: /请完成安全验证|为保障数据与服务安全/.test(t),
        rows: document.querySelectorAll("table tr").length,
        total: (t.match(/共\s*[\d,]+ 条|找到\s*[\d,]+/) || [])[0] || "",
      };
    });
    console.log(
      `  t+${(i + 1) * 5}s onVerify=${s.onVerify} wall=${s.wall} rows=${s.rows} total="${s.total}"`
    );
    if (!s.wall && s.rows > 3) {
      console.log("  -> Wanfang released the wall; results are reachable in-session.");
      break;
    }
  }

  console.log("\nreport complete. Chrome left open for manual inspection.");
}

main().catch((e) => {
  console.error("PROBE FAILED:", e.message || e);
  process.exit(1);
});
