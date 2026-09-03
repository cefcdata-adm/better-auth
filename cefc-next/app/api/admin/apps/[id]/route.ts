import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { oauthApplication } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { enforceSameOrigin } from "@/lib/security";
import { parseOAuthAppInput, parseOAuthMetadata } from "@/lib/validation";

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || (session.user as { role?: string }).role !== "admin") return null;
  return session;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();

  const rows = await db.select().from(oauthApplication).where(eq(oauthApplication.clientId, id)).limit(1);
  if (rows.length === 0) return NextResponse.json({ error: "App not found." }, { status: 404 });

  const existing = parseOAuthMetadata(rows[0].metadata);
  const storedRedirectUris = rows[0].redirectUrls.split(",").map((uri) => uri.trim()).filter(Boolean);
  const existingRedirectUris = storedRedirectUris.filter(
    (uri) => !existing.postLogoutRedirectUris.includes(uri),
  );
  const parsedBody = parseOAuthAppInput({
    name: body.name ?? rows[0].name,
    subdomain: body.subdomain ?? existing.subdomain,
    redirectUris: body.redirectUris ?? existingRedirectUris,
    postLogoutRedirectUris: body.postLogoutRedirectUris ?? existing.postLogoutRedirectUris,
    sessionTimeout: body.sessionTimeout ?? existing.sessionTimeout,
  });
  if (!parsedBody.ok) {
    return NextResponse.json({ error: parsedBody.error }, { status: 400 });
  }
  const { name, subdomain, redirectUris, postLogoutRedirectUris, sessionTimeout } = parsedBody.data;
  const registeredRedirectUris = Array.from(new Set([
    ...redirectUris,
    ...postLogoutRedirectUris,
  ]));
  const metadata = JSON.stringify({ subdomain, sessionTimeout, postLogoutRedirectUris });

  await db
    .update(oauthApplication)
    .set({
      name,
      redirectUrls: registeredRedirectUris.join(","),
      metadata,
    })
    .where(eq(oauthApplication.clientId, id));

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const rows = await db.select({ id: oauthApplication.id }).from(oauthApplication).where(eq(oauthApplication.clientId, id)).limit(1);
  if (rows.length === 0) return NextResponse.json({ error: "App not found." }, { status: 404 });

  await db.delete(oauthApplication).where(eq(oauthApplication.clientId, id));

  return NextResponse.json({ ok: true });
}
