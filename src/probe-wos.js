// Inspect what Web of Science actually returns to a plain client: a usable
// search form, a subscription/auth wall, or a bot challenge? Also check the
// Clarivate developer portal for how the official WoS APIs are obtained.

import https from "node:https";

function get(url, { accept = "text/html,application/json,*/*", method = "GET", body } = {}) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        timeout: 30000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
          Accept: accept,
          "Accept-Language": "en-US,en;q=0.9",
          ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => {
          if (data.length < 400000) data += c;
        });
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers, body: data })
        );
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ status: "TIMEOUT", headers: {}, body: "" });
    });
    req.on("error", (e) => resolve({ status: `ERR ${e.code}`, headers: {}, body: "" }));
    if (body) req.write(body);
    req.end();
  });
}

const signals = (body) => {
  const b = body.toLowerCase();
  const hit = (re) => re.test(b);
  return {
    cloudflare: hit(/just a moment|cf-chl|cloudflare/),
    signIn: hit(/sign in|sign-in|log in|login|institutional/),
    accessDenied: hit(/access denied|not authorized|subscribe|subscription required/),
    searchForm: hit(/search|query/),
    recorder: hit(/access.*not.*available|contact your administrator/),
    wosApp: hit(/web of science|woscc/),
  };
};

console.log("=== 1. Web of Science search page ===");
{
  const r = await get("https://www.webofscience.com/wos/woscc/basic-search");
  console.log("   status:", r.status, "| bytes:", r.body.length);
  console.log("   content-type:", r.headers["content-type"]);
  console.log("   signals:", JSON.stringify(signals(r.body)));
  const title = (r.body.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "";
  console.log("   title:", title.trim().slice(0, 80));
  const texts = r.body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  console.log("   visible text:", texts.slice(0, 400));
}

console.log("\n=== 2. WoS Starter API without key (full error) ===");
{
  const r = await get(
    "https://api.clarivate.com/apis/wos-starter/v1/documents?q=TS%3D(cancer)&limit=1",
    { accept: "application/json" }
  );
  console.log("   status:", r.status);
  console.log("   www-authenticate:", r.headers["www-authenticate"] || "(none)");
  console.log("   body:", r.body.slice(0, 400));
}

console.log("\n=== 3. Clarivate developer portal ===");
{
  const r = await get("https://developer.clarivate.com/apis");
  console.log("   status:", r.status, "| bytes:", r.body.length);
  const title = (r.body.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "";
  console.log("   title:", title.trim().slice(0, 80));
  const texts = r.body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const apiMentions = texts.match(/[A-Za-z ]{0,40}(API|Starter|Expanded|Premium)[A-Za-z ]{0,40}/g) || [];
  console.log("   API mentions:", [...new Set(apiMentions)].slice(0, 12).join(" | "));
}

console.log("\n=== 4. Does WoS expose a session-free export endpoint? ===");
for (const url of [
  "https://www.webofscience.com/api/wosnx/indicators",
  "https://www.webofscience.com/api/wos/export",
]) {
  const r = await get(url, { accept: "application/json" });
  console.log(`   ${r.status}  ${url}`);
}
