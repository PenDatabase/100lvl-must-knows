import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { getCurrentUser } from "@/app/actions";
import { log, logError } from "@/lib/logger";

function grantAccessAndRedirect(request: NextRequest, checkoutId: string) {
  const secret = process.env.PAYMENT_ACCESS_SECRET || process.env.BACHS_WEBHOOK_SECRET;
  if (!secret) {
    log("error", "payment_return.access_secret_missing", { checkoutId });
    return NextResponse.redirect(new URL("/pricing?error=payment-not-configured", request.url));
  }

  const value = crypto.randomBytes(24).toString("hex");
  const signature = crypto.createHmac("sha256", secret).update(value).digest("hex");
  const response = NextResponse.redirect(new URL("/payment/success", request.url));
  response.cookies.set("playbook_access", `${value}.${signature}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

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
        return grantAccessAndRedirect(request, payment.checkoutId);
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
    return grantAccessAndRedirect(request, checkoutId);
  }

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
    if (existingPayment && ["succeeded", "completed"].includes(existingPayment.status)) {
      log("info", "payment_return.webhook_record_received", {
        checkoutId,
        paymentId: existingPayment.id,
        paymentStatus: existingPayment.status,
        userId: existingPayment.userId,
        email: existingPayment.email,
        attempt: attempt + 1,
      });
      break;
    }
  }
  const existingPaymentSucceeded = Boolean(
    existingPayment && ["succeeded", "completed"].includes(existingPayment.status)
  );
  if (!existingPaymentSucceeded) {
    log("warn", "payment_return.checkout_id_mismatch", {
      checkoutId,
    });

    let user;
    try {
      user = await getCurrentUser();
    } catch (error) {
      logError("payment_return.fallback_user_lookup_failed", error, { checkoutId });
    }

    if (user) {
      let userPayment: typeof payments.$inferSelect | undefined;
      try {
        [userPayment] = await db.select()
          .from(payments)
          .where(and(
            eq(payments.userId, user.id),
            inArray(payments.status, ["succeeded", "completed"]),
          ))
          .limit(1);
      } catch (error) {
        logError("payment_return.fallback_payment_lookup_failed", error, {
          checkoutId,
          userId: user.id,
          email: user.email,
        });
      }

      if (userPayment) {
        log("info", "payment_return.checkout_id_mismatch_fallback", {
          checkoutId,
          matchedCheckoutId: userPayment.checkoutId,
          paymentId: userPayment.id,
          userId: user.id,
          paymentStatus: userPayment.status,
        });
        return grantAccessAndRedirect(request, userPayment.checkoutId);
      }
    }

    log("warn", "payment_return.payment_not_found_after_fallback", { checkoutId });
    return NextResponse.redirect(new URL("/pricing?error=checkout", request.url));
  }

  return grantAccessAndRedirect(request, checkoutId);
}
