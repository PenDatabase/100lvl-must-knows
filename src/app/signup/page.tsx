import Link from "next/link";
import { signup } from "@/app/actions";
import SiteNavbar from "@/components/SiteNavbar";

export default async function Signup({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main>
      <SiteNavbar />
      <div className="admin-login">
      <section className="admin-card">
        <p className="kicker">Create account</p>
        <h1>Sign up</h1>
        <form action={signup} className="admin-form">
          <label htmlFor="signup-email">Email</label>
          <input id="signup-email" name="email" type="email" required />
          <label htmlFor="signup-password">Password</label>
          <input id="signup-password" name="password" type="password" minLength={8} required />
          <button className="btn" type="submit">Create account</button>
        </form>
        {error === "email" && <p className="err">An account already exists for this email.</p>}
        {error === "invalid" && <p className="err">Enter a valid email and an 8-character password.</p>}
        <p className="admin-help"><Link href="/login">Already have an account? Log in</Link></p>
      </section>
      </div>
    </main>
  );
}
