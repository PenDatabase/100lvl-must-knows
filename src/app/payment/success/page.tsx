import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { getCurrentUser } from "@/app/actions";
import { log, logError } from "@/lib/logger";

export const dynamic = "force-dynamic";

export default async function PaymentSuccess() {
  log("info", "payment_success_page.entered");
  let user;
  try {
    user = await getCurrentUser();
  } catch (error) {
    logError("payment_success_page.user_lookup_failed", error);
    redirect("/login");
  }
  if (!user) {
    log("warn", "payment_success_page.user_missing");
    redirect("/login");
  }

  let payment;
  try {
    [payment] = await db.select({ id: payments.id, status: payments.status, checkoutId: payments.checkoutId, paidAt: payments.paidAt })
      .from(payments)
      .where(and(
        eq(payments.userId, user.id),
        inArray(payments.status, ["succeeded", "completed"]),
      ))
      .limit(1);
  } catch (error) {
    logError("payment_success_page.database_lookup_failed", error, {
      userId: user.id,
      email: user.email,
    });
    redirect("/pricing");
  }
  if (!payment) {
    log("warn", "payment_success_page.payment_not_found", {
      userId: user.id,
      email: user.email,
    });
    redirect("/pricing");
  }
  log("info", "payment_success_page.rendered", {
    userId: user.id,
    email: user.email,
    paymentId: payment.id,
    checkoutId: payment.checkoutId,
    paymentStatus: payment.status,
    paidAt: payment.paidAt?.toISOString(),
  });

  return (
    <main className="wrap block">
      <section className="price-card">
        <p className="kicker">Payment successful</p>
        <h1 className="h-sm">You&apos;re unlocked.</h1>
        <p className="lede">Your payment was received and the complete playbook is now available.</p>
        <Link className="btn" href="/blog">Start reading</Link>
      </section>
    </main>
  );
}
