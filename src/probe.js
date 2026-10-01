// Step 1 probe: launch Chrome, open CNKI, and report what the live session
// actually looks like (captcha? institutional IP? which result-page selectors
// exist?). This validates the selectors the two repos documented before we
// build the batch pipeline on top of them.

import { CNKI, connect, launchChrome, sleep, waitForCdp } from "./cdp.js";

const PORT = Number(process.env.CDP_PORT || 9222);

function log(...a) {
  console.log(...a);
}

/**
 * Attach to an already-debuggable Chrome when one is listening, otherwise
 * launch it. Keeps the probe runnable whether or not a session is already up.
 */
async function ensureChrome() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    if (res.ok) {
      const v = await res.json();
      log("       reusing running Chrome:", v.Browser);
      return v;
    }
  } catch {
    /* nothing listening yet */
  }
  launchChrome({ port: PORT });
  const v = await waitForCdp(PORT);
  log("      ", v.Browser);
  return v;
}

async function main() {
  const key = process.argv[2] || "数字经济";

  log("[1/5] ensuring Chrome with CDP on port", PORT);
  const version = await ensureChrome();

  const browser = await connect({ port: PORT });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });

  // Node's own TLS stack works here, so normalise any schannel-ish weirdness
  // by only relying on in-page navigation.
  log("[2/5] opening CNKI home");
  try {
    await page.goto(CNKI.home, { waitUntil: "domcontentloaded", timeout: 60000 });
  } catch (e) {
    log("      goto home failed:", e.message);
  }
  await sleep(2500);
  log("       url:", page.url());
  log("       title:", await page.title().catch(() => ""));

  const homeInfo = await page
    .evaluate(() => {
      const body = document.body?.innerText || "";
      return {
        hasLoginLink: !!document.querySelector("#login, .login-btn, a[href*='login']"),
        institutionHint: (body.match(/欢迎[^\n]{0,40}/) || [])[0] || "",
        ipHint: (body.match(/(机构|IP|欢迎)[^\n]{0,60}/g) || []).slice(0, 5),
        textHead: body.slice(0, 300),
      };
    })
    .catch((e) => ({ error: e.message }));
  log("[3/5] home signals:", JSON.stringify(homeInfo, null, 2));

  log("[4/5] running a search for:", key);
  let searchUrl = "";
  try {
    await page.goto(CNKI.search, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(2000);
    searchUrl = page.url();
    log("       landed on:", searchUrl);

    const captcha = await detectCaptcha(page);
    log("       captcha detected:", captcha);

    // Type into the one-box search and submit.
    const typed = await page
      .evaluate((q) => {
        const input =
          document.querySelector("input.search-input") ||
          document.querySelector("#txt_search") ||
          document.querySelector("input#txt_SearchText");
        if (!input) return { ok: false, reason: "no search input" };
        input.focus();
        input.value = q;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        const btn =
          document.querySelector("input.search-btn") ||
          document.querySelector("button.search-btn") ||
          document.querySelector(".search-btn");
        if (btn) {
          btn.click();
          return { ok: true, via: "button" };
        }
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }));
        return { ok: true, via: "enter" };
      }, key)
      .catch((e) => ({ ok: false, reason: e.message }));
    log("       submit:", JSON.stringify(typed));

    // Wait for either results or a verify redirect.
    const deadline = Date.now() + 40000;
    while (Date.now() < deadline) {
      const u = page.url();
      if (u.includes("/verify/")) break;
      const has = await page
        .evaluate(() => {
          const t = document.body?.innerText || "";
          return t.includes("条结果") || !!document.querySelector(".result-table-list, #gridTable");
        })
        .catch(() => false);
      if (has) break;
      await sleep(1000);
    }
    await sleep(2500);
    log("       url after submit:", page.url());
    log("       captcha now:", await detectCaptcha(page));
  } catch (e) {
    log("       search step failed:", e.message);
  }

  log("[5/5] inspecting result-page DOM");
  const dom = await page
    .evaluate(() => {
      const q = (s) => document.querySelectorAll(s).length;
      const body = document.body?.innerText || "";
      const firstRow = document.querySelector(".result-table-list tbody tr, #gridTable tbody tr");
      const cb = document.querySelector(".result-table-list tbody input.cbItem, #gridTable tbody input.cbItem");
      return {
        url: location.href,
        isVerify: location.href.includes("/verify/"),
        counts: {
          "input.search-input": q("input.search-input"),
          "#txt_search": q("#txt_search"),
          ".result-table-list tbody tr": q(".result-table-list tbody tr"),
          "#gridTable tbody tr": q("#gridTable tbody tr"),
          "input.cbItem": q("input.cbItem"),
          "td.name a.fz14": q("td.name a.fz14"),
          "td.author a.KnowledgeNetLink": q("td.author a.KnowledgeNetLink"),
          "td.source a": q("td.source a"),
          "td.date": q("td.date"),
          "#orderList li": q("#orderList li"),
          ".pages a": q(".pages a"),
          "#tcaptcha_transform_dy": q("#tcaptcha_transform_dy"),
        },
        totalText: (body.match(/共[^\n]{0,30}条/) || [])[0] || "",
        pageMark: document.querySelector(".countPageMark")?.innerText?.trim() || "",
        firstRowHtml: firstRow ? firstRow.outerHTML.slice(0, 1500) : "",
        firstCheckboxValue: cb ? cb.value : "",
        textHead: body.slice(0, 400),
      };
    })
    .catch((e) => ({ error: e.message }));

  log(JSON.stringify(dom, null, 2));

  await browser.disconnect();
  log("\nDone. Chrome stays open so you can inspect it. Kill it when finished.");
}

async function detectCaptcha(page) {
  return page
    .evaluate(() => {
      const el = document.querySelector("#tcaptcha_transform_dy");
      const inUrl = location.href.includes("verify");
      const visible = !!el && el.getBoundingClientRect().top >= 0;
      return { inUrl, sdkPresent: !!el, visible };
    })
    .catch(() => ({ error: "evaluate failed" }));
}

main().catch((e) => {
  console.error("PROBE FAILED:", e);
  process.exit(1);
});
