/**
 * Shared HTTP helpers for the retrieval modules.
 *
 * Node's built-in fetch is used throughout, which keeps the project
 * dependency-free apart from puppeteer-core (needed only by the CNKI browser
 * module). A polite User-Agent and optional mailto are sent so the free APIs
 * place requests in their faster pools rather than throttling them.
 */

export const VERSION = "1.0.0";

/** Contact address for API politeness pools (Crossref, OpenAlex, NCBI). */
export function contactEmail() {
  return process.env.CONTACT_EMAIL || "";
}

export function userAgent() {
  const email = contactEmail();
  return (
    `guideline-literature-tool/${VERSION} ` +
    `(https://github.com/heilegehei/cnki-batch${email ? `; mailto:${email}` : ""})`
  );
}

export class RetrieveError extends Error {
  constructor(message, { status, url } = {}) {
    super(message);
    this.name = "RetrieveError";
    this.status = status;
    this.url = url;
  }
}

/**
 * GET a URL and parse the response.
 *
 * @param {string} url
 * @param {{accept?:string, timeoutMs?:number, tries?:number, parse?:'json'|'text', headers?:object}} opts
 */
export async function fetchText(url, opts = {}) {
  const {
    accept = "application/json",
    timeoutMs = 45000,
    tries = 3,
    parse = "text",
    headers = {},
  } = opts;

  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { "User-Agent": userAgent(), Accept: accept, ...headers },
      });
      const text = await res.text();

      if (res.status === 429 || res.status >= 500) {
        lastErr = new RetrieveError(`HTTP ${res.status}`, { status: res.status, url });
        if (attempt < tries) {
          // Back off, and honour Retry-After when present.
          const retryAfter = Number(res.headers.get("retry-after"));
          const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500 * attempt;
          await sleep(waitMs);
          continue;
        }
        throw lastErr;
      }
      if (!res.ok) {
        throw new RetrieveError(
          `HTTP ${res.status} from ${new URL(url).host}: ${text.slice(0, 180)}`,
          { status: res.status, url }
        );
      }
      if (parse === "json") {
        try {
          return JSON.parse(text);
        } catch {
          throw new RetrieveError(`response was not valid JSON: ${text.slice(0, 160)}`, { url });
        }
      }
      return text;
    } catch (e) {
      if (e instanceof RetrieveError && e.status && e.status < 500 && e.status !== 429) throw e;
      lastErr = e;
      if (attempt < tries) await sleep(1200 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof RetrieveError
    ? lastErr
    : new RetrieveError(`request failed after ${tries} attempts: ${lastErr?.message || lastErr}`, { url });
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Run async jobs with bounded concurrency, preserving input order.
 * Used to fetch PubMed EFetch batches without hammering NCBI.
 */
export async function mapLimit(items, limit, worker) {
  const out = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

/** Strip HTML tags/entities that leaks into titles and abstracts. */
export function stripTags(v) {
  return String(v ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Chunk a list into fixed-size batches.
 * PubMed's EFetch accepts many IDs at once; batching keeps URLs sane.
 */
export function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Parse a query file or inline string into {name, query} pairs.
 * Accepts either plain lines ("name<TAB>query") or a JSON array of objects,
 * so a guideline's search strategy can live in version control.
 */
export function parseQuerySpec(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const data = JSON.parse(trimmed);
    const list = Array.isArray(data) ? data : data.queries || [data];
    return list.map((q, i) => ({
      name: q.name || `query_${i + 1}`,
      query: q.query || q.term || "",
    }));
  }
  return trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l, i) => {
      const tab = l.indexOf("\t");
      if (tab > 0) return { name: l.slice(0, tab).trim(), query: l.slice(tab + 1).trim() };
      return { name: `query_${i + 1}`, query: l };
    });
}
