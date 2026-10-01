// Step 2: validate the citation-export endpoint with a REAL export id taken
// from a live result page.
//
// Why this matters: guideline/consensus work needs an abstract per record.
// The result page only gives title/author/source/date, so we must confirm the
// GetExport endpoint (documented by both repos) actually returns the abstract
// (%X in EndNote) from inside an institutional-IP session.

import { CNKI, connect, sleep } from "./cdp.js";

const PORT = Number(process.env.CDP_PORT || 9222);
const KEY = process.argv[2] || "中医药 肺癌 围手术期";

async function main() {
  const browser = await connect({ port: PORT });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });

  console.log("[1/4] searching:", KEY);
  await page.goto(CNKI.search, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2000);
  await page.evaluate((q) => {
    const input = document.querySelector("input.search-input");
    input.focus();
    input.value = q;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("input.search-btn").click();
  }, KEY);

  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    const ok = await page
      .evaluate(() => !!document.querySelector(".result-table-list tbody input.cbItem"))
      .catch(() => false);
    if (ok) break;
    await sleep(1000);
  }
  await sleep(2000);

  console.log("[2/4] harvesting export ids + row text");
  const rows = await page.evaluate(() => {
    const trs = [...document.querySelectorAll(".result-table-list tbody tr")];
    return trs.slice(0, 3).map((tr) => {
      const cb = tr.querySelector("input.cbItem");
      const a = tr.querySelector("td.name a");
      return {
        exportId: cb ? cb.value : "",
        title: a ? a.innerText.trim() : "",
        rowText: tr.innerText.replace(/\s+/g, " ").trim().slice(0, 300),
      };
    });
  });
  console.log(JSON.stringify(rows, null, 2));

  if (!rows.length || !rows[0].exportId) {
    console.log("NO EXPORT ID FOUND - aborting");
    await browser.disconnect();
    return;
  }

  console.log("[3/4] POSTing GetExport for the first record (from page context)");
  const result = await page.evaluate(
    async (apiUrl, exportId) => {
      const body = new URLSearchParams({
        filename: exportId,
        displaymode: "GBTREFER,elearning,EndNote",
        uniplatform: "NZKPT",
      });
      const resp = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const text = await resp.text();
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        /* keep raw */
      }
      return { status: resp.status, raw: text.slice(0, 3000), parsed };
    },
    CNKI.exportApi,
    rows[0].exportId
  );

  console.log("       HTTP:", result.status);
  if (result.parsed) {
    const modes = (result.parsed.data || []).map((d) => d.mode || d.key);
    console.log("       code:", result.parsed.code, "| modes:", JSON.stringify(modes));
    for (const item of result.parsed.data || []) {
      const mode = item.mode || item.key;
      const val = Array.isArray(item.value) ? item.value[0] : item.value;
      console.log(`\n===== ${mode} =====`);
      console.log(String(val).slice(0, 1600));
    }
  } else {
    console.log("       non-JSON body:", result.raw.slice(0, 600));
  }

  console.log("\n[4/4] checking whether the result page itself carries abstracts");
  const pageAbstract = await page.evaluate(() => {
    const tr = document.querySelector(".result-table-list tbody tr");
    if (!tr) return null;
    const classes = [...tr.querySelectorAll("*")]
      .map((el) => el.className)
      .filter((c) => typeof c === "string" && /abstract|summary|zhaiyao|brief/i.test(c));
    return {
      candidateClasses: [...new Set(classes)],
      hasAbstractClass: classes.length > 0,
      fullRowHtml: tr.outerHTML.length,
    };
  });
  console.log(JSON.stringify(pageAbstract, null, 2));

  await browser.disconnect();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
