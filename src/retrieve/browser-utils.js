/**
 * Browser helpers shared by the page-driven retrievers (CNKI, VIP).
 *
 * These sources have no usable API, so they are driven through real Chrome over
 * CDP. Keeping the connection logic here means each retriever only describes
 * its own page interaction.
 */

import { launchChrome, connect, waitForCdp, sleep } from "../cdp.js";

export { sleep };

export async function ensureChrome({ port = 9222, reuse = true, headless = false } = {}) {
  if (reuse) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return { browser: await connect({ port }), version: await res.json(), launched: false };
    } catch {
      /* nothing listening */
    }
  }
  launchChrome({ port, headless });
  const version = await waitForCdp(port);
  return { browser: await connect({ port }), version, launched: true };
}

/** Wait until a predicate evaluated in the page returns truthy, or time out. */
export async function waitFor(page, predicateFn, { timeoutMs = 40000, intervalMs = 800, label = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await page.evaluate(predicateFn)) return true;
    } catch {
      /* page may be navigating */
    }
    await sleep(intervalMs);
  }
  throw new Error(`timed out waiting for ${label}`);
}

/** True when the page is showing a bot/verification wall. */
export async function detectWall(page) {
  return page
    .evaluate(() => {
      const t = document.body?.innerText || "";
      return {
        verifyInUrl: /verify|challenge|captcha/i.test(location.href),
        wallText: /请完成安全验证|为保障数据与服务安全|安全验证|滑动验证|访问过于频繁|请稍后再试/i.test(t),
        captchaFrame: !!document.querySelector("iframe[src*=captcha], #tcaptcha_transform_dy"),
      };
    })
    .catch(() => ({ verifyInUrl: false, wallText: false, captchaFrame: false }));
}

/**
 * Set an input's value the way a real user would, then fire the events the
 * site's framework listens for. Plain `el.value = x` is ignored by frameworks
 * such as layui (used by VIP), which is why the search silently did nothing in
 * the first probe.
 */
export function typeInto(page, selector, value) {
  return page.evaluate(
    (sel, val) => {
      const el = document.querySelector(sel);
      if (!el) return { ok: false, reason: `no element matching ${sel}` };
      el.focus();
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(el, val);
      else el.value = val;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, which: 13, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keypress", { key: "Enter", keyCode: 13, which: 13, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", keyCode: 13, which: 13, bubbles: true }));
      return { ok: true, value: el.value };
    },
    selector,
    value
  );
}

/** Click the first visible element whose trimmed text matches one of `labels`. */
export function clickByText(page, labels) {
  return page.evaluate((wanted) => {
    const nodes = [
      ...document.querySelectorAll("button, a, span, div, input[type=button], input[type=submit], li"),
    ];
    for (const el of nodes) {
      if (el.offsetParent === null) continue;
      const t = (el.innerText || el.value || "").trim();
      if (wanted.includes(t)) {
        el.click();
        return { ok: true, label: t, tag: el.tagName };
      }
    }
    return { ok: false, reason: `no visible control with text ${wanted.join(" / ")}` };
  }, labels);
}
