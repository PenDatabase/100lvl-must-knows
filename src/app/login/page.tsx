import Link from "next/link";
import { login } from "@/app/actions";
import SiteNavbar from "@/components/SiteNavbar";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="auth-page">
      <SiteNavbar />
      <div className="admin-login">
      <section className="admin-card">
        <p className="kicker">Playbook account</p>
        <h1>Log in</h1>
        <form action={login} className="admin-form">
          <label htmlFor="login-email">Email</label>
          <input id="login-email" name="email" type="email" required />
          <label htmlFor="login-password">Password</label>
          <input id="login-password" name="password" type="password" required />
          <button className="btn" type="submit">Log in</button>
        </form>
        {error === "invalid" && <p className="err">Invalid email or password.</p>}
        <p className="admin-help"><Link href="/signup">Create an account</Link></p>
      </section>
      </div>
    </main>
  );
}
