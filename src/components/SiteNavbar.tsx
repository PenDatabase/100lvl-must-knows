import Link from "next/link";
import { getCurrentUser, logout } from "@/app/actions";
import { BRAND } from "@/site";

export default async function SiteNavbar() {
  const user = await getCurrentUser();

  return (
    <header className="nav wrap site-navbar">
      <Link className="brand" href="/">{BRAND}</Link>
      <nav className="nav-actions" aria-label="Main navigation">
        <Link className="nav-link" href="/blog">Chapters</Link>
        {user ? (
          <>
            <Link className="nav-link nav-link-accent" href="/pricing">Unlock</Link>
            <form action={logout}>
              <button className="nav-link nav-link-button" type="submit">Log out</button>
            </form>
          </>
        ) : (
          <>
            <Link className="nav-link nav-link-secondary" href="/login">Log in</Link>
            <Link className="nav-link nav-link-accent" href="/signup">Sign up</Link>
          </>
        )}
      </nav>
    </header>
  );
}
