import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

const MIN_CENTS = 1;
const MAX_CENTS = 999_999_99;

export async function POST(request: Request) {
  let body: { customerId?: string; amount?: number; currency?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { customerId, amount, currency = "usd" } = body;

  if (!customerId || !customerId.startsWith("cus_")) {
    return NextResponse.json(
      { error: "Valid customerId (cus_...) is required" },
      { status: 400 }
    );
  }

  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < MIN_CENTS || amount > MAX_CENTS) {
    return NextResponse.json(
      { error: `Amount must be an integer in cents between ${MIN_CENTS} and ${MAX_CENTS}` },
      { status: 400 }
    );
  }

  if (typeof currency !== "string" || currency.length !== 3) {
    return NextResponse.json(
      { error: "Valid 3-letter currency code is required" },
      { status: 400 }
    );
  }

  try {
    await stripe.customers.createBalanceTransaction(customerId, {
      amount: -amount, // negative = credit to customer
      currency: currency.toLowerCase(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Apply credit error:", err);
    return NextResponse.json(
      { error: "Failed to apply credit" },
      { status: 500 }
    );
  }
}
