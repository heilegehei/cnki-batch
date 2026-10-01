// Reconnaissance: how do Web of Science, Embase and Cochrane respond to a
// plain HTTPS client right now? This determines which retrieval route is even
// technically available (open access, official API, or subscription-walled).
//
// Uses Node's OpenSSL stack, which works from this machine (schannel does not).

import https from "node:https";

const TARGETS = [
  // --- Cochrane Library ---
  { name: "Cochrane home", url: "https://www.cochranelibrary.com/" },
  { name: "Cochrane search", url: "https://www.cochranelibrary.com/search" },
  { name: "Cochrane CENTRAL", url: "https://www.cochranelibrary.com/central" },
  // --- Web of Science / Clarivate ---
  { name: "Web of Science", url: "https://www.webofscience.com/wos/woscc/basic-search" },
  { name: "WoS Starter API", url: "https://api.clarivate.com/apis/wos-starter/v1/documents?q=TS%3D(cancer)&limit=1" },
  { name: "Clarivate home", url: "https://clarivate.com/" },
  // --- Embase / Elsevier ---
  { name: "Embase", url: "https://www.embase.com/" },
  { name: "Embase login", url: "https://www.embase.com/login" },
  { name: "Elsevier dev portal", url: "https://dev.elsevier.com/" },
  { name: "Elsevier Scopus API (no key)", url: "https://api.elsevier.com/content/search/scopus?query=TITLE-ABS-KEY(cancer)&count=1" },
  // --- comparators that are known-open, to prove the probe works ---
  { name: "PubMed E-utilities", url: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/einfo.fcgi" },
  { name: "Europe PMC", url: "https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=cancer&format=json&pageSize=1" },
  { name: "Crossref", url: "https://api.crossref.org/works?rows=1" },
];

function probe(target) {
  return new Promise((resolve) => {
    const req = https.request(
      target.url,
      {
        method: "GET",
        timeout: 25000,
        headers: {
          // Identify honestly; a plain default UA is often blocked outright.
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
          Accept: "text/html,application/json,*/*",
        },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => {
          if (body.length < 200000) body += c;
        });
        res.on("end", () => {
          const title = (body.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "";
          resolve({
            name: target.name,
            status: res.statusCode,
            location: res.headers.location || "",
            setCookie: (res.headers["set-cookie"] || []).length,
            ctype: (res.headers["content-type"] || "").split(";")[0],
            title: title.trim().slice(0, 60),
            bytes: body.length,
          });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ name: target.name, status: "TIMEOUT" });
    });
    req.on("error", (e) => resolve({ name: target.name, status: `ERR ${e.code || e.message}` }));
    req.end();
  });
}

console.log("probing", TARGETS.length, "endpoints\n");
const results = [];
for (const t of TARGETS) {
  const r = await probe(t);
  results.push(r);
  const loc = r.location ? ` -> ${String(r.location).slice(0, 58)}` : "";
  const extra = r.title ? `  "${r.title}"` : "";
  console.log(`${String(r.status).padEnd(10)} ${r.name.padEnd(28)}${loc}${extra}`);
}

console.log("\n--- summary ---");
const ok = results.filter((r) => r.status === 200);
const walled = results.filter((r) => [401, 402, 403, 407].includes(r.status));
const redirect = results.filter((r) => [301, 302, 303, 307, 308].includes(r.status));
console.log(`open 200 : ${ok.map((r) => r.name).join(", ") || "none"}`);
console.log(`walled   : ${walled.map((r) => r.name).join(", ") || "none"}`);
console.log(`redirect : ${redirect.map((r) => r.name).join(", ") || "none"}`);
