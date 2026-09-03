import { NextRequest, NextResponse } from "next/server";
import rateLimit from "next-rate-limit";
import { db } from "@/lib/db";
import { oauthApplication, pendingAppAccess } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

// 60 requests per IP per minute
const limiter = rateLimit({ interval: 60_000, uniqueTokenPerInterval: 500 });

async function hashSecret(secret: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Buffer.from(hash).toString("base64url");
}

function parseBasicAuth(request: NextRequest): { clientId: string; clientSecret: string } | null {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) return null;
  const decoded = Buffer.from(auth.slice(6), "base64").toString("utf-8");
  const colon = decoded.indexOf(":");
  if (colon === -1) return null;
  return { clientId: decoded.slice(0, colon), clientSecret: decoded.slice(colon + 1) };
}

export async function POST(request: NextRequest) {
  try {
    limiter.checkNext(request, 60);
  } catch {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const creds = parseBasicAuth(request);
  if (!creds) {
    return NextResponse.json({ error: "Missing credentials." }, { status: 401 });
  }

  const [app] = await db
    .select({ clientSecret: oauthApplication.clientSecret, disabled: oauthApplication.disabled })
    .from(oauthApplication)
    .where(eq(oauthApplication.clientId, creds.clientId))
    .limit(1);

  if (!app || app.disabled) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const hashed = await hashSecret(creds.clientSecret);
  if (hashed !== app.clientSecret) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : null;
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required." }, { status: 400 });
  }

  // Check for existing pending entry to avoid duplicates
  const existing = await db
    .select({ id: pendingAppAccess.id })
    .from(pendingAppAccess)
    .where(and(eq(pendingAppAccess.email, email), eq(pendingAppAccess.clientId, creds.clientId)))
    .limit(1);

  if (existing.length === 0) {
    const { randomUUID } = await import("crypto");
    await db.insert(pendingAppAccess).values({
      id: randomUUID(),
      email,
      clientId: creds.clientId,
    });
  }

  return NextResponse.json({ ok: true });
}
