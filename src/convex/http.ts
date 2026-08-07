import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

/**
 * Stripe webhook endpoint. http.ts runs in the V8 runtime (no process.env),
 * so signature verification and event processing live in the `"use node"`
 * action `stripeWebhooks.handleWebhook` — this route just relays the raw
 * body + signature header and returns whatever status the action computed.
 */
http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("stripe-signature");
    const body = await request.text();

    // `handleWebhook` is a public action (it must be — http routes can only
    // run public functions); its node runtime is what gives it env access.
    const result = await ctx.runAction(api.stripeWebhooks.handleWebhook, {
      body,
      signature: signature ?? undefined,
    });

    return new Response(result.body, { status: result.status });
  }),
});

export default http;
