import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { payments, posts } from "@/db/schema";
import { BRAND } from "@/site";
import { getCurrentUser } from "@/app/actions";
import SiteNavbar from "@/components/SiteNavbar";

export const dynamic = "force-dynamic";

export default async function Blog({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const all = await db.select().from(posts).orderBy(asc(posts.position));
  const user = await getCurrentUser();
  let hasAccess = false;
  if (user) {
    const [payment] = await db.select({ id: payments.id })
      .from(payments)
      .where(and(
        eq(payments.userId, user.id),
        inArray(payments.status, ["succeeded", "completed"]),
      ))
      .limit(1);
    hasAccess = Boolean(payment);
  }
  return (
    <main className="wrap block">
      <SiteNavbar />
      <nav className="page-nav"><Link href="/" className="back">{BRAND}</Link></nav>
      {resolvedSearchParams.welcome && <p className="notice">You’re in. Start at chapter 1.</p>}
      <h1 className="h-sm">All chapters</h1>
      <ol className="chapters">
        {all.map((p) => (
          <li key={p.id} className={p.position <= 3 || hasAccess ? "" : "locked"}>
            <Link href={p.position <= 3 || hasAccess ? `/blog/${p.slug}` : "/pricing"}>
              <span className="num">{p.position}</span>
              <span><b>{p.title}</b></span>
              <span className="tag">{p.position <= 3 ? "Free" : hasAccess ? "Unlocked" : "Locked"}</span>
            </Link>
          </li>
        ))}
      </ol>
    </main>
  );
}
