import crypto from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { payments, posts, settings } from "@/db/schema";
import {
  adminLogin,
  adminLogout,
  deletePost,
  getAdminPath,
  savePost,
  updateHomepage,
} from "@/app/actions";

function sign(value: string) {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) return "";
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

async function isAdmin() {
  const cookie = (await cookies()).get("admin_session")?.value;
  if (!cookie) return false;
  const [value, signature] = cookie.split(".");
  const expected = value ? sign(value) : "";
  return Boolean(value && signature && expected && signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)));
}

function AdminLayout({ adminPath, children }: { adminPath: string; children: React.ReactNode }) {
  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <h2>Playbook</h2>
        <Link href={`/${adminPath}`}>Dashboard</Link>
        <Link href={`/${adminPath}/chapters`}>Chapters</Link>
        <Link href={`/${adminPath}/payments`}>Payments</Link>
        <Link href="/blog">View site</Link>
        <form action={adminLogout}><button type="submit">Log out</button></form>
      </aside>
      <div className="admin-content">{children}</div>
    </main>
  );
}

function Header({ title, saved }: { title: string; saved?: string }) {
  return <header className="admin-header"><h1>{title}</h1>{saved && <p className="notice">Changes saved.</p>}</header>;
}

function ChapterForm({ post, nextPosition }: { post?: typeof posts.$inferSelect; nextPosition: number }) {
  return (
    <section className="admin-panel">
      <form action={savePost} className="admin-form post-form">
        <input type="hidden" name="id" value={post?.id || 0} />
        <label>Position<input name="position" type="number" min="1" required defaultValue={post?.position || nextPosition} /></label>
        <label>Title<input name="title" required defaultValue={post?.title || ""} /></label>
        <label>Content (Markdown)<textarea name="body" rows={18} required defaultValue={post?.body || ""} /></label>
        <p className="admin-help">Chapters 1 to 3 are free automatically. The URL slug is generated from the title.</p>
        <button className="btn" type="submit">{post ? "Save changes" : "Create chapter"}</button>
      </form>
    </section>
  );
}

export default async function AdminCatchAll({
  params,
  searchParams,
}: {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const adminPath = await getAdminPath();
  if (resolvedParams.path.join("/") !== adminPath && !resolvedParams.path.join("/").startsWith(`${adminPath}/`)) notFound();

  if (!(await isAdmin())) {
    return (
      <main className="admin-login">
        <section className="admin-card">
          <p className="kicker">Administration</p>
          <h1>Sign in</h1>
          <form action={adminLogin} className="admin-form">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required />
            <button className="btn" type="submit">Sign in</button>
          </form>
          {resolvedSearchParams.error === "invalid" && <p className="err">Invalid password.</p>}
        </section>
      </main>
    );
  }

  const path = resolvedParams.path.slice(adminPath.split("/").length).join("/");
  const allPosts = await db.select().from(posts).orderBy(asc(posts.position));

  if (path === "chapters" || path === "chapters/") {
    return <AdminLayout adminPath={adminPath}>
      <Header title="Chapters" saved={resolvedSearchParams.saved} />
      <div className="admin-actions"><Link className="btn" href={`/${adminPath}/chapters/new`}>Create chapter</Link></div>
      <section className="admin-panel">
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>Position</th><th>Title</th><th>Access</th><th>Actions</th></tr></thead>
          <tbody>{allPosts.map((post) => <tr key={post.id}>
            <td>{post.position}</td><td>{post.title}</td><td>{post.position <= 3 ? "Free" : "Paid"}</td>
            <td><Link href={`/${adminPath}/chapters/${post.id}`}>Edit</Link><form action={deletePost}>
              <input type="hidden" name="id" value={post.id} /><button type="submit" className="link-button">Delete</button>
            </form></td>
          </tr>)}</tbody>
        </table></div>
      </section>
    </AdminLayout>;
  }

  if (path === "chapters/new") {
    return <AdminLayout adminPath={adminPath}><Header title="New chapter" /><ChapterForm nextPosition={allPosts.length + 1} /></AdminLayout>;
  }

  const editMatch = path.match(/^chapters\/(\d+)$/);
  if (editMatch) {
    const post = allPosts.find((item) => item.id === Number(editMatch[1]));
    if (!post) notFound();
    return <AdminLayout adminPath={adminPath}><Header title="Edit chapter" saved={resolvedSearchParams.saved} /><ChapterForm post={post} nextPosition={post.position} /></AdminLayout>;
  }

  if (path === "payments" || path === "payments/") {
    const allPayments = await db.select().from(payments).orderBy(asc(payments.id));
    return <AdminLayout adminPath={adminPath}>
      <Header title="Payments" />
      <section className="admin-panel"><p className="admin-help">Payments are read-only.</p>
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>Email</th><th>Amount</th><th>Status</th><th>Checkout</th></tr></thead>
          <tbody>{allPayments.map((payment) => <tr key={payment.id}>
            <td>{payment.email || "-"}</td><td>{payment.currency} {payment.amount}</td><td>{payment.status}</td><td>{payment.checkoutId}</td>
          </tr>)}</tbody>
        </table></div>
      </section>
    </AdminLayout>;
  }

  if (path !== "") notFound();
  const [personalSetting] = await db.select().from(settings).where(eq(settings.key, "PERSONAL_MESSAGE")).limit(1);
  const [imageSetting] = await db.select().from(settings).where(eq(settings.key, "PROFILE_IMAGE")).limit(1);
  return <AdminLayout adminPath={adminPath}>
    <Header title="Dashboard" saved={resolvedSearchParams.saved} />
    <section className="admin-panel"><h2>Homepage personal message</h2>
      <form action={updateHomepage} className="admin-form">
        <label htmlFor="personalMessage">Message for readers</label><textarea id="personalMessage" name="personalMessage" rows={8} defaultValue={personalSetting?.value || ""} />
        <label htmlFor="profileImage">Profile image URL</label><input id="profileImage" name="profileImage" type="url" defaultValue={imageSetting?.value || ""} />
        <button className="btn" type="submit">Save homepage content</button>
      </form>
    </section>
  </AdminLayout>;
}
