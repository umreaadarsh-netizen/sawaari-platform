// Throwaway verification script — drives system Chrome headlessly to verify the
// rider dashboard's amber gradient CTAs against the Freebuff preview wrapper.
// Writes progress to /tmp/verify-out.json after every phase so a killed run
// still leaves readable partial results. Run: node verify-cta.mjs <preview-url>
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const BASE = (process.argv[2] || "http://localhost:5173").replace(/\/$/, "");
const OUT = "/tmp/verify-out.json";
const results = { ok: false, url: BASE, steps: [], consoleErrors: [], checks: {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function save() {
  try {
    fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  } catch {}
}
function track(msg) {
  results.steps.push(msg);
  console.log("[step] " + msg);
  save();
}

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
page.on("console", (m) => {
  if (m.type() === "error") results.consoleErrors.push(m.text().slice(0, 250));
});
page.on("pageerror", (e) =>
  results.consoleErrors.push("pageerror: " + String(e).slice(0, 250)),
);

const goto = (url) => page.goto(url, { waitUntil: "domcontentloaded", timeout: 40000 });

async function findAppFrame() {
  for (const f of page.frames()) {
    if (f === page.mainFrame()) continue;
    try {
      const txt = await f.evaluate(() =>
        (document.body?.innerText || "").slice(0, 500),
      );
      if (/SAWAARI|Continue as guest|Book an EV|Book a ride|Sign in/.test(txt)) return f;
    } catch {
      /* cross-origin or not ready */
    }
  }
  return null;
}

async function waitForApp(maxLoops) {
  for (let i = 0; i < maxLoops; i++) {
    const f = await findAppFrame();
    if (f) return f;
    const txt = await page
      .evaluate(() => (document.body?.innerText || "").slice(0, 300))
      .catch(() => "");
    if (/Book an EV|Continue as guest|Sign in/.test(txt)) return page.mainFrame();
    await sleep(2000);
  }
  return null;
}

async function tryGuestLogin(frame) {
  return frame.evaluate(() => {
    const g = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Continue as guest"),
    );
    if (g) {
      g.click();
      return true;
    }
    return false;
  });
}

async function tryPhoneOtp(frame) {
  const phoneInput = await frame.$('input[placeholder*="Mobile number"]');
  if (!phoneInput) return false;
  await phoneInput.type("9876543210", { delay: 20 });
  await frame.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((x) => x.textContent?.includes("Send OTP"))
      ?.click();
  });
  await sleep(2000);
  const code = await frame.evaluate(() => {
    const el = [...document.querySelectorAll("div, p, span")].find((d) =>
      /Demo mode — your code is/.test(d.textContent || ""),
    );
    const m = el?.textContent?.match(/(\d{6})/);
    return m ? m[1] : null;
  });
  if (!code) return false;
  const slots = await frame.$$('input[inputmode="numeric"]');
  for (let i = 0; i < 6 && i < slots.length; i++) await slots[i].type(code[i], { delay: 12 });
  await sleep(600);
  await frame.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((x) => x.textContent?.includes("Verify & continue"))
      ?.click();
  });
  return true;
}

async function isOnDashboard(frame) {
  try {
    return await frame.evaluate(() => document.body.innerText.includes("Book an EV"));
  } catch {
    return false;
  }
}

try {
  let appFrame = null;
  for (let attempt = 0; attempt < 3 && !appFrame; attempt++) {
    try {
      await goto(BASE + "/app/rider");
    } catch {
      /* retry */
    }
    await sleep(2000);
    appFrame = await waitForApp(8);
    track(`attempt ${attempt + 1}: url=${page.url()} frame=${!!appFrame}`);
  }
  if (!appFrame) {
    await goto(BASE + "/");
    await sleep(4000);
    appFrame = await waitForApp(8);
  }
  if (!appFrame) {
    results.error = "App frame never appeared.";
    track("ERROR: no app frame");
  } else {
    track("app frame found: " + appFrame.url());
    const guestClicked = await tryGuestLogin(appFrame);
    track("guest clicked=" + guestClicked);

    for (let i = 0; i < 15; i++) {
      await sleep(1000);
      const f = await findAppFrame();
      if (!f) continue;
      if (f.url().includes("/app/rider") || (await isOnDashboard(f))) break;
    }
    await sleep(1500);

    if (!guestClicked) {
      const usedPhone = await tryPhoneOtp(appFrame);
      track("phone fallback=" + usedPhone);
      await sleep(2000);
    }

    const f = (await findAppFrame()) || page.mainFrame();
    track("final frame url: " + f.url());
    results.checks = await f.evaluate(() => {
      const out = {};
      const styleOf = (el) => {
        const cs = getComputedStyle(el);
        return {
          bgImage: cs.backgroundImage,
          color: cs.color,
          boxShadow: cs.boxShadow.slice(0, 140),
          disabled: el.disabled === true,
        };
      };
      const buttons = [...document.querySelectorAll("button")];
      const main = buttons.find((b) => /Book now|Schedule booking/.test(b.textContent || ""));
      if (main) out.bookButton = styleOf(main);
      out.hasGradientClass = buttons.some(
        (b) => b.className.includes("from-amber-400") && b.className.includes("to-orange-500"),
      );
      out.gradientClassCount = document.querySelectorAll('[class*="bg-gradient-to-r"]').length;
      out.headings = [...document.querySelectorAll("h1")].map((h) => h.textContent.trim());
      out.fareCardTint = !!document.querySelector('[class*="from-amber-400/10"][class*="to-orange-400/5"]');
      out.hairline = [...document.querySelectorAll("header div")].some((d) => {
        const r = d.getBoundingClientRect();
        const cs = getComputedStyle(d);
        return r.height > 0 && r.height <= 2 && cs.backgroundImage.includes("linear-gradient");
      });
      out.bodySample = document.body.innerText.slice(0, 150);
      return out;
    });
    track("checks captured");
    await page.screenshot({ path: "/tmp/rider-dashboard.png" }).catch(() => {});
    results.ok = true;
  }
} catch (e) {
  results.error = String(e).slice(0, 700);
}

await browser.close().catch(() => {});
save();
console.log(JSON.stringify(results, null, 2));
