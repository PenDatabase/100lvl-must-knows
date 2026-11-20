import Link from "next/link";
import { asc, lte } from "drizzle-orm";
import { db } from "@/db";
import { posts, settings } from "@/db/schema";
import { BRAND, NAME } from "@/site";
import { getCurrentUser, logout } from "@/app/actions";
export const revalidate = 60;

const proof = [
  ["First Class", "and holding it"],
  ["Scholarship", "earned, not given"],
  ["President", "CS & MIS Students' Association"],
  ["Millions", "made by software I built"],
];

export default async function Home() {
  const [free, user] = await Promise.all([
    db.select().from(posts).where(lte(posts.position, 3)).orderBy(asc(posts.position)),
    getCurrentUser(),
  ]);
  const siteSettings = await db.select().from(settings);
  const setting = (key: string) => siteSettings.find((item) => item.key === key)?.value;
  const personalMessage = setting("PERSONAL_MESSAGE") ||
    "Dear 100 level student,\n\nYour first year is still in your hands. Do not waste it copying everyone else's timetable, chasing certificates, or discovering in 400 level that results do not happen by accident.";
  const profileImage = setting("PROFILE_IMAGE") || "/profile.webp";

  return (
    <main>
      <section className="hero">
        <header className="nav wrap">
          <Link className="brand" href="/">{BRAND}</Link>
          <nav className="nav-actions" aria-label="Account navigation">
            {user ? (
              <>
                <Link className="nav-link nav-link-accent" href="/pricing">Unlock full playbook</Link>
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
        <div className="hero-grid wrap">
          <div className="hero-copy">
            <h1>Win 100 level.<br /><span>For real.</span></h1>
            <p className="hero-lede">
              Stop waiting for your university to teach you how to succeed. Build the habits, relationships,
              grades and skills that turn a first year into a serious advantage.
            </p>
            <Link className="btn btn-accent" href={free[0] ? `/blog/${free[0].slug}` : "/blog"}>Start Reading</Link>
          </div>
          <div className="portrait">
            {profileImage ? <img src={profileImage} alt={NAME} width={600} height={648} decoding="async" fetchPriority="high" /> : <div className="portrait-placeholder"><span>Add your photo</span></div>}
            <p>Written by {NAME}</p>
          </div>
        </div>
      </section>

      <section className="proof" aria-label="Results">
        <div className="wrap proof-grid">
          {proof.map(([big, small]) => <div key={big}><strong>{big}</strong><span>{small}</span></div>)}
        </div>
      </section>

      <section className="personal-letter">
        <div className="wrap letter-grid">
          <div className="letter-copy">{personalMessage.split("\n\n").map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
        </div>
      </section>

      <section className="playbook">
        <div className="wrap">
          <p className="section-kicker">The playbook</p>
          <h2>Do these things first.</h2>
          <div className="action-grid">
            <article><span>01</span><h3>Own your grades</h3><p>Understand the system, build a weekly study plan and start every assessment prepared—not panicked.</p></article>
            <article><span>02</span><h3>Build useful skills</h3><p>Do not collect certificates. Learn a skill, use it on real problems and leave 100 level with visible work.</p></article>
            <article><span>03</span><h3>Become known</h3><p>Choose people carefully, contribute before you request attention and build relationships that outlast the semester.</p></article>
          </div>
        </div>
      </section>

      <section className="chapters-section" id="chapters">
        <div className="wrap">
          <p className="section-kicker">Read in order</p>
          <h2>The first 3 chapters are free.</h2>
          <ol className="chapters">
            {free.map((p) => <li key={p.id}><Link href={`/blog/${p.slug}`}><span className="num">{p.position}</span><span><b>{p.title}</b></span><span className="tag">Free</span></Link></li>)}
          </ol>
          <Link className="btn btn-accent" href="/blog">View all chapters</Link>
        </div>
      </section>

      <section className="proof-story">
        <div className="wrap story-grid">
          <div><p className="section-kicker">Why listen</p><h2>Experience beats theory.</h2></div>
          <p>I held a first class, earned a scholarship, led the CS & MIS Students' Association and built software that made millions. More importantly, I learned the repeatable actions behind those results. This is the practical side of what worked.</p>
        </div>
      </section>

      <footer><div className="wrap">{BRAND} by {NAME} · <Link href="/blog">All chapters</Link></div></footer>
    </main>
  );
}
