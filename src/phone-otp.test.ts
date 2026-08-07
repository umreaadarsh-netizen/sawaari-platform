/// <reference types="vite/client" />
import { generateKeyPairSync } from "node:crypto";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { expect, test } from "vitest";
import schema from "./convex/schema";
import { api } from "./convex/_generated/api";

/**
 * End-to-end tests for the `phone-otp` auth provider (see `src/convex/auth.ts`),
 * driving the REAL Convex Auth sign-in action (`auth:signIn`) through
 * convex-test's in-memory backend:
 *
 *   1. requesting a code mints a verification token and delivers it (demo path)
 *   2. a wrong code is rejected and creates no session
 *   3. a verified code issues a session bound to the phone number
 *   4. re-signing in with the same phone links to the same account
 *
 * The provider runs in demo mode here (no Vonage credentials), so codes are
 * parked in `demoOtps` and read back via `api.authDemo.demoCode`.
 */

// Token minting requires the issuer URL + an RS256 signing key; tests run
// without a deployment env, so provide throwaway values.
process.env.CONVEX_SITE_URL = process.env.CONVEX_SITE_URL ?? "https://example.convex.cloud";
process.env.SITE_URL = process.env.SITE_URL ?? "https://example.convex.cloud";
if (!process.env.JWT_PRIVATE_KEY) {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.JWT_PRIVATE_KEY = privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString();
}

const signIn = makeFunctionReference<"action">("auth:signIn");

async function setup() {
  return convexTest({
    schema,
    modules: import.meta.glob("./convex/**/*.*s"),
  });
}

/** Step 1 + step 2: request a code, read it back, verify it. Returns userId. */
async function signInWithPhone(t: Awaited<ReturnType<typeof setup>>, phone: string) {
  await t.action(signIn, { provider: "phone-otp", params: { phone } });
  const code = await t.query(api.authDemo.demoCode, { phone });
  if (!code) throw new Error("No demo code was issued for " + phone);
  const res = (await t.action(signIn, {
    provider: "phone-otp",
    params: { phone, code },
  })) as { tokens?: { token?: string } | null };
  if (!res.tokens?.token) throw new Error("Sign-in did not issue tokens");
  const sub = (JSON.parse(atob(res.tokens.token.split(".")[1])) as { sub: string })
    .sub;
  return sub.split("|")[0]; // userId part of `<userId>|<sessionId>`
}

test("requesting a code mints a 6-digit token surfaced in demo mode", async () => {
  const t = await setup();
  const phone = "919876543210";

  const res = (await t.action(signIn, {
    provider: "phone-otp",
    params: { phone },
  })) as { started?: boolean };
  expect(res.started).toBe(true);

  // The verification token exists server-side (one row per pending code)…
  const codes = await t.run(async (ctx) =>
    ctx.db.query("authVerificationCodes").collect(),
  );
  expect(codes).toHaveLength(1);

  // …and the demo path surfaces it as a 6-digit code, matching the OTP input
  // on the sign-in card (the provider overrides the default 32-char token).
  const code = await t.query(api.authDemo.demoCode, { phone });
  expect(typeof code).toBe("string");
  expect(code).toMatch(/^\d{6}$/);
});

test("a wrong code is rejected and creates no session", async () => {
  const t = await setup();
  const phone = "919876543210";

  await t.action(signIn, { provider: "phone-otp", params: { phone } });

  await expect(
    t.action(signIn, {
      provider: "phone-otp",
      params: { phone, code: "000000" },
    }),
  ).rejects.toThrow("Could not verify code");

  // No session is issued for an unverified phone…
  expect(
    await t.run(async (ctx) => ctx.db.query("authSessions").collect()),
  ).toHaveLength(0);
  // …and the placeholder row Convex Auth creates at code-request time stays
  // UNVERIFIED — the phone is bound to the session only on a correct code.
  const users = await t.run(async (ctx) => ctx.db.query("users").collect());
  expect(users).toHaveLength(1);
  expect(users[0].phone).toBe(phone);
  expect(users[0].phoneVerificationTime).toBeUndefined();
});

test("a verified code creates a session bound to the phone number", async () => {
  const t = await setup();
  const phone = "919876543210";

  const userId = await signInWithPhone(t, phone);

  // The session resolves to a users row carrying the verified phone, proving
  // the session is cryptographically bound to the number — not an anonymous
  // login.
  const session = t.withIdentity({
    subject: userId,
  });
  const user = await session.query(api.users.currentUser, {});
  expect(user?._id).toBe(userId);
  expect(user?.phone).toBe(phone);
  expect(user?.phoneVerificationTime).toBeTypeOf("number");

  // The account row pins provider -> phone -> user.
  const accounts = await t.run(async (ctx) =>
    ctx.db.query("authAccounts").collect(),
  );
  expect(accounts).toHaveLength(1);
  expect(accounts[0].provider).toBe("phone-otp");
  expect(accounts[0].providerAccountId).toBe(phone);
  expect(accounts[0].userId).toBe(userId);

  // The verification code was consumed (one-time use).
  expect(
    await t.run(async (ctx) => ctx.db.query("authVerificationCodes").collect()),
  ).toHaveLength(0);
});

test("re-signing in with the same phone links to the same account", async () => {
  const t = await setup();
  const phone = "919876543210";

  const first = await signInWithPhone(t, phone);
  const second = await signInWithPhone(t, phone);

  // Same phone → same user; the code is one-time-use so the second sign-in
  // needed a fresh token, but no duplicate account was created.
  expect(second).toBe(first);
  expect(
    await t.run(async (ctx) => ctx.db.query("users").collect()),
  ).toHaveLength(1);
  expect(
    await t.run(async (ctx) => ctx.db.query("authAccounts").collect()),
  ).toHaveLength(1);
});

test("a different phone creates a separate account", async () => {
  const t = await setup();

  const a = await signInWithPhone(t, "919876543210");
  const b = await signInWithPhone(t, "919876543211");

  expect(b).not.toBe(a);
  expect(
    await t.run(async (ctx) => ctx.db.query("users").collect()),
  ).toHaveLength(2);
});
