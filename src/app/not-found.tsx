import Link from "next/link";

export default function NotFound() {
  return (
    <main className="wrap block article">
      <p className="kicker">404</p>
      <h1 className="h-sm">Page not found</h1>
      <p>The page you requested does not exist.</p>
      <Link className="back" href="/">Return home</Link>
    </main>
  );
}
