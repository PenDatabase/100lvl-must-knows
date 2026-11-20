import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { payments, users } from "@/db/schema";
import { getCurrentUser } from "@/app/actions";

type CheckoutDetails = {
  status?: string;
  payment_status?: string;
  amount?: string;
  currency?: string;
  charge?: { status?: string };
  customer_details?: { email?: string };
  customer?: { email?: string };
  metadata?: { user_id?: string };
};

export async function GET(request: NextRequest) {
  const checkoutId = request.nextUrl.searchParams.get("checkout_id");
  if (!checkoutId) {
    const user = await getCurrentUser();
    if (user) {
      const [payment] = await db.select()
        .from(payments)
        .where(and(
          eq(payments.userId, user.id),
          inArray(payments.status, ["succeeded", "completed"]),
        ))
        .limit(1);
      if (payment) {
        return NextResponse.redirect(new URL("/payment/success", request.url));
      }
    }
    return NextResponse.redirect(new URL("/pricing?error=checkout", request.url));
  }

  let [existingPayment] = await db.select()
    .from(payments)
    .where(eq(payments.checkoutId, checkoutId))
    .limit(1);
  if (existingPayment && ["succeeded", "completed"].includes(existingPayment.status)) {
    const apiKey = process.env.BACHS_API_KEY;
    const secret = process.env.PAYMENT_ACCESS_SECRET || process.env.BACHS_WEBHOOK_SECRET || apiKey;
    if (secret) {
      const value = crypto.randomBytes(24).toString("hex");
      const signature = crypto.createHmac("sha256", secret).update(value).digest("hex");
      const redirect = NextResponse.redirect(new URL("/payment/success", request.url));
      redirect.cookies.set("playbook_access", `${value}.${signature}`, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
      return redirect;
    }
  }

  const apiKey = process.env.BACHS_API_KEY;
  if (!apiKey) return NextResponse.redirect(new URL("/pricing?error=payment-not-configured", request.url));
  const baseUrl = apiKey.startsWith("sk_sandbox_") ? "https://sandbox-api.bachs.io" : "https://api.bachs.io";
  let checkout: CheckoutDetails | null = null;
  try {
    const response = await fetch(`${baseUrl}/v1/checkout-sessions/${encodeURIComponent(checkoutId)}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (response.ok) {
      checkout = await response.json();
    } else {
      console.error("Bachs return verification failed", {
        checkoutId,
        status: response.status,
        keyType: apiKey.startsWith("sk_sandbox_") ? "sandbox" : apiKey.startsWith("sk_live_") ? "live" : "unknown",
      });
    }
  } catch (error) {
    console.error("Bachs checkout verification failed", error);
  }
  const paymentSucceeded = Boolean(
    checkout &&
    String(checkout.status).toLowerCase() === "completed" &&
    (["succeeded", "paid"].includes(String(checkout.payment_status).toLowerCase()) ||
      String(checkout.charge?.status).toLowerCase() === "succeeded")
  );
  if (!paymentSucceeded) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      [existingPayment] = await db.select()
        .from(payments)
        .where(eq(payments.checkoutId, checkoutId))
        .limit(1);
      if (existingPayment && ["succeeded", "completed"].includes(existingPayment.status)) break;
    }
  }
  const existingPaymentSucceeded = Boolean(
    existingPayment && ["succeeded", "completed"].includes(existingPayment.status)
  );
  if (!paymentSucceeded && !existingPaymentSucceeded) {
    return NextResponse.redirect(new URL("/pricing?error=checkout", request.url));
  }

  const email = checkout?.customer_details?.email || checkout?.customer?.email || existingPayment?.email || null;
  const metadataUserId = Number(checkout?.metadata?.user_id);
  const [metadataUser] = Number.isInteger(metadataUserId) && metadataUserId > 0
    ? await db.select().from(users).where(eq(users.id, metadataUserId)).limit(1)
    : [];
  const [emailUser] = !metadataUser && email
    ? await db.select().from(users).where(eq(users.email, String(email).toLowerCase())).limit(1)
    : [];
  let user = metadataUser || emailUser || null;
  if (!user && existingPayment?.userId) {
    const [existingUser] = await db.select().from(users).where(eq(users.id, existingPayment.userId)).limit(1);
    user = existingUser || null;
  }
  await db.insert(payments).values({
    checkoutId,
    userId: user?.id || null,
    email,
    amount: checkout?.amount || existingPayment?.amount || "2000.00",
    currency: checkout?.currency || existingPayment?.currency || "NGN",
    status: "succeeded",
    paidAt: new Date(),
  }).onConflictDoUpdate({
    target: payments.checkoutId,
    set: { userId: user?.id || existingPayment?.userId || null, email, amount: checkout?.amount || existingPayment?.amount || "2000.00", currency: checkout?.currency || existingPayment?.currency || "NGN", status: "succeeded", paidAt: new Date() },
  });

  const secret = process.env.PAYMENT_ACCESS_SECRET || process.env.BACHS_WEBHOOK_SECRET || apiKey;
  const value = crypto.randomBytes(24).toString("hex");
  const signature = crypto.createHmac("sha256", secret).update(value).digest("hex");
  const redirect = NextResponse.redirect(new URL("/payment/success", request.url));
  redirect.cookies.set("playbook_access", `${value}.${signature}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return redirect;
}
