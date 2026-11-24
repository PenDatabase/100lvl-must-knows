"use server";
import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { posts, settings, users } from "@/db/schema";
import { log, logError } from "@/lib/logger";

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, encoded: string) {
  const [salt, hash] = encoded.split(":");
  if (!salt || !hash) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function userSessionSecret() {
  return process.env.PAYMENT_ACCESS_SECRET || process.env.BACHS_WEBHOOK_SECRET || process.env.ADMIN_PASSWORD;
}

async function setUserSession(userId: number) {
  const secret = userSessionSecret();
  if (!secret) throw new Error("PAYMENT_ACCESS_SECRET is not configured");
  const value = String(userId);
  const signature = crypto.createHmac("sha256", secret).update(value).digest("hex");
  const cookieStore = await cookies();
  cookieStore.set("playbook_user", `${value}.${signature}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function getCurrentUser() {
  const secret = userSessionSecret();
  if (!secret) return null;
  const cookie = (await cookies()).get("playbook_user")?.value;
  if (!cookie) return null;
  const [value, signature] = cookie.split(".");
  if (!value || !signature) return null;
  const expected = crypto.createHmac("sha256", secret).update(value).digest("hex");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const [user] = await db.select().from(users).where(eq(users.id, Number(value))).limit(1);
  return user || null;
}

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) redirect("/signup?error=invalid");
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) redirect("/signup?error=email");
  const [user] = await db.insert(users).values({ email, passwordHash: hashPassword(password) }).returning();
  await setUserSession(user.id);
  redirect("/pricing");
}

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !verifyPassword(password, user.passwordHash)) redirect("/login?error=invalid");
  await setUserSession(user.id);
  redirect("/blog");
}

export async function logout() {
  (await cookies()).delete("playbook_user");
  redirect("/");
}

export async function getAdminPath() {
  const configuredPath = (process.env.ADMIN_PATH || "/admin")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\s+/g, "-");
  return configuredPath || "admin";
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
  const title = String(formData.get("title") ?? "").trim();
  const position = Number(formData.get("position"));
  if (!Number.isInteger(position) || position < 1) {
    throw new Error("Chapter position must be a positive integer.");
  }
  const baseSlug = title.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "chapter";
  let slug = baseSlug;
  let suffix = 2;
  while (true) {
    const matches = await db.select({ id: posts.id }).from(posts).where(eq(posts.slug, slug)).limit(1);
    if (!matches[0] || matches[0].id === id) break;
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
  const values = {
    slug,
    position,
    title,
    body: String(formData.get("body") ?? "").trim(),
  };
  const currentPosts = await db.select({ id: posts.id, position: posts.position }).from(posts);

  if (id) {
    const currentPost = currentPosts.find((post) => post.id === id);
    if (!currentPost) throw new Error(`Chapter ${id} no longer exists.`);
    if (currentPost.position === position) {
      await db.update(posts).set(values).where(eq(posts.id, id));
    } else {
      const movingForward = currentPost.position < position;
      const postsToShift = currentPosts
        .filter((post) => post.id !== id && (
          movingForward
            ? post.position > currentPost.position && post.position <= position
            : post.position >= position && post.position < currentPost.position
        ))
        .sort((a, b) => movingForward
          ? a.position - b.position
          : b.position - a.position);
      const temporaryPosition = Math.min(0, ...currentPosts.map((post) => post.position)) - 1;
      await db.batch([
        db.update(posts).set({ position: temporaryPosition }).where(eq(posts.id, id)),
        ...postsToShift.map((post) => db.update(posts).set({
          position: post.position + (movingForward ? -1 : 1),
        }).where(eq(posts.id, post.id))),
        db.update(posts).set(values).where(eq(posts.id, id)),
      ] as const);
    }
  } else {
    const postsToShift = currentPosts
      .filter((post) => post.position >= position)
      .sort((a, b) => b.position - a.position);
    const insertStatement = db.insert(posts).values(values);
    if (postsToShift.length === 0) {
      await insertStatement;
    } else {
      const [first, ...remaining] = postsToShift.map((post) => db.update(posts).set({
        position: post.position + 1,
      }).where(eq(posts.id, post.id)));
      if (!first) throw new Error("Failed to prepare chapter position updates.");
      await db.batch([first, ...remaining, insertStatement]);
    }
  }
  redirect(`/${await getAdminPath()}/chapters?saved=1`);
}

export async function deletePost(formData: FormData) {
  const id = Number(formData.get("id"));
  if (id) await db.delete(posts).where(eq(posts.id, id));
  redirect(`/${await getAdminPath()}/chapters?saved=1`);
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
  if (!/\S+@\S+\.\S+/.test(email)) {
    log("warn", "checkout.invalid_email");
    redirect("/pricing?error=email");
  }

  const apiKey = process.env.BACHS_API_KEY;
  if (!apiKey) {
    log("error", "checkout.not_configured");
    redirect("/pricing?error=payment-not-configured");
  }
  let user;
  try {
    user = await getCurrentUser();
  } catch (error) {
    logError("checkout.user_lookup_failed", error, { email });
  }
  if (!user) redirect("/signup?next=/pricing");
  const baseUrl = apiKey.startsWith("sk_sandbox_") ? "https://sandbox-api.bachs.io" : "https://api.bachs.io";
  const requestHeaders = await headers();
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  const origin = configuredOrigin ||
    `${requestHeaders.get("x-forwarded-proto") || "https"}://${requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000"}`;
  const checkoutEmail = user?.email || email;
  const reference = `PLAYBOOK_ACCESS_${crypto.randomUUID()}`;
  log("info", "checkout.request_started", {
    userId: user.id,
    email: user.email,
    reference,
    providerEnvironment: apiKey.startsWith("sk_sandbox_") ? "sandbox" : apiKey.startsWith("sk_live_") ? "live" : "unknown",
  });
  let response: Response;
  let rawResponse = "";
  try {
    response = await fetch(`${baseUrl}/v1/checkout-sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Idempotency-Key": reference,
      },
      body: JSON.stringify({
        pricing: { currency: "NGN", amount: "2000.00" },
        customer: { email: checkoutEmail },
        payment_method_types: ["NGN_CARD", "NGN_BANK_TRANSFER"],
        success_url: `${origin}/payment/complete`,
        cancel_url: `${origin}/pricing`,
        reference,
        metadata: { product: "100 Level Playbook", access: "full", user_id: String(user.id) },
      }),
      cache: "no-store",
    });
    rawResponse = await response.text();
  } catch (error) {
    logError("checkout.provider_request_failed", error, {
      userId: user.id,
      email: user.email,
      reference,
    });
    redirect("/pricing?error=checkout");
  }
  let data: { checkout_url?: string; checkoutUrl?: string; error?: { message?: string }; message?: string } = {};
  try { data = JSON.parse(rawResponse); } catch {}
  if (!response.ok) {
    log("error", "checkout.provider_creation_failed", {
      userId: user.id,
      email: user.email,
      reference,
      status: response.status,
      message: data.error?.message || data.message || rawResponse,
    });
  }
  const checkoutUrl = data.checkout_url || data.checkoutUrl;
  if (!response.ok || !checkoutUrl) {
    log("warn", "checkout.creation_missing_redirect", {
      userId: user.id,
      reference,
      status: response.ok ? "missing-url" : "provider-error",
    });
    redirect("/pricing?error=checkout");
  }
  log("info", "checkout.redirecting_to_provider", {
    userId: user.id,
    email: user.email,
    reference,
  });
  redirect(checkoutUrl);
}
