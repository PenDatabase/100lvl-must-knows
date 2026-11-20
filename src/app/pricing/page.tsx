import Link from "next/link";
import { BRAND } from "@/site";
import { startCheckout } from "@/app/actions";

export default async function Pricing({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const resolvedSearchParams = await searchParams;
  return (
    <main className="wrap block pricing">
      <nav className="page-nav"><Link href="/blog" className="back">All chapters</Link></nav>
      <p className="kicker">You finished the free chapters</p>
      <h1 className="h-sm">Keep going.</h1>
      <p className="lede">
        Chapters 1 to 3 are free. Pay once to unlock the rest of the {BRAND} and keep reading the complete
        playbook.
      </p>

      <section className="price-card">
        <p className="kicker">Full playbook</p>
        <h2>Unlock every chapter</h2>
        <p className="price">Pay once</p>
        <p>Get immediate access to all the chapters after the free introduction.</p>
        <form action={startCheckout} className="payment-form">
          <label htmlFor="checkout-email">Email address</label>
          <input id="checkout-email" name="email" type="email" required placeholder="you@example.com" />
          <button className="btn" type="submit">Pay ₦2,000</button>
        </form>
        {resolvedSearchParams.error && (
          <p className="err">
            {resolvedSearchParams.error === "email"
              ? "Enter a valid email address."
              : resolvedSearchParams.error === "payment-not-configured"
                ? "Payment is not configured yet."
                : "Unable to start checkout. Please try again."}
          </p>
        )}
      </section>
    </main>
  );
}
