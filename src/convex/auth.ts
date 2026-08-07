// THIS FILE IS READ ONLY. Do not touch this file unless you are correctly adding a new auth provider in accordance to the vly auth documentation
//
// CHANGED (auth hardening): added the `phone-otp` provider below — this is the
// documented exception in the header above ("correctly adding a new auth
// provider"). Previously phone verification was a custom action flow that
// logged the user in as a *fresh anonymous session*, discarding the verified
// phone entirely. The Phone provider ties the session to the verified number.

import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { Phone } from "@convex-dev/auth/providers/Phone";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";
import axios from "axios";
import { emailOtp } from "./auth/emailOtp";
import { isValidIndianPhone, normalizeIndianPhone } from "./phone";
import { internal } from "./_generated/api";

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Phone OTP sign-in (provider id "phone-otp"): the user requests a code with
 * `signIn("phone-otp", { phone })` and verifies it with
 * `signIn("phone-otp", { phone, code })`. Convex Auth mints the code, stores
 * its hash, enforces per-phone rate limiting, and only issues a session when
 * the submitted code matches — so the session is cryptographically bound to
 * the verified phone number.
 *
 * Delivery: real SMS via Vonage when `VONAGE_API_KEY`/`VONAGE_API_SECRET` are
 * configured. Without credentials (dev preview), the code is parked in the
 * `demoOtps` table and surfaced on screen by `phoneOtp.demoCode` — no SMS is
 * sent, and the demo read refuses to work once credentials exist.
 */
const phoneOtp = Phone({
  id: "phone-otp",
  maxAge: OTP_TTL_MS / 1000,
  normalizeIdentifier: (identifier) => normalizeIndianPhone(identifier),
  // 6-digit numeric code, matching the OTP input on the sign-in card (the
  // default is a 32-char alphanumeric token, which the 6-slot UI can't hold).
  generateVerificationToken: async () => {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    return generateRandomString(random, "0123456789", 6);
  },
  sendVerificationRequest: async ({ identifier, token }, ctx) => {
    if (!isValidIndianPhone(identifier)) {
      throw new Error("Enter a valid 10-digit Indian mobile number.");
    }
    const apiKey = process.env.VONAGE_API_KEY;
    const apiSecret = process.env.VONAGE_API_SECRET;
    if (apiKey && apiSecret) {
      const response = await axios.post(
        "https://rest.nexmo.com/sms/json",
        new URLSearchParams({
          api_key: apiKey,
          api_secret: apiSecret,
          from: process.env.VONAGE_FROM || "Sawaari",
          to: identifier,
          text: `Your SAWAARI verification code is ${token}. It is valid for 10 minutes. Do not share it with anyone.`,
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
    } else {
      // Demo mode — park the code for the dev preview to surface.
      await ctx.runMutation(internal.phoneOtpInternal.storeDemoOtp, {
        phone: identifier,
        code: token,
        expiresAt: Date.now() + OTP_TTL_MS,
      });
    }
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [emailOtp, phoneOtp, Anonymous],
});
