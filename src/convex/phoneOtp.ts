"use node";

import { createHash, randomBytes } from "node:crypto";
import { v } from "convex/values";
import axios from "axios";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

// ---- constants ------------------------------------------------------------

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 30 * 1000; // 30 seconds between sends
const MAX_ATTEMPTS = 5;

const VONAGE_ENDPOINT = "https://rest.nexmo.com/sms/json";

/** Normalize an Indian phone number to `91` + 10 digits (E.164-ish). */
function normalizeIndianPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const withoutCc = digits.startsWith("91") ? digits.slice(2) : digits;
  return `91${withoutCc}`;
}

function isValidIndianPhone(phone: string): boolean {
  return /^91[6-9]\d{9}$/.test(phone);
}

function hashCode(code: string, salt: string): string {
  return createHash("sha256")
    .update(`${salt}:${code}`)
    .digest("hex");
}

/** Mask a number for display: 91XXXXXXXXXX -> +91 XXXXX-XXXXX */
function maskPhone(phone: string): string {
  const local = phone.slice(2);
  return `+91 ${local.slice(0, 5)}-${local.slice(5)}`;
}

/** Send the SMS through Vonage. Throws a descriptive error on failure. */
async function sendViaVonage(to: string, text: string): Promise<void> {
  const apiKey = process.env.VONAGE_API_KEY;
  const apiSecret = process.env.VONAGE_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("Vonage credentials are not configured.");
  }
  const from = process.env.VONAGE_FROM || "Sawaari";
  const response = await axios.post(
    VONAGE_ENDPOINT,
    new URLSearchParams({
      api_key: apiKey,
      api_secret: apiSecret,
      from,
      to,
      text,
      type: "text",
    }),
    { timeout: 15_000 },
  );
  const message = response.data?.messages?.[0];
  if (!message || String(message.status) !== "0") {
    throw new Error(
      `SMS delivery failed${message ? `: ${message["error-text"] ?? message.status}` : ""}`,
    );
  }
}

// ---- actions --------------------------------------------------------------

/**
 * Generate a 6-digit OTP, store it hashed, and deliver it by SMS via Vonage.
 *
 * Returns `{ mode: "sms" }` when Vonage credentials are configured and the
 * message was accepted. If no `VONAGE_API_KEY`/`VONAGE_API_SECRET` are set
 * (e.g. before the user adds them in the Keys tab), it returns
 * `{ mode: "demo", code }` so the UI can surface the code for testing.
 */
export const sendOtp = action({
  args: { phone: v.string() },
  returns: v.union(
    v.object({ mode: v.literal("sms"), maskedPhone: v.string() }),
    v.object({ mode: v.literal("demo"), code: v.string(), maskedPhone: v.string() }),
  ),
  handler: async (ctx, { phone }) => {
    const normalized = normalizeIndianPhone(phone);
    if (!isValidIndianPhone(normalized)) {
      throw new Error("Enter a valid 10-digit Indian mobile number.");
    }

    // Resend cooldown — keep the most recent code per phone.
    const existing = await ctx.runQuery(internal.phoneOtpInternal.getOtp, {
      phone: normalized,
    });
    if (existing && Date.now() - existing.createdAt < RESEND_COOLDOWN_MS) {
      throw new Error(
        "Please wait a few seconds before requesting another code.",
      );
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const salt = randomBytes(16).toString("hex");
    await ctx.runMutation(internal.phoneOtpInternal.storeOtp, {
      phone: normalized,
      codeHash: hashCode(code, salt),
      salt,
      expiresAt: Date.now() + OTP_TTL_MS,
    });

    const maskedPhone = maskPhone(normalized);
    const hasCredentials = Boolean(
      process.env.VONAGE_API_KEY && process.env.VONAGE_API_SECRET,
    );

    if (hasCredentials) {
      await sendViaVonage(
        normalized,
        `Your SAWAARI verification code is ${code}. It is valid for 10 minutes. Do not share it with anyone.`,
      );
      return { mode: "sms" as const, maskedPhone };
    }

    // Demo fallback — surface the code until Vonage keys are configured.
    return { mode: "demo" as const, code, maskedPhone };
  },
});

/**
 * Verify a submitted code against the stored one. A record is one-time use:
 * successful verification deletes it; repeated failures also consume it.
 */
export const verifyOtp = action({
  args: { phone: v.string(), code: v.string() },
  returns: v.object({ valid: v.boolean(), maskedPhone: v.string() }),
  handler: async (ctx, { phone, code }) => {
    const normalized = normalizeIndianPhone(phone);
    const maskedPhone = maskPhone(normalized);
    const record = await ctx.runQuery(internal.phoneOtpInternal.getOtp, {
      phone: normalized,
    });

    if (!record) {
      return { valid: false, maskedPhone };
    }
    if (Date.now() > record.expiresAt) {
      await ctx.runMutation(internal.phoneOtpInternal.deleteOtp, {
        id: record._id,
      });
      return { valid: false, maskedPhone };
    }
    if (record.attempts >= MAX_ATTEMPTS) {
      await ctx.runMutation(internal.phoneOtpInternal.deleteOtp, {
        id: record._id,
      });
      return { valid: false, maskedPhone };
    }

    const submitted = String(code).trim();
    const matches = hashCode(submitted, record.salt) === record.codeHash;

    if (matches) {
      await ctx.runMutation(internal.phoneOtpInternal.deleteOtp, {
        id: record._id,
      });
      return { valid: true, maskedPhone };
    }

    await ctx.runMutation(internal.phoneOtpInternal.incrementAttempts, {
      id: record._id,
    });
    return { valid: false, maskedPhone };
  },
});
