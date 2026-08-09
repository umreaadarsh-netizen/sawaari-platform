#!/usr/bin/env node
/**
 * Durable computed-style browser test for the Sawaari gradient CTAs.
 *
 * Drives system Chrome (headless) against the real deployed preview and
 * asserts the ACTUAL COMPUTED styles of the amber→orange gradient CTAs on
 * the landing page, the auth page, and the rider and driver dashboards —
 * the live-preview complement to the class-assertion smoke tests in
 * src/pages/*.test.tsx.
 *
 * Unlike the unit tests, this one:
 *   - WAITS for the preview to become healthy (no more "Loading app preview"
 *     interstitial) before running — see PREVIEW_WAIT_MS below.
 *   - Is frame-aware: Playwright locators pierce the Freebuff preview
 *     wrapper iframes automatically.
 *   - Checks the landing page CTAs (nav Book a Ride, hero Book Now,
 *     Book this route, fleet Book, Become a driver, Book a Sawaari) and the
 *     auth page CTAs (Send OTP, email submit arrow, Verify & continue),
 *     then signs in through the real demo phone-OTP flow (code surfaced
 *     on-card), picks real locations via the Nominatim suggestion dropdown,
 *     and reads getComputedStyle() on each dashboard CTA.
 *
 * Usage:
 *   PREVIEW_URL=https://<preview>/ node scripts/preview-cta-e2e.mjs
 *   PREVIEW_WAIT_MS=600000 node scripts/preview-cta-e2e.mjs   # default 10 min
 *
 * Exit codes:
 *   0  PASS — every computed-style assertion held
 *   1  FAIL — a computed-style assertion failed (real regression)
 *   2  SKIP — preview never became healthy within PREVIEW_WAIT_MS
 *   3  ENV  — Chrome or Playwright unavailable
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);

const BASE = (process.env.PREVIEW_URL || "https://pink-buses-teach.freebuff.dev").replace(/\/$/, "");
const WAIT_MS = Number(process.env.PREVIEW_WAIT_MS || 10 * 60 * 1000);
const RIDER_PHONE = process.env.RIDER_PHONE || "9888776655";
const DRIVER_PHONE = process.env.DRIVER_PHONE || "9888776656";
const CHROME_BIN = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const REPORT = "/tmp/sawaari-e2e-report.json";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { ok: false, exit: 0, base: BASE, checks: [], consoleErrors: [] };
let passed = 0;
let failed = 0;

function log(msg) {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
  try {
    fs.appendFileSync("/tmp/sawaari-e2e-progress.log", line + "\n");
  } catch {}
  console.log(line);
}

function check(name, ok, detail) {
  out.checks.push({ name, ok, detail });
  if (ok) {
    passed++;
    log(`PASS ${name}`);
  } else {
    failed++;
    log(`FAIL ${name}: ${JSON.stringify(detail)}`);
  }
  return ok;
}

/** Locate Playwright: project dep first, then the npx cache. */
function resolvePlaywright() {
  try {
    return require.resolve("playwright");
  } catch {}
  const npxRoot = path.join(os.homedir(), ".npm", "_npx");
  if (fs.existsSync(npxRoot)) {
    for (const dir of fs.readdirSync(npxRoot)) {
      const p = path.join(npxRoot, dir, "node_modules", "playwright");
      if (fs.existsSync(path.join(p, "package.json"))) return p;
    }
  }
  return null;
}

/** Computed style snapshot for a locator's first match. */
async function computed(loc) {
  const el = loc.first();
  const visible = await el.isVisible().catch(() => false);
  if (!visible) return { visible: false };
  return el.evaluate((n) => {
    const cs = getComputedStyle(n);
    return {
      visible: true,
      bgImage: cs.backgroundImage,
      bgColor: cs.backgroundColor,
      borderColor: cs.borderColor,
      color: cs.color,
      disabled: n.disabled === true,
      cls: String(n.className).slice(0, 200),
    };
  });
}

function isGradient(s) {
  return typeof s === "string" && /gradient/.test(s) && s !== "none";
}

/** Parsed alpha (0..1) of a computed color string, or null if unparseable. */
function alphaOf(colorStr) {
  const m = String(colorStr).match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(/[,\s/]+/).filter(Boolean);
  const a = parts.length >= 4 ? parseFloat(parts[3]) : 1;
  return Number.isFinite(a) ? a : null;
}

async function signIn(page, roleText, phone, onOtpStep) {
  await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByText(roleText, { exact: true }).first().click({ timeout: 20000 });
  await page.getByPlaceholder("Mobile number").fill(phone);
  await page.getByRole("button", { name: /Send OTP/ }).click();
  let code = null;
  for (let i = 0; i < 20 && !code; i++) {
    await sleep(1500);
    const banner = await page.locator("text=/Demo mode/").first().textContent().catch(() => null);
    const m = banner && banner.match(/(\d{6})/);
    if (m) code = m[1];
  }
  if (!code) throw new Error("demo OTP banner not found");
  if (onOtpStep) await onOtpStep(page);
  const slots = page.locator("input[inputmode='numeric']");
  if ((await slots.count()) < 6) throw new Error(`OTP slots missing: ${await slots.count()}`);
  for (let i = 0; i < 6; i++) await slots.nth(i).fill(code[i]);
  await page.getByRole("button", { name: /Verify & continue/ }).click();
  await sleep(6000);
}

