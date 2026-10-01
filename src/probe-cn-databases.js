/**
 * Reachability probe for the remaining databases in the 9-database plan.
 *
 * Answers one question only: which of these respond to a plain client right
 * now, and do they need a session/credential? Reachability does NOT prove the
 * data is retrievable, but an unreachable or challenged host proves it is not.
 *
 * Run: node src/probe-cn-databases.js
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";

const targets = [
  // Chinese databases in the 9-database plan
  { db: "万方 Wanfang", label: "home", url: "https://www.wanfangdata.com.cn/" },
  { db: "万方 Wanfang", label: "search", url: "https://s.wanfangdata.com.cn/paper?q=lung%20cancer" },
  { db: "维普 VIP", label: "home", url: "https://www.cqvip.com/" },
  { db: "维普 VIP", label: "search", url: "https://qikan.cqvip.com/Qikan/Search/Index?key=lung" },
  { db: "SinoMed", label: "home", url: "https://www.sinomed.ac.cn/" },
  { db: "SinoMed", label: "search", url: "https://www.sinomed.ac.cn/searchList.do?searchWord=lung" },
  // Trial registries that stand in for CENTRAL
  { db: "WHO ICTRP", label: "home", url: "https://trialsearch.who.int/" },
  {
    db: "WHO ICTRP",
    label: "api",
    url: "https://trialsearch.who.int/api/Trial2.aspx?TrialID=all&query=lung",
  },
  // Chinese clinical trial registry
  { db: "ChiCTR", label: "home", url: "https://www.chictr.org.cn/" },
  // Confirm the three that already tested as blocked, for one consolidated table
  { db: "Cochrane", label: "search", url: "https://www.cochranelibrary.com/search" },
  { db: "Embase", label: "home", url: "https://www.embase.com/" },
  { db: "Web of Science", label: "search", url: "https://www.webofscience.com/wos/woscc/basic-search" },
  { db: "CINAHL", label: "home", url: "https://www.ebsco.com/products/research-databases/cinahl-database" },
  { db: "Scopus", label: "home", url: "https://www.scopus.com/" },
];

async function probe(t) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(t.url, {
      signal: ctrl.signal,
      redirect: "manual",
      headers: { "User-Agent": UA, Accept: "text/html,application/json,*/*" },
    });
    let body = "";
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
    const cloudflare = /just a moment|cf-chl|cloudflare/i.test(body);
    const title = (body.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "";
    return {
      status: res.status,
      location: res.headers.get("location") || "",
      cloudflare,
      title: title.trim().slice(0, 50),
      bytes: body.length,
    };
  } catch (e) {
    return { status: `ERR ${e.name}`, cloudflare: false, title: "", bytes: 0, location: "" };
  } finally {
    clearTimeout(timer);
  }
}

const rows = [];
for (const t of targets) {
  const r = await probe(t);
  rows.push({ ...t, ...r });
  console.log(
    `${String(r.status).padEnd(10)} ${t.db.padEnd(16)} ${t.label.padEnd(7)} ` +
      `${r.cloudflare ? "CF-CHALLENGE" : ""}${r.location ? " -> " + r.location.slice(0, 46) : ""} ${r.title ? `"${r.title}"` : ""}`
  );
}

console.log("\n--- consolidated ---");
for (const db of [...new Set(rows.map((r) => r.db))]) {
  const rs = rows.filter((r) => r.db === db);
  const statuses = [...new Set(rs.map((r) => String(r.status)))].join("/");
  const cf = rs.some((r) => r.cloudflare);
  const verdict = cf
    ? "BLOCKED (Cloudflare)"
    : rs.some((r) => r.status === 200)
      ? "reachable"
      : rs.some((r) => typeof r.status === "number" && r.status >= 400)
        ? "requires auth/subscription"
        : "unreachable";
  console.log(`  ${db.padEnd(18)} ${statuses.padEnd(14)} ${verdict}`);
}
