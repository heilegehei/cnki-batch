/**
 * ChiCTR (中国临床试验注册中心) data access reconnaissance.
 *
 * ChiCTR is the WHO ICTRP primary registry for China and a free source that
 * helps cover the trial-registry role of CENTRAL. This probe finds whether a
 * retrievable endpoint exists, since the website is an ASP.NET app whose search
 * results may be a postback rather than a plain GET.
 *
 * Run: node src/probe-chictr.js
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";

async function get(url, { method = "GET", body, headers = {} } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(url, {
      method,
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/json,*/*",
        ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        ...headers,
      },
      body,
    });
    const text = await res.text();
    return { status: res.status, text, headers: res.headers };
  } catch (e) {
    return { status: `ERR ${e.name}: ${e.message}`, text: "", headers: new Headers() };
  } finally {
    clearTimeout(t);
  }
}

const candidates = [
  ["home", "https://www.chictr.org.cn/"],
  ["list page", "https://www.chictr.org.cn/searchproj.html"],
  ["searchproj jsp", "https://www.chictr.org.cn/searchproj.jsp"],
  ["list (en)", "https://www.chictr.org.cn/searchproj.html?title=lung"],
  ["index.html", "https://www.chictr.org.cn/index.html"],
];

for (const [label, url] of candidates) {
  const r = await get(url);
  const title = (r.text.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "";
  const forms = (r.text.match(/<form[^>]*>/gi) || []).length;
  const hasTable = /<table/i.test(r.text);
  const rows = (r.text.match(/<tr/gi) || []).length;
  const cf = /just a moment|cloudflare/i.test(r.text);
  console.log(
    `${String(r.status).padEnd(10)} ${label.padEnd(16)} bytes=${String(r.text.length).padEnd(7)} forms=${forms} table=${hasTable} tr=${rows} cf=${cf} "${title.trim().slice(0, 40)}"`
  );
}

console.log("\n--- looking for a JSON/API endpoint in the home page ---");
{
  const r = await get("https://www.chictr.org.cn/");
  const apiMentions = [
    ...new Set(
      (r.text.match(/["'][^"']*\.(?:ashx|aspx|json|do)[^"']*["']/gi) || []).map((s) => s.replace(/["']/g, ""))
    ),
  ];
  console.log(`  endpoint-ish strings: ${apiMentions.length}`);
  for (const a of apiMentions.slice(0, 20)) console.log(`    ${a}`);
  const jsFiles = [
    ...new Set((r.text.match(/src=["']([^"']+\.js[^"']*)["']/gi) || []).map((s) => s.replace(/src=["']|["']/g, ""))),
  ];
  console.log(`  js files: ${jsFiles.length}`);
  for (const j of jsFiles.slice(0, 10)) console.log(`    ${j}`);
}

console.log("\n--- try the documented ChiCTR search API shape ---");
for (const url of [
  "https://www.chictr.org.cn/api/searchproj?title=lung",
  "https://www.chictr.org.cn/searchproj.aspx?title=lung",
  "https://www.chictr.org.cn/showproj.html?proj=1",
]) {
  const r = await get(url);
  console.log(`  ${String(r.status).padEnd(10)} ${url} (${r.text.length} bytes)`);
}
