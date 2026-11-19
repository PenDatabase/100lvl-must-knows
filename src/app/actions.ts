"use server";
import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { posts, settings } from "@/db/schema";

export async function getAdminPath() {
  const [setting] = await db.select().from(settings).where(eq(settings.key, "ADMIN_PATH")).limit(1);
  return (setting?.value || "admin").replace(/^\/+|\/+$/g, "");
}

function sign(value: string) {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) throw new Error("ADMIN_PASSWORD is not configured");
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export async function adminLogin(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret || password !== secret) redirect(`/${await getAdminPath()}?error=invalid`);
  const value = crypto.randomBytes(24).toString("hex");
  (await cookies()).set("admin_session", `${value}.${sign(value)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  redirect(`/${await getAdminPath()}`);
}

export async function adminLogout() {
  (await cookies()).delete("admin_session");
  redirect(`/${await getAdminPath()}`);
}

export async function savePost(formData: FormData) {
  const id = Number(formData.get("id"));
  const values = {
    slug: String(formData.get("slug") ?? "").trim(),
    position: Number(formData.get("position")),
    title: String(formData.get("title") ?? "").trim(),
    topic: String(formData.get("topic") ?? "").trim(),
    hook: String(formData.get("hook") ?? "").trim(),
    body: String(formData.get("body") ?? "").trim(),
    isFree: formData.get("isFree") === "on",
  };
  if (id) await db.update(posts).set(values).where(eq(posts.id, id));
  else await db.insert(posts).values(values);
  redirect(`/${await getAdminPath()}?saved=1`);
}

export async function deletePost(formData: FormData) {
  const id = Number(formData.get("id"));
  if (id) await db.delete(posts).where(eq(posts.id, id));
  redirect(`/${await getAdminPath()}?saved=1`);
}

export async function updateAdminPath(formData: FormData) {
  const path = String(formData.get("adminPath") ?? "").trim().replace(/^\/+|\/+$/g, "").replace(/\s+/g, "-");
  if (!path) redirect(`/${await getAdminPath()}?error=invalid`);
  await db.update(settings).set({ value: path }).where(eq(settings.key, "ADMIN_PATH"));
  if (!await db.select().from(settings).where(eq(settings.key, "ADMIN_PATH")).limit(1).then((rows) => rows[0])) {
    await db.insert(settings).values({ key: "ADMIN_PATH", value: path });
  }
  redirect(`/${path}?saved=1`);
}

export async function updateHomepage(formData: FormData) {
  const entries = [
    ["PERSONAL_MESSAGE", String(formData.get("personalMessage") ?? "").trim()],
    ["PROFILE_IMAGE", String(formData.get("profileImage") ?? "").trim()],
  ];
  for (const [key, value] of entries) {
    await db.insert(settings).values({ key, value }).onConflictDoUpdate({
      target: settings.key,
      set: { value },
    });
  }
  redirect(`/${await getAdminPath()}?saved=1`);
}

export async function startCheckout(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!/\S+@\S+\.\S+/.test(email)) redirect("/pricing?error=email");

  const apiKey = process.env.BACHS_API_KEY;
  if (!apiKey) redirect("/pricing?error=payment-not-configured");
  const baseUrl = apiKey.startsWith("sk_sandbox_") ? "https://sandbox-api.bachs.io" : "https://api.bachs.io";
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "http://localhost:3000";
  const response = await fetch(`${baseUrl}/v1/checkout-sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      pricing: { currency: "NGN", amount: "2000.00" },
      customer: { email },
      payment_method_types: ["NGN_CARD", "NGN_BANK_TRANSFER"],
      success_url: `${origin}/payment/complete`,
      cancel_url: `${origin}/pricing`,
      reference: "PLAYBOOK_ACCESS",
      metadata: { product: "100 Level Playbook", access: "full" },
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.checkout_url) redirect("/pricing?error=checkout");
  redirect(data.checkout_url);
}
