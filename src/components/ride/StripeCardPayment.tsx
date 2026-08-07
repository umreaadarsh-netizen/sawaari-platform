import { useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Lock } from "lucide-react";
import { formatINR } from "@/lib/geo";

/**
 * Real card checkout for a settled fare. The rider picks "Card" in the
 * checkout card; `createPaymentIntent` (Convex action) hands back a
 * client secret, and this component mounts a Stripe PaymentElement on top of
 * it. On confirmation the fare is captured by Stripe and the ride is settled
 * server-side by the `payment_intent.succeeded` webhook.
 */

function CardForm({ amount, onSuccess }: { amount: number; onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPaying(true);
    setError(null);
    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });
    if (confirmError) {
      setError(confirmError.message ?? "Payment could not be completed.");
      setPaying(false);
      return;
    }
    setDone(true);
    onSuccess();
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
      <PaymentElement options={{ layout: "tabs" }} />
      {error && <p className="text-[11px] font-medium text-rose-300">{error}</p>}
      <Button
        type="submit"
        disabled={!stripe || !elements || paying || done}
        className="w-full bg-amber-500 py-4 text-sm font-semibold text-amber-950 shadow-lg shadow-amber-500/25 hover:bg-amber-400 disabled:opacity-60"
      >
        {done ? (
          <>
            <CheckCircle2 className="size-4" /> Payment confirmed
          </>
        ) : paying ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Processing payment…
          </>
        ) : (
          <>
            Pay {formatINR(amount)} <Lock className="size-3.5" />
          </>
        )}
      </Button>
    </form>
  );
}

export function StripeCardPayment({
  clientSecret,
  publishableKey,
  amount,
  onSuccess,
}: {
  clientSecret: string;
  publishableKey: string | null;
  amount: number;
  onSuccess: () => void;
}) {
  const stripePromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey) : Promise.resolve(null)),
    [publishableKey],
  );

  if (!publishableKey) return null;

  return (
    <div className="rounded-2xl border border-amber-400/25 bg-slate-950/50 p-4">
      <p className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300">
        <Lock className="size-3" /> Secure card checkout · Stripe
      </p>
      <Elements
        stripe={stripePromise}
        options={{
          clientSecret,
          appearance: {
            theme: "night",
            variables: { colorPrimary: "#f59e0b", borderRadius: "12px" },
          },
        }}
      >
        <CardForm amount={amount} onSuccess={onSuccess} />
      </Elements>
      <p className="mt-2.5 text-center text-[10px] text-slate-500">
        Powered by Stripe — card details never touch Sawaari&apos;s servers.
      </p>
    </div>
  );
}
