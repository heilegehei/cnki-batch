/**
 * Browser reconnaissance for Wanfang (万方) and VIP (维普).
 *
 * Both sites returned HTTP 200 shells or 412 challenges to a plain client, so
 * they are client-rendered applications. This probe drives real Chrome and
 * captures the XHR/fetch traffic the page itself issues, which is what we want:
 * if the site has a JSON search endpoint, a retriever can call it directly
 * instead of parsing rendered HTML.
 *
 * It records, per site:
 *   - whether a captcha / verification wall appears
 *   - the search API endpoints and their response shapes
 *   - the result DOM selectors
 *   - how a record is exported (RIS/EndNote/NoteExpress) and via which endpoint
 *
 * Run:  node src/probe-wanfang-vip.js
 * Chrome must be reachable on CDP_PORT (default 9222); it is launched if not.
 */

import { launchChrome, connect, waitForCdp, sleep, CNKI } from "./cdp.js";

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

/** Attach a network recorder that keeps JSON responses and API-ish requests. */
function recordNetwork(page, site) {
  const apiCalls = [];
  const jsonResponses = [];

  page.on("request", (req) => {
    const url = req.url();
    const type = req.resourceType();
    if (type !== "xhr" && type !== "fetch") return;
    if (/\.(png|jpg|jpeg|gif|svg|woff2?|css|ico)(\?|$)/i.test(url)) return;
    apiCalls.push({
      method: req.method(),
      url,
      postData: (() => {
        try {
          return (req.postData() || "").slice(0, 400);
        } catch {
          return "";
        }
      })(),
    });
  });

  page.on("response", async (res) => {
    const url = res.url();
    const ct = (res.headers()["content-type"] || "").toLowerCase();
    if (!ct.includes("json")) return;
    if (/\.(png|jpg|gif|svg|woff2?|css|ico)(\?|$)/i.test(url)) return;
    try {
      const text = await res.text();
      if (text.length > 400000) return;
      jsonResponses.push({ url, status: res.status(), body: text.slice(0, 1200), size: text.length });
    } catch {
      /* body unavailable */
    }
  });

  return { apiCalls, jsonResponses };
}

async function inspect(page, site) {
  return page.evaluate(() => {
    const q = (s) => document.querySelectorAll(s).length;
    const body = document.body?.innerText || "";
    const sdk = document.querySelector("#tcaptcha_transform_dy");
    return {
      url: location.href,
      title: document.title,
      captchaVisible: !!sdk && sdk.getBoundingClientRect().top >= 0,
      verifyInUrl: /verify|captcha|安全验证/i.test(location.href),
      bodyHasChallenge: /安全验证|滑动验证|验证码|访问过于频繁|请稍后再试/i.test(body),
      hasLoginWall: /请登录|登录后查看|登录后可/i.test(body),
      bodyText: body.replace(/\s+/g, " ").slice(0, 320),
      selectors: {
        "table tr": q("table tr"),
        ".result-item": q(".result-item"),
        "[class*=result]": q("[class*=result]"),
        "[class*=list] li": q("[class*=list] li"),
        "input[type=checkbox]": q("input[type=checkbox]"),
        "a[href*=detail], a[href*=paper]": q("a[href*=detail], a[href*=paper]"),
      },
      inputs: [...document.querySelectorAll("input,textarea")]
        .slice(0, 12)
        .map((el) => ({
          tag: el.tagName,
          type: el.type || "",
          id: el.id || "",
          name: el.name || "",
          cls: (el.className || "").toString().slice(0, 60),
          ph: el.placeholder || "",
        })),
      buttons: [...document.querySelectorAll("button, input[type=button], input[type=submit], a.btn")]
        .slice(0, 12)
        .map((el) => ({ tag: el.tagName, txt: (el.innerText || el.value || "").trim().slice(0, 24), cls: (el.className || "").toString().slice(0, 50) })),
    };
  });
}

