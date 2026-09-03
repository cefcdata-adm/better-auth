import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { accessRequests, oauthApplication } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { sendEmail, escapeHtml, renderEmailTemplate } from "@/lib/email";
import { enforceSameOrigin } from "@/lib/security";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originError = enforceSameOrigin(request);
  if (originError) return originError;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || (session.user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const rows = await db.select().from(accessRequests).where(eq(accessRequests.id, id)).limit(1);
  if (rows.length === 0) return NextResponse.json({ error: "Request not found." }, { status: 404 });

  const accessRequest = rows[0];
  if (accessRequest.status !== "pending") {
    return NextResponse.json({ error: "Request is not pending." }, { status: 409 });
  }

  let appName = "Cleverfish";
  if (accessRequest.clientId) {
    const appRows = await db
      .select({ name: oauthApplication.name })
      .from(oauthApplication)
      .where(eq(oauthApplication.clientId, accessRequest.clientId))
      .limit(1);
    appName = appRows[0]?.name ?? "Cleverfish";
  }

  sendEmail({
    to: accessRequest.email,
    subject: `Your ${appName} access request`,
    html: renderEmailTemplate({
      heading: "Access request not approved",
      intro: `Hi ${escapeHtml(accessRequest.name)}, thank you for your interest in <strong>${escapeHtml(appName)}</strong>. Unfortunately, your access request has not been approved at this time. If you believe this is an error, please contact your ministry leader or IT administrator.`,
      ctaText: "Back to sign in",
      ctaUrl: `${process.env.BETTER_AUTH_URL}/sign-in`,
    }),
  }).catch((e) => console.error("[reject] notify failed:", e));

  await db
    .update(accessRequests)
    .set({ status: "rejected", reviewedAt: new Date() })
    .where(eq(accessRequests.id, id));

  return NextResponse.json({ ok: true });
}