async function pickLocation(page, placeholder, query) {
  const input = page.getByPlaceholder(placeholder);
  await input.click({ timeout: 10000 });
  await input.fill(query);
  let picked = false;
  for (let i = 0; i < 15 && !picked; i++) {
    await sleep(1000);
    const ul = page.locator("ul.absolute");
    if ((await ul.count()) > 0) {
      const first = ul.first().locator("li button").first();
      if (await first.isVisible().catch(() => false)) {
        await first.click();
        picked = true;
      }
    }
  }
  return picked;
}

/** Wait until the preview serves the real app (role cards visible). */
async function waitForHealthy(page) {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    try {
      await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded", timeout: 30000 });
      const roleCard = page.getByText("Book a rickshaw", { exact: true }).first();
      if (await roleCard.isVisible({ timeout: 8000 }).catch(() => false)) return true;
      log("auth page loaded, role card not visible yet — still building");
    } catch (e) {
      log(`goto failed: ${String(e).slice(0, 120)}`);
    }
    await sleep(8000);
  }
  return false;
}

const pwPath = resolvePlaywright();
if (!pwPath) {
  console.error("Playwright not found. Install it (bun add -d playwright) or restore the npx cache.");
  process.exit(3);
}
if (!fs.existsSync(CHROME_BIN)) {
  console.error(`Chrome not found at ${CHROME_BIN}. Set CHROME_BIN or install Chromium.`);
  process.exit(3);
}