async function trySearch(page, site) {
  // Type into the most plausible search box and submit.
  const submitted = await page.evaluate((kw) => {
    const cands = [
      ...document.querySelectorAll("input[type=text], input:not([type]), textarea"),
    ].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 120 && r.height > 12 && el.offsetParent !== null;
    });
    if (!cands.length) return { ok: false, reason: "no visible text input" };
    const input = cands[0];
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(input, kw);
    else input.value = kw;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", keyCode: 13, bubbles: true }));

    const btn = [...document.querySelectorAll("button, input[type=button], input[type=submit], a")].find((el) => {
      const t = (el.innerText || el.value || "").trim();
      return /^(检索|搜索|搜一下|查询|Search)$/.test(t);
    });
    if (btn) {
      btn.click();
      return { ok: true, via: "button", label: (btn.innerText || btn.value || "").trim() };
    }
    return { ok: true, via: "enter" };
  }, KEY);
  return submitted;
}

async function recon(site, startUrl) {
  console.log(`\n${"=".repeat(72)}\n=== ${site} ===\n${"=".repeat(72)}`);
  const browser = await connect({ port: PORT });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  const net = recordNetwork(page, site);

  try {
    await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  } catch (e) {
    console.log(`  goto failed: ${e.message}`);
  }
  await sleep(4000);

  const before = await inspect(page, site);
  console.log(`  landed : ${before.url}`);
  console.log(`  title  : ${before.title}`);
  console.log(`  captcha: visible=${before.captchaVisible} url=${before.verifyInUrl} body=${before.bodyHasChallenge}`);
  console.log(`  login  : ${before.hasLoginWall}`);
  console.log(`  text   : ${before.bodyText.slice(0, 200)}`);
  console.log(`  inputs : ${JSON.stringify(before.inputs.slice(0, 5))}`);
  console.log(`  buttons: ${JSON.stringify(before.buttons.slice(0, 6))}`);

  const submitted = await trySearch(page, site);
  console.log(`  submit : ${JSON.stringify(submitted)}`);

  // Wait for either results or a verification wall.
  const deadline = Date.now() + 35000;
  while (Date.now() < deadline) {
    const s = await page.evaluate(() => {
      const t = document.body?.innerText || "";
      return {
        challenge: /安全验证|滑动验证|访问过于频繁|请稍后再试/i.test(t) || /verify/i.test(location.href),
        hasRows: document.querySelectorAll("table tr, [class*=result], [class*=list] li").length > 5,
      };
    });
    if (s.challenge || s.hasRows) break;
    await sleep(1000);
  }
  await sleep(4000);

  const after = await inspect(page, site);
  console.log(`\n  --- after search ---`);
  console.log(`  url    : ${after.url}`);
  console.log(`  captcha: visible=${after.captchaVisible} url=${after.verifyInUrl} body=${after.bodyHasChallenge}`);
  console.log(`  selectors: ${JSON.stringify(after.selectors)}`);
  console.log(`  text   : ${after.bodyText.slice(0, 260)}`);

  console.log(`\n  --- XHR/fetch calls (${net.apiCalls.length}) ---`);
  const grouped = new Map();
  for (const c of net.apiCalls) {
    const key = `${c.method} ${c.url.split("?")[0]}`;
    grouped.set(key, (grouped.get(key) || 0) + 1);
  }
  for (const [k, n] of [...grouped].slice(0, 30)) console.log(`    x${String(n).padEnd(3)} ${k}`);

  console.log(`\n  --- JSON responses (${net.jsonResponses.length}) ---`);
  for (const r of net.jsonResponses.slice(0, 12)) {
    console.log(`    ${r.status} ${r.url.split("?")[0].slice(0, 100)} (${r.size} bytes)`);
    console.log(`      ${r.body.replace(/\s+/g, " ").slice(0, 220)}`);
  }

  await page.close();
  await browser.disconnect();
  return { site, net, before, after };
}

async function main() {
  const v = await ensureChrome();
  console.log(`Chrome: ${v.Browser} on CDP :${PORT}`);
  console.log(`search keyword: "${KEY}"`);

  await recon("万方 Wanfang", "https://s.wanfangdata.com.cn/paper?q=" + encodeURIComponent(KEY));
  await recon("维普 VIP", "https://qikan.cqvip.com/Qikan/Search/Index?key=" + encodeURIComponent(KEY));

  console.log("\nreconnaissance complete. Chrome left running for manual inspection.");
}

main().catch((e) => {
  console.error("PROBE FAILED:", e.message || e);
  process.exit(1);
});
