import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { payments, posts } from "@/db/schema";
import { getCurrentUser } from "@/app/actions";
import { renderMarkdown } from "@/lib/markdown";
import { log, logError } from "@/lib/logger";

export const dynamic = "force-dynamic";

export default async function Post({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let post;
  try {
    [post] = await db.select().from(posts).where(eq(posts.slug, slug)).limit(1);
  } catch (error) {
    logError("chapter_load.database_failed", error, { slug });
    throw error;
  }
  if (!post) {
    log("warn", "chapter_load.not_found", { slug });
    notFound();
  }

  let prev;
  let next;
  try {
    [prev] = await db.select().from(posts).where(eq(posts.position, post.position - 1));
    [next] = await db.select().from(posts).where(eq(posts.position, post.position + 1));
  } catch (error) {
    logError("chapter_navigation.database_failed", error, { slug, postId: post.id });
  }
  let hasAccess = false;
  let user;
  try {
    user = await getCurrentUser();
  } catch (error) {
    logError("chapter_access.user_lookup_failed", error, { slug });
  }
  if (user) {
    try {
      const [payment] = await db.select({ id: payments.id })
        .from(payments)
        .where(and(
          eq(payments.userId, user.id),
          inArray(payments.status, ["succeeded", "completed"]),
        ))
        .limit(1);
      hasAccess = Boolean(payment);
    } catch (error) {
      logError("chapter_access.database_lookup_failed", error, {
        slug,
        userId: user.id,
        email: user.email,
      });
    }
  }
  const isFree = post.position <= 3;
  if (!isFree && !hasAccess) redirect("/pricing");
  const nextHref = post.position === 3 ? "/pricing" : next ? `/blog/${next.slug}` : null;

  return (
    <main className="wrap block article">
      <nav className="page-nav"><Link href="/blog" className="back">All chapters</Link></nav>
      <p className="kicker">Chapter {post.position}</p>
      <h1 className="h-sm">{post.title}</h1>
      <div className="markdown-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(post.body) }} />

      {!isFree && !hasAccess && (
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
