import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { db } from "@/db";
import { posts } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function Post({ params }: { params: { slug: string } }) {
  const [post] = await db.select().from(posts).where(eq(posts.slug, params.slug)).limit(1);
  if (!post) notFound();

  const [prev] = await db.select().from(posts).where(eq(posts.position, post.position - 1));
  const [next] = await db.select().from(posts).where(eq(posts.position, post.position + 1));
  const paragraphs = post.body.split("\n\n");
  const accessCookie = (await cookies()).get("playbook_access")?.value;
  let hasAccess = false;
  if (accessCookie) {
    const [value, signature] = accessCookie.split(".");
    const secret = process.env.PAYMENT_ACCESS_SECRET || process.env.BACHS_WEBHOOK_SECRET || process.env.BACHS_API_KEY;
    if (value && signature && secret) {
      const expected = crypto.createHmac("sha256", secret).update(value).digest("hex");
      hasAccess = signature.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    }
  }
  if (!post.isFree && !hasAccess) redirect("/pricing");
  const shown = post.isFree || hasAccess ? paragraphs : [];
  const nextHref = post.position === 3 ? "/pricing" : next ? `/blog/${next.slug}` : null;

  return (
    <main className="wrap block article">
      <nav className="page-nav"><Link href="/blog" className="back">All chapters</Link></nav>
      <p className="kicker">Chapter {post.position}: {post.topic}</p>
      <h1 className="h-sm">{post.title}</h1>
      {shown.map((p, i) => <p key={i}>{p}</p>)}

      {!post.isFree && (
        <div className="gate">
          <h2>This chapter is locked</h2>
          <p>Chapters 1 to 3 are free. Chapter {post.position} is part of the paid series.</p>
          <Link className="btn" href="/pricing">Unlock the paid series</Link>
        </div>
      )}

      <nav className="pager">
        {prev ? <Link className="pager-button pager-previous" href={`/blog/${prev.slug}`}>← Previous</Link> : <span className="pager-placeholder" />}
        {nextHref && (
          <Link className="pager-button pager-next" href={nextHref}>
            {post.position === 3 ? "Continue to the paid series →" : "Next →"}
          </Link>
        )}
      </nav>
    </main>
  );
}
