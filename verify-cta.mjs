// Throwaway verification script — drives system Chrome headlessly to verify the
// rider dashboard's amber gradient CTAs. Run: node verify-cta.mjs <preview-url>
// Not part of the app; deleted after use.
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] || "http://localhost:5173";
const results = { ok: false, url: BASE, steps: [], consoleErrors: [], checks: {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function tryGuestLogin() {
  return page.evaluate(() => {
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

async function tryPhoneOtp() {
  const phoneInput = await page.$('input[placeholder*="Mobile number"]');
  if (!phoneInput) return false;
  await phoneInput.type("9876543210", { delay: 20 });
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((x) => x.textContent?.includes("Send OTP"))
      ?.click();
  });
  await sleep(2500);
  const code = await page.evaluate(() => {
    const el = [...document.querySelectorAll("div, p, span")].find((d) =>
      /Demo mode — your code is/.test(d.textContent || ""),
    );
    const m = el?.textContent?.match(/(\d{6})/);
    return m ? m[1] : null;
  });
  if (!code) return false;
  const slots = await page.$$('input[inputmode="numeric"]');
  for (let i = 0; i < 6 && i < slots.length; i++) await slots[i].type(code[i], { delay: 15 });
  await sleep(800);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((x) => x.textContent?.includes("Verify & continue"))
      ?.click();
  });
  return true;
}

try {
  await goto(BASE + "/app/rider");
  await sleep(2500);
  results.steps.push("after /app/rider -> " + page.url());

  const guestClicked = await tryGuestLogin();
  results.steps.push("guest clicked=" + guestClicked);

  for (let i = 0; i < 25; i++) {
    await sleep(1000);
    if (page.url().includes("/app/rider")) break;
  }
  await sleep(2500);
  results.steps.push("url now: " + page.url());

  if (!page.url().includes("/app/rider")) {
    const usedPhone = await tryPhoneOtp();
    results.steps.push("phone fallback=" + usedPhone);
    for (let i = 0; i < 25; i++) {
      await sleep(1000);
      if (page.url().includes("/app/rider")) break;
    }
    await sleep(2500);
    results.steps.push("url after fallback: " + page.url());
  }

  results.checks = await page.evaluate(() => {
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

  await page.screenshot({ path: "/tmp/rider-dashboard.png" });
  results.ok = true;
} catch (e) {
  results.error = String(e).slice(0, 600);
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
