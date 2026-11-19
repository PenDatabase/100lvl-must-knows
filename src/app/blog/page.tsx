import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { BRAND } from "@/site";

export const dynamic = "force-dynamic";

export default async function Blog({ searchParams }: { searchParams: { welcome?: string } }) {
  const all = await db.select().from(posts).orderBy(asc(posts.position));
  return (
    <main className="wrap block">
      <nav className="page-nav"><Link href="/" className="back">{BRAND}</Link></nav>
      {searchParams.welcome && <p className="notice">You’re in. Start at chapter 1.</p>}
      <h1 className="h-sm">All chapters</h1>
      <ol className="chapters">
        {all.map((p) => (
          <li key={p.id} className={p.position <= 3 ? "" : "locked"}>
            <Link href={p.position <= 3 ? `/blog/${p.slug}` : "/pricing"}>
              <span className="num">{p.position}</span>
              <span><b>{p.title}</b></span>
              <span className="tag">{p.position <= 3 ? "Free" : "Locked"}</span>
            </Link>
          </li>
        ))}
      </ol>
    </main>
  );
}
