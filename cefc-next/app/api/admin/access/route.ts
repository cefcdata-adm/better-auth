import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { appAccess, oauthApplication, user } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { enforceSameOrigin } from "@/lib/security";
import { parseIdPair } from "@/lib/validation";

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || (session.user as { role?: string }).role !== "admin") return null;
  return session;
}

// GET /api/admin/access?userId=<id> — list all app access rows for a user
export async function GET(request: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required." }, { status: 400 });

  const apps = await db.select().from(oauthApplication).orderBy(oauthApplication.name);
  const granted = await db.select().from(appAccess).where(eq(appAccess.userId, userId));
  const grantedSet = new Set(granted.map((r) => r.clientId));

  const result = apps.map((a) => ({
    clientId: a.clientId,
    name: a.name,
    granted: grantedSet.has(a.clientId),
  }));

  return NextResponse.json({ access: result });
}

// POST /api/admin/access — grant access { userId, clientId }
export async function POST(request: NextRequest) {
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const parsedBody = parseIdPair(body);
  if (!parsedBody.ok) return NextResponse.json({ error: parsedBody.error }, { status: 400 });
  const { userId, clientId } = parsedBody.data;

  const [userRow, appRow] = await Promise.all([
    db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1),
    db.select({ clientId: oauthApplication.clientId }).from(oauthApplication).where(eq(oauthApplication.clientId, clientId)).limit(1),
  ]);
  if (userRow.length === 0) return NextResponse.json({ error: "User not found." }, { status: 404 });
  if (appRow.length === 0) return NextResponse.json({ error: "Application not found." }, { status: 404 });

  await db
    .insert(appAccess)
    .values({ userId, clientId })
    .onConflictDoNothing();

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/access — revoke access { userId, clientId }
export async function DELETE(request: NextRequest) {
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const parsedBody = parseIdPair(body);
  if (!parsedBody.ok) return NextResponse.json({ error: parsedBody.error }, { status: 400 });
  const { userId, clientId } = parsedBody.data;

  await db
    .delete(appAccess)
    .where(and(eq(appAccess.userId, userId), eq(appAccess.clientId, clientId)));

  return NextResponse.json({ ok: true });
}
