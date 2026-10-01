/**
 * CNKI (中国知网) retrieval, exposed with the same interface as the other
 * retrievers so the merge layer can treat all sources uniformly.
 *
 * Unlike the other four sources this one drives a real Chrome over CDP, because
 * CNKI has no public API and forces a captcha on direct HTTP access. It also
 * needs the institution's IP entitlement to return abstracts.
 *
 * The heavy lifting lives in ../cnki-batch.js. This module shells out to it and
 * reads back the JSON it writes, which keeps one implementation of the browser
 * flow rather than two.
 */

import { execFile } from "node:child_process";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RetrieveError } from "./common.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, "..", "..");
const BATCH_SCRIPT = path.join(PROJECT_ROOT, "src", "cnki-batch.js");

export const name = "cnki";
export const label = "CNKI (中国知网)";
export const requiresAuth = true; // institution IP
export const requiresBrowser = true;

function runBatch(args) {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [BATCH_SCRIPT, ...args],
      { cwd: PROJECT_ROOT, maxBuffer: 64 * 1024 * 1024, timeout: 30 * 60 * 1000 },
      (err, stdout, stderr) => {
        // The batch script exits non-zero on a captcha or a hard failure; keep
        // stderr so the caller can surface CAPTCHA_BLOCKED precisely.
        resolve({ err, stdout: String(stdout || ""), stderr: String(stderr || "") });
      }
    );
  });
}

/**
 * Retrieve from CNKI by invoking the browser module.
 *
 * @param {string} query one-box keywords, or a professional expression when
 *   opts.advanced is true
 * @param {{limit?:number, maxPages?:number, advanced?:boolean, delayMs?:number,
 *          reuse?:boolean, port?:number, outDir?:string}} [opts]
 */
export async function retrieve(query, opts = {}) {
  if (!existsSync(BATCH_SCRIPT)) {
    throw new RetrieveError(`CNKI batch script not found at ${BATCH_SCRIPT}`);
  }

  const outDir = opts.outDir || path.join(PROJECT_ROOT, "out");
  const maxPages = opts.maxPages ?? Math.max(1, Math.ceil((opts.limit ?? 200) / 20));

  const args = [
    "--query", query,
    "--out", outDir,
    "--maxPages", String(maxPages),
    "--delayMs", String(opts.delayMs ?? 1200),
  ];
  if (opts.limit) args.push("--limit", String(opts.limit));
  if (opts.advanced) args.push("--advanced");
  if (opts.reuse) args.push("--reuse");
  if (opts.port) args.push("--port", String(opts.port));

  const { err, stdout, stderr } = await runBatch(args);
  const combined = `${stdout}\n${stderr}`;

  if (/CAPTCHA_BLOCKED/.test(combined)) {
    throw new RetrieveError(
      "CNKI presented a captcha. Solve the slider in the Chrome window, then re-run with --reuse.",
      { url: "https://kns.cnki.net" }
    );
  }
  if (err && !/Done\./.test(stdout)) {
    throw new RetrieveError(
      `CNKI batch failed: ${(stderr || stdout).split("\n").filter(Boolean).slice(-3).join(" | ").slice(0, 400)}`
    );
  }

  // Locate the JSON the batch run just produced (timestamped filename).
  const candidates = readdirSync(outDir)
    .filter((f) => f.startsWith("cnki_") && f.endsWith(".json"))
    .map((f) => ({ f, mtime: statSync(path.join(outDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  const newest = candidates[0];

  if (!newest) {
    throw new RetrieveError(`CNKI produced no output JSON in ${outDir}; raw output: ${combined.slice(-300)}`);
  }

  const payload = JSON.parse(readFileSync(path.join(outDir, newest.f), "utf8"));
  return {
    source: label,
    sourceKey: name,
    query,
    totalHitsReported: payload.totalHitsReported ?? 0,
    retrievedCount: payload.recordCount ?? (payload.records || []).length,
    outputFile: path.join(outDir, newest.f),
    records: (payload.records || []).map((r) => ({ ...r, language: r.language || "Chinese" })),
  };
}
