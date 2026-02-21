"use client";

import { useState, useEffect, useRef } from "react";
import { loadStripe } from "@stripe/stripe-js";
import type { CustomerData } from "./page";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!;

function formatBalance(balance: number, currency: string): string {
  const abs = Math.abs(balance);
  const value = (abs / 100).toFixed(2);
  const symbol = currency === "usd" ? "$" : currency.toUpperCase() + " ";
  if (balance < 0) return `${symbol}${value} credit`;
  if (balance > 0) return `${symbol}${value} due`;
  return `${symbol}0.00`;
}

function formatAddress(addr: NonNullable<CustomerData["address"]>): string {
  const parts = [
    addr.line1,
    addr.line2,
    [addr.city, addr.state, addr.postal_code].filter(Boolean).join(", "),
    addr.country,
  ].filter(Boolean);
  return parts.join("\n");
}

type Props = {
  customer: CustomerData;
  customerId: string;
  onBalanceUpdated: () => void;
};

export function CustomerPortal({ customer, customerId, onBalanceUpdated }: Props) {
  const [amountDollars, setAmountDollars] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const paymentElementRef = useRef<HTMLDivElement>(null);
  const stripeRef = useRef<Awaited<ReturnType<typeof loadStripe>> | null>(null);
  const elementsRef = useRef<{ getElement: (type: string) => unknown } | null>(null);

  // Mount Payment Element when we have clientSecret
  useEffect(() => {
    if (!clientSecret || !paymentElementRef.current || !PUBLISHABLE_KEY) return;

    let mounted = true;

    (async () => {
      const stripe = await loadStripe(PUBLISHABLE_KEY);
      if (!stripe || !mounted || !paymentElementRef.current) return;
      stripeRef.current = stripe;

      const elements = stripe.elements({ clientSecret });
      elementsRef.current = elements;
      const paymentElement = elements.create("payment");
      paymentElement.mount(paymentElementRef.current);

      return () => {
        mounted = false;
        paymentElement.unmount();
      };
    })();

    return () => {
      mounted = false;
    };
  }, [clientSecret]);

  const handleCreatePaymentIntent = async () => {
    const amount = Math.round(parseFloat(amountDollars) * 100);
    if (!Number.isFinite(amount) || amount < 50) {
      setPayError("Enter at least $0.50");
      return;
    }
    setPayError(null);
    setPayLoading(true);
    try {
      const res = await fetch("/api/add-funds/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, amount, currency: customer.currency }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create payment");
      setClientSecret(data.clientSecret);
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPayLoading(false);
    }
  };

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripeRef.current || !elementsRef.current || !clientSecret) return;

    const amountCents = Math.round(parseFloat(amountDollars) * 100);
    setPayError(null);
    setPayLoading(true);

    try {
      // Stripe requires elements.submit() before confirmPayment (no async work in between)
      const { error: submitError } = await elementsRef.current.submit();
      if (submitError) {
        setPayError(submitError.message ?? "Validation failed");
        setPayLoading(false);
        return;
      }

      const { error } = await stripeRef.current.confirmPayment({
        elements: elementsRef.current,
        clientSecret,
        confirmParams: {
          return_url: `${window.location.origin}/customers/${customerId}?payment_intent_client_secret=${encodeURIComponent(clientSecret)}`,
          payment_method_data: {
            billing_details: {
              name: customer.name ?? undefined,
              email: customer.email ?? undefined,
              address: customer.address
                ? {
                    line1: customer.address.line1 ?? undefined,
                    line2: customer.address.line2 ?? undefined,
                    city: customer.address.city ?? undefined,
                    state: customer.address.state ?? undefined,
                    postal_code: customer.address.postal_code ?? undefined,
                    country: customer.address.country ?? undefined,
                  }
                : undefined,
            },
          },
        },
      });

      if (error) {
        setPayError(error.message ?? "Payment failed");
        setPayLoading(false);
        return;
      }

      // Payment succeeded (or requires action); apply credit
      const applyRes = await fetch("/api/add-funds/apply-credit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          amount: amountCents,
          currency: customer.currency,
        }),
      });

      if (!applyRes.ok) {
        const data = await applyRes.json().catch(() => ({}));
        setPayError(data.error ?? "Payment succeeded but failed to add credit. Contact support.");
        setPayLoading(false);
        return;
      }

      setClientSecret(null);
      setAmountDollars("");
      onBalanceUpdated();
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPayLoading(false);
    }
  };

  const currency = customer.currency.toUpperCase();

  return (
    <div className="max-w-2xl space-y-8">
      {/* Credit balance */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
          Credit balance
        </h2>
        <p className="text-2xl font-semibold text-zinc-900">
          {formatBalance(customer.balance, customer.currency)}
        </p>
      </section>

      {/* Billing information */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
          Billing information
        </h2>
        <div className="text-sm text-zinc-700 space-y-1">
          {customer.name && <p><strong>Name:</strong> {customer.name}</p>}
          {customer.email && <p><strong>Email:</strong> {customer.email}</p>}
          {customer.address && (
            <p className="whitespace-pre-line">
              <strong>Billing address:</strong><br />
              {formatAddress(customer.address)}
            </p>
          )}
          {!customer.name && !customer.email && !customer.address && (
            <p className="text-zinc-500">No billing details on file.</p>
          )}
        </div>
      </section>

      {/* Add to credit balance */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
          Add to credit balance
        </h2>
        <p className="text-sm text-zinc-600 mb-4">
          Add funds to your account. They will apply to future invoices.
        </p>

        {!clientSecret ? (
          <div className="space-y-3">
            <div>
              <label htmlFor="amount" className="block text-sm font-medium text-zinc-700 mb-1">
                Amount ({currency})
              </label>
              <input
                id="amount"
                type="number"
                min="0.5"
                step="0.01"
                placeholder="0.00"
                value={amountDollars}
                onChange={(e) => setAmountDollars(e.target.value)}
                className="w-full max-w-xs rounded border border-zinc-300 px-3 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            {payError && <p className="text-sm text-red-600">{payError}</p>}
            <button
              type="button"
              onClick={handleCreatePaymentIntent}
              disabled={payLoading}
              className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {payLoading ? "Preparing…" : "Continue to payment"}
            </button>
          </div>
        ) : (
          <form onSubmit={handleConfirmPayment} className="space-y-4">
            <div ref={paymentElementRef} className="min-h-[200px]" />
            {payError && <p className="text-sm text-red-600">{payError}</p>}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={payLoading}
                className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {payLoading ? "Processing…" : `Pay ${currency} ${amountDollars}`}
              </button>
              <button
                type="button"
                onClick={() => setClientSecret(null)}
                disabled={payLoading}
                className="rounded border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
