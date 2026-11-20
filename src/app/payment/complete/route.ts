import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { payments, users } from "@/db/schema";
import { getCurrentUser } from "@/app/actions";
import { log, logError } from "@/lib/logger";

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
  log("info", "payment_return.entered", {
    checkoutId: request.nextUrl.searchParams.get("checkout_id"),
  });
  const checkoutId = request.nextUrl.searchParams.get("checkout_id");
  if (!checkoutId) {
    let user;
    try {
      user = await getCurrentUser();
    } catch (error) {
      logError("payment_return.user_lookup_failed", error);
    }
    if (user) {
      let payment;
      try {
        [payment] = await db.select()
          .from(payments)
          .where(and(
            eq(payments.userId, user.id),
            inArray(payments.status, ["succeeded", "completed"]),
          ))
          .limit(1);
      } catch (error) {
        logError("payment_return.payment_lookup_failed", error, { userId: user.id, email: user.email });
      }
      if (payment) {
        log("info", "payment_return.existing_payment_redirect", {
          userId: user.id,
          paymentId: payment.id,
          checkoutId: payment.checkoutId,
          paymentStatus: payment.status,
        });
        return NextResponse.redirect(new URL("/payment/success", request.url));
      }
    }
    log("warn", "payment_return.missing_checkout_id");
    return NextResponse.redirect(new URL("/pricing?error=checkout", request.url));
  }

  let existingPayment: typeof payments.$inferSelect | undefined;
  try {
    [existingPayment] = await db.select()
      .from(payments)
      .where(eq(payments.checkoutId, checkoutId))
      .limit(1);
  } catch (error) {
    logError("payment_return.initial_database_lookup_failed", error, { checkoutId });
    return NextResponse.redirect(new URL("/pricing?error=checkout", request.url));
  }
  if (existingPayment && ["succeeded", "completed"].includes(existingPayment.status)) {
    log("info", "payment_return.already_recorded", {
      checkoutId,
      paymentId: existingPayment.id,
      paymentStatus: existingPayment.status,
      userId: existingPayment.userId,
      email: existingPayment.email,
    });
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
  if (!apiKey) {
    log("error", "payment_return.provider_not_configured", { checkoutId });
    return NextResponse.redirect(new URL("/pricing?error=payment-not-configured", request.url));
  }
  const baseUrl = apiKey.startsWith("sk_sandbox_") ? "https://sandbox-api.bachs.io" : "https://api.bachs.io";
  let checkout: CheckoutDetails | null = null;
  try {
    const response = await fetch(`${baseUrl}/v1/checkout-sessions/${encodeURIComponent(checkoutId)}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (response.ok) {
      checkout = await response.json();
      log("info", "payment_return.provider_verified", {
        checkoutId,
        providerStatus: checkout?.status,
        paymentStatus: checkout?.payment_status,
        chargeStatus: checkout?.charge?.status,
      });
    } else {
      log("error", "payment_return.provider_verification_failed", {
        checkoutId,
        status: response.status,
        keyType: apiKey.startsWith("sk_sandbox_") ? "sandbox" : apiKey.startsWith("sk_live_") ? "live" : "unknown",
      });
    }
  } catch (error) {
    logError("payment_return.provider_request_failed", error, { checkoutId });
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
      try {
        [existingPayment] = await db.select()
          .from(payments)
          .where(eq(payments.checkoutId, checkoutId))
          .limit(1);
      } catch (error) {
        logError("payment_return.poll_database_lookup_failed", error, { checkoutId, attempt: attempt + 1 });
        break;
      }
      if (existingPayment && ["succeeded", "completed"].includes(existingPayment.status)) break;
    }
  }
  const existingPaymentSucceeded = Boolean(
    existingPayment && ["succeeded", "completed"].includes(existingPayment.status)
  );
  if (!paymentSucceeded && !existingPaymentSucceeded) {
    log("warn", "payment_return.payment_not_confirmed", {
      checkoutId,
      providerStatus: checkout?.status,
      providerPaymentStatus: checkout?.payment_status,
      providerChargeStatus: checkout?.charge?.status,
    });
    return NextResponse.redirect(new URL("/pricing?error=checkout", request.url));
  }

  const email = checkout?.customer_details?.email || checkout?.customer?.email || existingPayment?.email || null;
  const metadataUserId = Number(checkout?.metadata?.user_id);
  let metadataUser;
  let emailUser;
  try {
    [metadataUser] = Number.isInteger(metadataUserId) && metadataUserId > 0
      ? await db.select().from(users).where(eq(users.id, metadataUserId)).limit(1)
      : [];
    [emailUser] = !metadataUser && email
      ? await db.select().from(users).where(eq(users.email, String(email).toLowerCase())).limit(1)
      : [];
  } catch (error) {
    logError("payment_return.user_lookup_failed", error, { checkoutId, metadataUserId, email });
    return NextResponse.redirect(new URL("/pricing?error=checkout", request.url));
  }
  let user = metadataUser || emailUser || null;
  if (!user && existingPayment?.userId) {
    try {
      const [existingUser] = await db.select().from(users).where(eq(users.id, existingPayment.userId)).limit(1);
      user = existingUser || null;
    } catch (error) {
      logError("payment_return.existing_user_lookup_failed", error, {
        checkoutId,
        existingUserId: existingPayment.userId,
      });
    }
  }
  if (!user) {
    log("warn", "payment_return.user_not_resolved", { checkoutId, email, metadataUserId });
  }
  try {
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
    log("info", "payment_return.payment_recorded", {
      checkoutId,
      userId: user?.id || existingPayment?.userId || null,
      email,
      amount: checkout?.amount || existingPayment?.amount || "2000.00",
      currency: checkout?.currency || existingPayment?.currency || "NGN",
      paymentStatus: "succeeded",
    });
  } catch (error) {
    logError("payment_return.database_upsert_failed", error, {
      checkoutId,
      userId: user?.id || existingPayment?.userId || null,
      email,
    });
    return NextResponse.redirect(new URL("/pricing?error=checkout", request.url));
  }

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
