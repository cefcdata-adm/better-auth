import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { appAccess, user } from "@/lib/schema";
import { eq } from "drizzle-orm";

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || (session.user as { role?: string }).role !== "admin") return null;
  return session;
}

// GET /api/admin/apps/[id]/users — all users who have access to this app (id = clientId)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: clientId } = await params;

  const rows = await db
    .select({
      userId: appAccess.userId,
      grantedAt: appAccess.grantedAt,
      name: user.name,
      email: user.email,
    })
    .from(appAccess)
    .innerJoin(user, eq(appAccess.userId, user.id))
    .where(eq(appAccess.clientId, clientId))
    .orderBy(user.name);

  return NextResponse.json({ users: rows });
}
