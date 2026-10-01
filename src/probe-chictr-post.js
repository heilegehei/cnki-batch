/**
 * ChiCTR POST-based search test.
 *
 * The 405 responses on GET suggest ASP.NET WebMethod/Handler endpoints that only
 * accept POST. This tries the shapes the front-end is likely to call, to decide
 * whether ChiCTR can be a plain-HTTP source or needs browser automation.
 *
 * Run: node src/probe-chictr-post.js
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";

async function post(url, body, contentType = "application/x-www-form-urlencoded") {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        "Content-Type": contentType,
        Accept: "application/json, text/plain, */*",
        Referer: "https://www.chictr.org.cn/searchproj.html",
        "X-Requested-With": "XMLHttpRequest",
      },
      body,
    });
    const text = await res.text();
    return { status: res.status, text, ctype: res.headers.get("content-type") || "" };
  } catch (e) {
    return { status: `ERR ${e.name}`, text: String(e.message), ctype: "" };
  } finally {
    clearTimeout(t);
  }
}

const attempts = [
  ["POST searchproj.html", "https://www.chictr.org.cn/searchproj.html", "title=lung&page=1"],
  ["POST searchproj.html (form)", "https://www.chictr.org.cn/searchproj.html", "RegNo=&title=lung&pageSize=10&pageNum=1"],
  ["POST bin/chictr/search", "https://www.chictr.org.cn/bin/chictr/search", JSON.stringify({ title: "lung", page: 1 })],
  ["POST bin/chictr/getprojlist", "https://www.chictr.org.cn/bin/chictr/getprojlist", JSON.stringify({ title: "lung", page: 1 })],
  ["POST searchproj.aspx", "https://www.chictr.org.cn/searchproj.aspx", "title=lung&page=1"],
];

for (const [label, url, body] of attempts) {
  const isJson = body.trim().startsWith("{");
  const r = await post(url, body, isJson ? "application/json" : "application/x-www-form-urlencoded");
  const preview = (r.text || "").replace(/\s+/g, " ").slice(0, 150);
  console.log(`${String(r.status).padEnd(10)} ${label.padEnd(30)} ctype=${r.ctype.split(";")[0].padEnd(18)} ${preview}`);
}

// Also check the English mirror, which sometimes exposes a simpler interface.
console.log("\n--- English mirror ---");
for (const url of [
  "https://www.chictr.org.cn/searchproj.html?lang=en",
  "https://www.chictr.org.cn/searchproj_en.html",
]) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
    const text = await res.text();
    console.log(`  ${res.status} ${url} (${text.length} bytes)`);
  } catch (e) {
    console.log(`  ERR ${url}: ${e.name}`);
  } finally {
    clearTimeout(t);
  }
}
