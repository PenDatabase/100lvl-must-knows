import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { payments, users } from "@/db/schema";

export async function GET(request: NextRequest) {
  const checkoutId = request.nextUrl.searchParams.get("checkout_id");
  if (!checkoutId) return NextResponse.redirect(new URL("/pricing?error=checkout", request.url));

  const apiKey = process.env.BACHS_API_KEY;
  if (!apiKey) return NextResponse.redirect(new URL("/pricing?error=payment-not-configured", request.url));
  const baseUrl = apiKey.startsWith("sk_sandbox_") ? "https://sandbox-api.bachs.io" : "https://api.bachs.io";
  const response = await fetch(`${baseUrl}/v1/checkout-sessions/${encodeURIComponent(checkoutId)}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  if (!response.ok) return NextResponse.redirect(new URL("/pricing?error=checkout", request.url));

  const checkout = await response.json();
  if (checkout.status !== "completed" || checkout.payment_status !== "succeeded") {
    return NextResponse.redirect(new URL("/pricing?error=checkout", request.url));
  }

  const email = checkout.customer_details?.email || checkout.customer?.email || null;
  const metadataUserId = Number(checkout.metadata?.user_id);
  const [metadataUser] = Number.isInteger(metadataUserId) && metadataUserId > 0
    ? await db.select().from(users).where(eq(users.id, metadataUserId)).limit(1)
    : [];
  const [emailUser] = !metadataUser && email
    ? await db.select().from(users).where(eq(users.email, String(email).toLowerCase())).limit(1)
    : [];
  const user = metadataUser || emailUser;
  await db.insert(payments).values({
    checkoutId,
    userId: user?.id || null,
    email,
    amount: checkout.amount || "2000.00",
    currency: checkout.currency || "NGN",
    status: "succeeded",
    paidAt: new Date(),
  }).onConflictDoUpdate({
    target: payments.checkoutId,
    set: { userId: user?.id || null, email, amount: checkout.amount || "2000.00", currency: checkout.currency || "NGN", status: "succeeded", paidAt: new Date() },
  });

  const secret = process.env.PAYMENT_ACCESS_SECRET || process.env.BACHS_WEBHOOK_SECRET || apiKey;
  const value = crypto.randomBytes(24).toString("hex");
  const signature = crypto.createHmac("sha256", secret).update(value).digest("hex");
  const redirect = NextResponse.redirect(new URL("/blog", request.url));
  redirect.cookies.set("playbook_access", `${value}.${signature}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return redirect;
}
