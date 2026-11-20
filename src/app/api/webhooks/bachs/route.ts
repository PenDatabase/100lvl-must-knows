import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

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
  const rawBody = await request.text();
  if (!verify(rawBody, request)) return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });

  const event = JSON.parse(rawBody);
  if (event.type === "collection.succeeded") {
    const data = event.data || {};
    const email = data.customer?.email || null;
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
  }

  if (event.type === "checkout.completed") {
    const data = event.data || {};
    const paymentStatus = String(data.payment_status || "").toLowerCase();
    const chargeSucceeded = String(data.charge?.status || "").toLowerCase();
    const wasPaid = paymentStatus === "succeeded" ||
      paymentStatus === "paid" ||
      chargeSucceeded === "succeeded";
    if (!wasPaid) {
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
