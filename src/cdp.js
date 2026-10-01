// Launch / connect helpers for the CNKI batch pipeline.
//
// Chrome is driven over CDP. On Windows this also sidesteps the fact that
// Windows' schannel TLS stack can be unavailable under a restricted harness
// (plain curl / PowerShell HTTP then fails), while Node's OpenSSL sockets work.
//
// Cross-platform: Windows, macOS (Intel + Apple Silicon) and Linux.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const HOME = os.homedir();

/** Candidate Chrome locations, ordered per platform. */
export function chromeCandidates() {
  if (process.platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      path.join(HOME, "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/opt/homebrew/bin/chromium", // Apple Silicon Homebrew
      "/usr/local/bin/chromium", // Intel Homebrew
      // Edge / Brave fall back, both Chromium-based and CDP-compatible.
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    ];
  }
  if (process.platform === "linux") {
    return [
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/snap/bin/chromium",
      "/usr/bin/microsoft-edge",
    ];
  }
  // win32
  const pf = process.env["ProgramFiles"] || "C:\\Program Files";
  const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const local = process.env.LOCALAPPDATA || path.join(HOME, "AppData", "Local");
  return [
    path.join(pf, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(pf86, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(local, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
  ];
}

export const CHROME_PATHS = chromeCandidates();

export const CNKI = {
  home: "https://www.cnki.net/",
  advanced: "https://kns.cnki.net/kns8s/AdvSearch",
  search: "https://kns.cnki.net/kns8s/search",
  exportApi: "https://kns.cnki.net/dm8/API/GetExport",
};

export function findChrome() {
  if (process.env.CHROME_PATH) {
    if (existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
    throw new Error(`CHROME_PATH is set but not found: ${process.env.CHROME_PATH}`);
  }
  for (const candidate of chromeCandidates()) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Chrome not found for platform "${process.platform}".\n` +
      `Tried:\n  ${chromeCandidates().join("\n  ")}\n` +
      `Install Google Chrome, or point CHROME_PATH at your Chromium-based browser.`
  );
}

/**
 * Launch Chrome with a remote debugging port and a profile kept inside the
 * workspace, so the browser process shares no state with the user's own
 * profile while still inheriting the institution's IP-based entitlement.
 */
export function launchChrome({ port = 9222, profileDir, headless = false } = {}) {
  const exe = findChrome();
  const dir = profileDir || path.join(process.cwd(), ".chrome-profile");
  mkdirSync(dir, { recursive: true });

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${dir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=ChromeWhatsNewUI",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--window-size=1440,1000",
    "about:blank",
  ];
  if (headless) args.unshift("--headless=new");

  // Detached so the browser outlives this process; --reuse can then attach to
  // the same institution-IP session on the next run (Windows and macOS alike).
  const child = spawn(exe, args, { detached: true, stdio: "ignore" });
  child.on("error", (err) => {
    console.error(
      `[cdp] failed to spawn Chrome at ${exe}: ${err.message}\n` +
        `[cdp] set CHROME_PATH to your Chromium-based browser executable.`
    );
  });
  child.unref();
  return child;
}

export async function connect({ port = 9222, browserURL } = {}) {
  const url = browserURL || `http://127.0.0.1:${port}`;
  return puppeteer.connect({ browserURL: url, defaultViewport: null, protocolTimeout: 180000 });
}

export async function waitForCdp(port = 9222, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return await res.json();
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`CDP endpoint on port ${port} did not come up within ${timeoutMs}ms`);
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
