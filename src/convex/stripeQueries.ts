import { query } from "./_generated/server";
import { getCurrentUser } from "./users";

/**
 * The signed-in driver's Stripe Connect account status, synced from
 * `account.updated` webhooks. `null` when the driver hasn't started
 * onboarding. The driver dashboard uses this to render the payout card.
 */
export const myConnectAccount = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    if (!user.stripeAccountId) return null;
    return {
      accountId: user.stripeAccountId,
      detailsSubmitted: user.stripeDetailsSubmitted ?? false,
      chargesEnabled: user.stripeChargesEnabled ?? false,
      payoutsEnabled: user.stripePayoutsEnabled ?? false,
      paymentMethodId: user.stripePaymentMethodId ?? null,
    };
  },
});
