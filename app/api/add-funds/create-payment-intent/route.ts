import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

const MIN_CENTS = 50; // $0.50
const MAX_CENTS = 999_999_99; // $999,999.99

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

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: typeof currency === "string" ? currency.toLowerCase() : "usd",
      customer: customerId,
      automatic_payment_methods: { enabled: true },
    });

    if (!paymentIntent.client_secret) {
      return NextResponse.json(
        { error: "Failed to create payment intent" },
        { status: 500 }
      );
    }

    return NextResponse.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error("Create payment intent error:", err);
    return NextResponse.json(
      { error: "Failed to create payment intent" },
      { status: 500 }
    );
  }
}
