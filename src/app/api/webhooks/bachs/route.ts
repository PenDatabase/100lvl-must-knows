import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { log, logError } from "@/lib/logger";

function verify(rawBody: string, request: NextRequest) {
  const secret = process.env.BACHS_WEBHOOK_SECRET;
  if (!secret) return false;
  const v2 = request.headers.get("x-bachs-signature-v2");
  const timestamp = v2
    ? v2.split(",").find((part) => part.startsWith("t="))?.slice(2)
    : request.headers.get("x-bachs-timestamp");
  if (!timestamp) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  if (v2) {
    const signatures = v2.split(",").filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
    return signatures.some((signature) =>
      signature.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    );
  }
  const signature = request.headers.get("x-bachs-signature");
  return !!signature &&
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function POST(request: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (error) {
    logError("payment_webhook.body_read_failed", error);
    return NextResponse.json({ error: "Unable to read webhook" }, { status: 400 });
  }
  if (!verify(rawBody, request)) {
    log("warn", "payment_webhook.signature_invalid", {
      contentLength: rawBody.length,
      hasSignatureV2: Boolean(request.headers.get("x-bachs-signature-v2")),
      hasSignatureV1: Boolean(request.headers.get("x-bachs-signature")),
    });
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  let event: {
    id?: string;
    type?: string;
    data?: any;
  };
  try {
    event = JSON.parse(rawBody);
  } catch (error) {
    logError("payment_webhook.invalid_json", error, { contentLength: rawBody.length });
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  }
  log("info", "payment_webhook.received", {
    eventId: event.id,
    eventType: event.type,
  });
  if (event.type === "collection.succeeded") {
    const data = event.data || {};
    const email = data.customer?.email || null;
    const metadataUserId = Number(data.metadata?.user_id);
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
      logError("payment_webhook.user_lookup_failed", error, {
        eventId: event.id,
        checkoutId: data.checkout_id,
        metadataUserId,
        email,
      });
      return NextResponse.json({ error: "Unable to resolve payment user" }, { status: 500 });
    }
    const user = metadataUser || emailUser;
    try {
      await db.insert(payments).values({
        checkoutId: data.checkout_id,
        userId: user?.id || null,
        eventId: event.id,
        email: data.customer?.email || null,
        amount: data.amount || "2000.00",
        currency: data.currency || "NGN",
        status: "succeeded",
        paidAt: new Date(),
      }).onConflictDoUpdate({
        target: payments.checkoutId,
        set: {
          userId: user?.id || null,
          eventId: event.id,
          email: data.customer?.email || null,
          amount: data.amount || "2000.00",
          currency: data.currency || "NGN",
          status: "succeeded",
          paidAt: new Date(),
        },
      });
      log("info", "payment_webhook.payment_recorded", {
        eventId: event.id,
        eventType: event.type,
        checkoutId: data.checkout_id,
        userId: user?.id || null,
        email,
        amount: data.amount || "2000.00",
        currency: data.currency || "NGN",
        paymentStatus: "succeeded",
      });
    } catch (error) {
      logError("payment_webhook.database_upsert_failed", error, {
        eventId: event.id,
        checkoutId: data.checkout_id,
        userId: user?.id || null,
        email,
      });
      return NextResponse.json({ error: "Unable to record payment" }, { status: 500 });
    }
  }

  if (event.type === "checkout.completed") {
    const data = event.data || {};
    const paymentStatus = String(data.payment_status || "").toLowerCase();
    const chargeSucceeded = String(data.charge?.status || "").toLowerCase();
    const wasPaid = paymentStatus === "succeeded" ||
      paymentStatus === "paid" ||
      chargeSucceeded === "succeeded";
    if (!wasPaid) {
      log("info", "payment_webhook.checkout_not_paid", {
        eventId: event.id,
        checkoutId: data.checkout_id,
        paymentStatus,
        chargeStatus: chargeSucceeded || null,
      });
      return NextResponse.json({ received: true, fulfilled: false });
    }
    const email = data.customer_details?.email || data.customer?.email || null;
    const metadataUserId = Number(data.metadata?.user_id);
    const [metadataUser] = Number.isInteger(metadataUserId) && metadataUserId > 0
      ? await db.select().from(users).where(eq(users.id, metadataUserId)).limit(1)
      : [];
    const [emailUser] = !metadataUser && email
      ? await db.select().from(users).where(eq(users.email, String(email).toLowerCase())).limit(1)
      : [];
    const user = metadataUser || emailUser;
    await db.insert(payments).values({
      checkoutId: data.checkout_id,
      userId: user?.id || null,
      eventId: event.id,
      email,
      amount: data.amount || "2000.00",
      currency: data.currency || "NGN",
      status: "completed",
      paidAt: new Date(),
    }).onConflictDoUpdate({
      target: payments.checkoutId,
      set: {
        userId: user?.id || null,
        eventId: event.id,
        email,
        amount: data.amount || "2000.00",
        currency: data.currency || "NGN",
        status: "completed",
        paidAt: new Date(),
      },
    });
  }

  return NextResponse.json({ received: true });
}
