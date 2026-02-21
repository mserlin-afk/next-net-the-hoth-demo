"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { loadStripe } from "@stripe/stripe-js";
import { CustomerPortal } from "@/app/customers/[slug]/CustomerPortal";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!;

export type CustomerData = {
  id: string;
  email?: string;
  name?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  };
  balance: number;
  currency: string;
};

async function processPaymentRedirect(customerId: string, clientSecret: string): Promise<void> {
  const stripe = await loadStripe(PUBLISHABLE_KEY);
  if (!stripe) return;
  const { paymentIntent } = await stripe.retrievePaymentIntent(clientSecret);
  if (!paymentIntent || paymentIntent.status !== "succeeded") return;

  const amount =
    (paymentIntent as { amount_received?: number }).amount_received ??
    paymentIntent.amount ??
    0;
  if (amount < 1) return;

  const currency = paymentIntent.currency ?? "usd";
  const res = await fetch("/api/add-funds/apply-credit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerId, amount, currency }),
  });
  if (!res.ok) throw new Error("Failed to apply credit");
}

export default function CustomerPortalPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCustomer = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/customer?customerId=${encodeURIComponent(slug)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to load customer");
      }
      const data = await res.json();
      setCustomer(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load customer");
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (!slug) return;

    const params = new URLSearchParams(window.location.search);
    const secret = params.get("payment_intent_client_secret");

    if (secret) {
      // Coming back from payment redirect: show loading until we've applied credit and refetched
      window.history.replaceState({}, "", `/customers/${slug}`);
      setLoading(true);
      setError(null);
      processPaymentRedirect(slug, secret)
        .then(() => fetchCustomer())
        .catch((e) => {
          setError(e instanceof Error ? e.message : "Failed to update balance");
          setCustomer(null);
        })
        .finally(() => setLoading(false));
      return;
    }

    fetchCustomer();
  }, [slug, fetchCustomer]);

  if (!slug) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-zinc-600">Missing customer ID in URL.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-zinc-600">Loading...</p>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error ?? "Customer not found"}</p>
          <Link href="/" className="text-zinc-600 underline hover:no-underline">
            Return home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-zinc-50">
      {/* Sidebar */}
      <aside className="md:w-80 md:min-h-screen p-6 flex flex-col bg-white border-b md:border-b-0 md:border-r border-zinc-200">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg font-semibold text-zinc-900">Sandbox</span>
          <span className="rounded bg-zinc-800 text-white text-xs px-2 py-0.5">Sandbox</span>
        </div>
        <p className="text-sm text-zinc-600 mb-6">
          Sandbox partners with Stripe for simplified billing.
        </p>
        <Link
          href="/"
          className="text-sm text-zinc-600 hover:text-zinc-900 flex items-center gap-1 mb-auto"
        >
          ← Return to Sandbox
        </Link>
        <footer className="pt-6 border-t border-zinc-100 text-xs text-zinc-500">
          <p className="mb-2">Powered by Stripe</p>
          <a href="https://stripe.com/billing" target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">
            Learn about Stripe Billing
          </a>
          {" · "}
          <a href="https://stripe.com/terms" target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">
            Terms
          </a>
          {" · "}
          <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">
            Privacy
          </a>
        </footer>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 md:p-8">
        <CustomerPortal customer={customer} customerId={slug} onBalanceUpdated={fetchCustomer} />
      </main>
    </div>
  );
}
