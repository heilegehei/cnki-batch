/**
 * Do Wanfang and VIP actually return retrievable records to a plain client, or
 * just an app shell / bot challenge? A 200 tells us nothing on its own.
 *
 * Run: node src/probe-cn-shells.js
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";

async function get(url, headers = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "text/html,application/json,*/*", ...headers },
    });
    const body = await res.text();
    return { status: res.status, body, headers: res.headers };
  } catch (e) {
    return { status: `ERR ${e.name}`, body: "", headers: new Headers() };
  } finally {
    clearTimeout(t);
  }
}

function analyse(name, url, r, needleHints) {
  const body = r.body || "";
  const title = (body.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "";
  const text = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const sPA = /<div id="(app|root)"|__NUXT__|window\.__INITIAL|webpack/i.test(body);
  const challenge = /just a moment|cf-chl|安全验证|验证码|滑动验证/i.test(body);
  const loginWall = /请登录|登录后|login|signin/i.test(body);
  const hits = needleHints.map((h) => ({ hint: h, found: text.includes(h) }));

  console.log(`=== ${name} ===`);
  console.log(`  url      : ${url}`);
  console.log(`  status   : ${r.status} | bytes: ${body.length}`);
  console.log(`  title    : ${title.trim().slice(0, 60)}`);
  console.log(`  app shell: ${sPA} | challenge: ${challenge} | login-ish: ${loginWall}`);
  console.log(`  text head: ${text.slice(0, 180)}`);
  for (const h of hits) console.log(`  contains "${h.hint}": ${h.found}`);
  console.log();
}

// --- Wanfang: try the public search results page and its JSON endpoints
const wf = await get("https://s.wanfangdata.com.cn/paper?q=%E8%82%BA%E7%99%8C");
analyse("万方 search page", "https://s.wanfangdata.com.cn/paper?q=肺癌", wf, ["肺癌", "学术论文", "条结果"]);

// Wanfang exposes a front-end API used by its own SPA.
for (const api of [
  "https://s.wanfangdata.com.cn/SearchService.SearchService.search.aspx",
  "https://s.wanfangdata.com.cn/api/search",
]) {
  const r = await get(api, { Accept: "application/json" });
  console.log(`  wanfang api ${api.slice(30)} -> ${r.status} (${(r.body || "").length} bytes)`);
}
console.log();

// --- VIP
const vip = await get("https://qikan.cqvip.com/Qikan/Search/Index?key=%E8%82%BA%E7%99%8C");
analyse("维普 search page", "https://qikan.cqvip.com/Qikan/Search/Index?key=肺癌", vip, ["肺癌", "维普", "条"]);

const vipHome = await get("https://www.cqvip.com/");
analyse("维普 home", "https://www.cqvip.com/", vipHome, ["维普", "期刊"]);

// --- SinoMed login redirect target
const sino = await get("https://www.sinomed.ac.cn/searchList.do?searchWord=lung");
console.log(`=== SinoMed ===`);
console.log(`  status: ${sino.status} | location: ${sino.headers.get("location") || "(none)"}`);
console.log(`  -> login required: ${/login/i.test(sino.headers.get("location") || "")}`);
console.log();