const { chromium } = require(pwPath);

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME_BIN,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  page.on("console", (m) => {
    if (m.type() === "error") {
      out.consoleErrors.push(m.text().slice(0, 200));
      log(`console.error: ${m.text().slice(0, 200)}`);
    }
  });
  page.on("pageerror", (e) => {
    out.consoleErrors.push(`PAGEERROR: ${String(e).slice(0, 200)}`);
    log(`pageerror: ${String(e).slice(0, 200)}`);
  });

  // Watchdog — dump partial results instead of dying silently.
  const watchdog = setTimeout(() => {
    log("WATCHDOG: forcing exit");
    fs.writeFileSync(REPORT, JSON.stringify(out, null, 2));
    process.exit(2);
  }, WAIT_MS + 5 * 60 * 1000);
  watchdog.unref();

  log(`waiting for preview health (up to ${Math.round(WAIT_MS / 60000)} min): ${BASE}`);
  const healthy = await waitForHealthy(page);
  check("preview.healthy", healthy, { base: BASE });
  if (!healthy) {
    out.exit = 2;
    await browser.close();
    fs.writeFileSync(REPORT, JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
    process.exitCode = 2;
    return;
  }

  // ---- FLOW 0: landing page gradient CTAs ----
  try {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000); // hero video + motion settle
    const landingCtAs = [
      { role: "link", name: "Book a Ride", slug: "nav-book-ride" },
      { role: "link", name: "Book Now", slug: "hero-book-now" },
      { role: "button", name: "Book this route", slug: "route-book" },
      { role: "button", name: "Book", slug: "fleet-book" },
      { role: "button", name: "Become a driver", slug: "driver-cta" },
      { role: "button", name: "Book a Sawaari", slug: "final-cta" },
    ];
    for (const cta of landingCtAs) {
      const loc = page.getByRole(cta.role, { name: cta.name, exact: true }).first();
      const st = await computed(loc);
      check(
        `landing.${cta.slug}.gradient`,
        isGradient(st.bgImage),
        { bgImage: st.bgImage, cls: st.cls },
      );
      check(
        `landing.${cta.slug}.dark-text`,
        st.color !== "rgb(255, 255, 255)",
        { color: st.color },
      );
    }
    await page.screenshot({ path: "/tmp/sawaari-landing.png" }).catch(() => {});
  } catch (e) {
    check("landing.flow", false, { error: String(e).slice(0, 200) });
  }

  // ---- FLOW 0b: auth page gradient CTAs (start state) ----
  try {
    await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);
    const sendOtp = page.getByRole("button", { name: "Send OTP" });
    const sendStyle = await computed(sendOtp);
    check(
      "auth.send-otp.gradient",
      isGradient(sendStyle.bgImage),
      { bgImage: sendStyle.bgImage, cls: sendStyle.cls },
    );
    check(
      "auth.send-otp.dark-text",
      sendStyle.color !== "rgb(255, 255, 255)",
      { color: sendStyle.color },
    );

    // email submit arrow button (icon-only; locate via the form)
    await page.getByRole("button", { name: "Email OTP" }).click();
    await page.waitForTimeout(500);
    const emailStyle = await computed(page.locator('form button[type="submit"]'));
    check(
      "auth.email-submit.gradient",
      isGradient(emailStyle.bgImage),
      { bgImage: emailStyle.bgImage, cls: emailStyle.cls },
    );
    await page.screenshot({ path: "/tmp/sawaari-auth.png" }).catch(() => {});
  } catch (e) {
    check("auth.flow", false, { error: String(e).slice(0, 200) });
  }

  // ---- FLOW 1: rider dashboard ----
  try {
    await signIn(page, "Book a rickshaw", RIDER_PHONE, async (p) => {
      // at the OTP step the demo banner is up and Verify & continue is rendered
      const st = await computed(p.getByRole("button", { name: /Verify & continue/ }));
      check(
        "auth.verify-otp.gradient",
        isGradient(st.bgImage),
        { bgImage: st.bgImage, cls: st.cls },
      );
      check(
        "auth.verify-otp.dark-text",
        st.color !== "rgb(255, 255, 255)",
        { color: st.color },
      );
    });
  } catch (e) {
    check("rider.signin", false, { error: String(e).slice(0, 200) });
  }
  const pickupInput = page.getByPlaceholder("Search pickup point…");
  await pickupInput.waitFor({ timeout: 30000 }).catch(() => {});
  const dashVisible = await pickupInput.isVisible().catch(() => false);
  check("rider.signin", dashVisible, { url: page.url() });

  if (dashVisible) {
    const p1 = await pickLocation(page, "Search pickup point…", "Connaught Place, New Delhi");
    const p2 = await pickLocation(page, "Search drop-off point…", "India Gate, New Delhi");
    check("rider.locations", p1 && p2, { pickupPicked: p1, dropoffPicked: p2 });

    const bookBtn = page.getByRole("button", { name: /Book now/ });
    let enabled = false;
    for (let i = 0; i < 20 && !enabled; i++) {
      await sleep(1000);
      enabled = !(await bookBtn.isDisabled().catch(() => true));
    }
    const bookStyle = await computed(bookBtn);
    check("rider.book-now.enabled", enabled, bookStyle);
    check(
      "rider.book-now.gradient",
      isGradient(bookStyle.bgImage),
      { bgImage: bookStyle.bgImage, cls: bookStyle.cls },
    );
    check(
      "rider.book-now.dark-text",
      bookStyle.color !== "rgb(255, 255, 255)",
      { color: bookStyle.color },
    );

    const fare = page.locator("text=/Fare calculator/").first();
    if (await fare.isVisible().catch(() => false)) {
      const card = fare.locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
      const cardStyle = await computed(card);
      const borderAlpha = alphaOf(cardStyle.borderColor);
      check(
        "rider.fare-card.tint",
        isGradient(cardStyle.bgImage) || (borderAlpha !== null && borderAlpha > 0),
        { bgImage: cardStyle.bgImage, borderColor: cardStyle.borderColor },
      );
    } else {
      check("rider.fare-card.tint", false, { note: "Fare calculator card not visible" });
    }
    await page.screenshot({ path: "/tmp/sawaari-rider-booked.png" }).catch(() => {});
  }

  // ---- sign out (AppShell has an aria-label="Sign out" icon button) ----
  log("signing out");
  await page
    .getByRole("button", { name: "Sign out" })
    .click({ timeout: 10000 })
    .catch(() => {});
  await sleep(1500);
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  }).catch(() => {});
  await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000);

  // ---- FLOW 2: driver dashboard ----
  try {
    await signIn(page, "Drive with SAWAARI", DRIVER_PHONE);
  } catch (e) {
    check("driver.signin", false, { error: String(e).slice(0, 200) });
  }
  await page.waitForTimeout(4000);
  check("driver.signin", page.url().includes("/app/driver"), { url: page.url() });

  async function ctaCheck(name, re) {
    const btn = page.getByRole("button", { name: re });
    if (!(await btn.isVisible().catch(() => false))) {
      check(name, false, { note: "CTA not visible on this driver state" });
      return;
    }
    const st = await computed(btn);
    check(`${name}.gradient`, isGradient(st.bgImage), { bgImage: st.bgImage, cls: st.cls });
  }

  await ctaCheck("driver.create-profile", /Create profile/);
  await ctaCheck("driver.go-online", /Go online/);
  await ctaCheck("driver.withdraw", /Withdraw/);
  await ctaCheck("driver.accept", /Accept/);
  await ctaCheck("driver.arrived", /Arrived at pickup/);

  await page.screenshot({ path: "/tmp/sawaari-driver-dash.png" }).catch(() => {});

  await browser.close();
  out.ok = failed === 0;
  out.exit = failed === 0 ? 0 : 1;
  out.passed = passed;
  out.failed = failed;
  fs.writeFileSync(REPORT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  process.exitCode = out.exit;
})().catch((e) => {
  log(`SCRIPT_ERROR: ${((e && e.stack) || e).slice(0, 500)}`);
  out.error = String((e && e.stack) || e).slice(0, 500);
  out.exit = 1;
  out.failed = failed + 1;
  fs.writeFileSync(REPORT, JSON.stringify(out, null, 2));
  console.error("SCRIPT_ERROR:", (e && e.stack) || e);
  console.log(JSON.stringify(out, null, 2));
  process.exitCode = 1;
});
