# VLY Integrations

First-order integrations for AI, email, and payments with automatic usage billing through VLY integration keys.

## Environment Variables

The following environment variables are automatically set during project creation:

- `VLY_INTEGRATION_KEY`: Your unique integration key (format: `sk_*`)
- `VLY_INTEGRATION_BASE_URL`: The base URL for the integration gateway (default: `https://integrations.freebuff.com/`)

## Installation

The `@vly-ai/integrations` package is already included in package.json.

## Usage in Convex Actions

```typescript
"use node";

import { vly } from '../lib/vly-integrations';
import { action } from "./_generated/server";

export const generateAIResponse = action({
  handler: async (ctx, args) => {
    // AI Completions
    const completion = await freebuff.com.completion({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' }
      ],
      temperature: 0.7,
      maxTokens: 150
    });
    
    return completion;
  }
});
```

## Available Features

### AI Integration
```typescript
// Create completion
const completion = await freebuff.com.completion({
  model: 'gpt-4o-mini', // or 'gpt-4o', 'claude-3-haiku', etc.
  messages: [...],
  temperature: 0.7,
  maxTokens: 150
});

// Stream completion
await freebuff.com.streamCompletion(
  request,
  (chunk: string) => console.log(chunk)
);

// Generate embeddings
const embeddings = await freebuff.com.embeddings("Your text here");
```

### Email Integration
```typescript
// Send email
const emailResult = await vly.email.send({
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Welcome to our service!</h1>',
  text: 'Welcome to our service!'
});

// Send batch emails
const batchResult = await vly.email.sendBatch([...emails]);
```

### Payments Integration
```typescript
// Create payment intent
const paymentIntent = await vly.payments.createPaymentIntent({
  amount: 2000, // $20.00 in cents
  currency: 'usd',
  description: 'Premium subscription',
  customer: {
    email: 'customer@example.com'
  }
});

// Create subscription
const subscription = await vly.payments.createSubscription({...});

// Create checkout session
const session = await vly.payments.createCheckoutSession({...});
```

## Error Handling

All methods return an ApiResponse object:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  usage?: {
    credits: number;
    operation: string;
  };
}
```

Example error handling:

```typescript
const result = await freebuff.com.completion({ ... });

if (result.success) {
  console.log('Response:', result.data);
  console.log('Credits used:', result.usage?.credits);
} else {
  console.error('Error:', result.error);
}
```

## Important Notes

1. The integration key (`VLY_INTEGRATION_KEY`) is automatically injected during project creation
2. All API calls are automatically billed to your deployment based on usage
3. Must be used in Convex actions with `"use node"` directive
4. The integration key should never be exposed to the client

## Checking Integration Status

To verify the integration is properly configured:

```typescript
const hasIntegration = !!process.env.VLY_INTEGRATION_KEY;
if (!hasIntegration) {
  console.error("VLY integration key not found");
}
```

## Stripe Payments & Connect (Sawaari)

Stripe is the payment rail for ride fares, wallet top-ups, and driver payouts.

### Environment Variables

Paste these into the project's Keys/API keys tab (never into `.env` or client code):

- `STRIPE_SECRET_KEY` — Stripe secret key (`sk_test_...` / `sk_live_...`)
- `STRIPE_PUBLISHABLE_KEY` — publishable key (`pk_test_...` / `pk_live_...`)
- `STRIPE_WEBHOOK_SECRET` — signing secret (`whsec_...`) from the webhook endpoint below

Without keys, the app degrades gracefully: card checkout falls back to the demo
payment path, and Connect onboarding/payouts show "Not connected".

### Webhook Endpoint

Configure a Stripe webhook pointing at `https://<your-deployment>.convex.site/stripe/webhook`
with the following events:

- `payment_intent.succeeded` — captures the fare/top-up and settles the ride (receipt + 75/25 split) or credits the rider wallet idempotently
- `account.updated` — tracks Stripe Connect onboarding state and enables driver payouts once `charges_enabled` + `payouts_enabled`
- `transfer.created` — confirms a driver payout transfer so the payout ledger row flips to `paid`

Signatures are verified with the `STRIPE_WEBHOOK_SECRET` in the Convex HTTP action
(`src/convex/http.ts` → `src/convex/stripeWebhooks.ts`), and every event is deduped
via the `stripeEvents` table keyed on the Stripe event id.

### Rider Card Checkout

1. `createPaymentIntent` (Convex action, `src/convex/stripe.ts`) mints a PaymentIntent for the exact ride fare and lazily creates a Stripe Customer for the rider.
2. `src/components/ride/StripeCardPayment.tsx` mounts Stripe's PaymentElement with the returned client secret.
3. On `payment_intent.succeeded`, the webhook settles the ride through the same internal settlement core as `payRide` — receipt issued, 75% to the driver's wallet, 25% platform-retained.

### Driver Payouts (Stripe Connect Express)

1. `createConnectAccount` creates a Connect Express account for the driver and returns an onboarding link (also used to resume onboarding).
2. `account.updated` webhooks flip the driver's `stripeConnectStatus` to `active`.
3. `requestPayout` (driver-gated action) transfers the wallet balance to the connected account; `transfer.created` marks the payout paid.

### Test Suite

`src/stripe-flow.test.ts` (convex-test) covers the webhook settlement path, webhook
signature verification, wallet top-ups, payouts, and the auth/role gates — run with
`bun test`.
