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
  updateAdminPath,
  updateHomepage,
} from "@/app/actions";

function sign(value: string) {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) return "";
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

async function isAdmin() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("admin_session")?.value;
  if (!cookie) return false;
  const [value, signature] = cookie.split(".");
  if (!value || !signature) return false;
  const expected = sign(value);
  if (!expected || signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export default async function AdminCatchAll({
  params,
  searchParams,
}: {
  params: { path: string[] };
  searchParams: { saved?: string; error?: string; edit?: string };
}) {
  const adminPath = await getAdminPath();
  if (params.path.join("/") !== adminPath) notFound();

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
          {searchParams.error === "invalid" && <p className="err">Invalid password.</p>}
        </section>
      </main>
    );
  }

  const allPosts = await db.select().from(posts).orderBy(asc(posts.position));
  const allPayments = await db.select().from(payments).orderBy(asc(payments.id));
  const [adminSetting] = await db.select().from(settings).where(eq(settings.key, "ADMIN_PATH")).limit(1);
  const [personalSetting] = await db.select().from(settings).where(eq(settings.key, "PERSONAL_MESSAGE")).limit(1);
  const [imageSetting] = await db.select().from(settings).where(eq(settings.key, "PROFILE_IMAGE")).limit(1);
  const editId = Number(searchParams.edit);
  const selected = editId ? allPosts.find((post) => post.id === editId) : undefined;

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <h2>Playbook</h2>
        <Link href={`/${adminPath}`}>Dashboard</Link>
        <Link href="/blog">View site</Link>
        <form action={adminLogout}><button type="submit">Log out</button></form>
      </aside>
      <div className="admin-content">
        <header className="admin-header">
          <h1>Administration</h1>
          {searchParams.saved && <p className="notice">Changes saved.</p>}
        </header>

        <section className="admin-panel">
          <h2>Site settings</h2>
          <form action={updateAdminPath} className="admin-form">
            <label htmlFor="adminPath">ADMIN_PATH</label>
            <input id="adminPath" name="adminPath" defaultValue={adminSetting?.value || adminPath} />
            <button className="btn" type="submit">Change admin URL</button>
          </form>
        </section>

        <section className="admin-panel">
          <h2>Homepage personal message</h2>
          <form action={updateHomepage} className="admin-form">
            <label htmlFor="personalMessage">Message for readers</label>
            <textarea id="personalMessage" name="personalMessage" rows={8} defaultValue={personalSetting?.value || ""} />
            <label htmlFor="profileImage">Profile image URL</label>
            <input id="profileImage" name="profileImage" type="url" placeholder="https://..." defaultValue={imageSetting?.value || ""} />
            <button className="btn" type="submit">Save homepage content</button>
          </form>
        </section>

        <section className="admin-panel">
          <h2>{selected ? "Edit chapter" : "Add chapter"}</h2>
          <form action={savePost} className="admin-form post-form">
            <input type="hidden" name="id" value={selected?.id || 0} />
            <label>Position<input name="position" type="number" min="1" required defaultValue={selected?.position || allPosts.length + 1} /></label>
            <label>Slug<input name="slug" required defaultValue={selected?.slug || ""} /></label>
            <label>Title<input name="title" required defaultValue={selected?.title || ""} /></label>
            <label>Topic<input name="topic" required defaultValue={selected?.topic || ""} /></label>
            <label>Hook<input name="hook" required defaultValue={selected?.hook || ""} /></label>
            <label>Body<textarea name="body" rows={10} required defaultValue={selected?.body || ""} /></label>
            <label className="checkbox"><input name="isFree" type="checkbox" defaultChecked={selected?.isFree ?? false} /> Free chapter</label>
            <button className="btn" type="submit">{selected ? "Save changes" : "Add chapter"}</button>
          </form>
        </section>

        <section className="admin-panel">
          <h2>Chapters</h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Position</th><th>Title</th><th>Access</th><th>Actions</th></tr></thead>
              <tbody>
                {allPosts.map((post) => (
                  <tr key={post.id}>
                    <td>{post.position}</td>
                    <td>{post.title}</td>
                    <td>{post.isFree ? "Free" : "Paid"}</td>
                    <td>
                      <Link href={`/${adminPath}?edit=${post.id}`}>Edit</Link>
                      <form action={deletePost}>
                        <input type="hidden" name="id" value={post.id} />
                        <button type="submit" className="link-button">Delete</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-panel">
          <h2>Payments</h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Email</th><th>Amount</th><th>Status</th><th>Checkout</th></tr></thead>
              <tbody>
                {allPayments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.email || "-"}</td>
                    <td>{payment.currency} {payment.amount}</td>
                    <td>{payment.status}</td>
                    <td>{payment.checkoutId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
