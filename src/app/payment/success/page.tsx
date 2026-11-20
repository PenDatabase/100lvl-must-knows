import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { getCurrentUser } from "@/app/actions";

export default async function PaymentSuccess() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [payment] = await db.select({ id: payments.id })
    .from(payments)
    .where(and(
      eq(payments.userId, user.id),
      inArray(payments.status, ["succeeded", "completed"]),
    ))
    .limit(1);
  if (!payment) redirect("/pricing");

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
