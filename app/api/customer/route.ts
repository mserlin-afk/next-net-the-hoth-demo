import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get("customerId");

  if (!customerId || !customerId.startsWith("cus_")) {
    return NextResponse.json(
      { error: "Valid customerId (cus_...) is required" },
      { status: 400 }
    );
  }

  try {
    const customer = await stripe.customers.retrieve(customerId);

    if (customer.deleted) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const currency = (customer as { currency?: string }).currency ?? "usd";
    const balance = (customer as { balance?: number }).balance ?? 0;

    return NextResponse.json({
      id: customer.id,
      email: customer.email ?? undefined,
      name: customer.name ?? undefined,
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
      balance,
      currency,
    });
  } catch (err) {
    console.error("Customer fetch error:", err);
    return NextResponse.json(
      { error: "Failed to fetch customer" },
      { status: 500 }
    );
  }
}
