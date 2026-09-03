import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { accessRequests, appAccess, oauthApplication, user } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { sendEmail, escapeHtml, renderEmailTemplate } from "@/lib/email";
import { enforceSameOrigin } from "@/lib/security";
import { parseOAuthMetadata } from "@/lib/validation";

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

  // Look up app name if this request is app-specific
  let appName = "Cleverfish";
  let appUrl: string | null = null;
  if (accessRequest.clientId) {
    const appRows = await db
      .select({ name: oauthApplication.name, clientId: oauthApplication.clientId, metadata: oauthApplication.metadata })
      .from(oauthApplication)
      .where(eq(oauthApplication.clientId, accessRequest.clientId))
      .limit(1);
    if (appRows.length === 0) {
      return NextResponse.json({ error: "Requested application no longer exists." }, { status: 409 });
    }
    appName = appRows[0]?.name ?? "Cleverfish";
    appUrl = parseOAuthMetadata(appRows[0]?.metadata).postLogoutRedirectUris[0] ?? null;
  }

  // Check if user already exists before attempting creation
  const existingRows = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, accessRequest.email))
    .limit(1);

  let userId: string | null = existingRows[0]?.id ?? null;
  const isNewUser = !userId;

  if (isNewUser) {
    try {
      const created = await auth.api.createUser({
        body: {
          name: accessRequest.name,
          email: accessRequest.email,
          password: randomUUID(),
          role: "user",
        },
      });
      userId = (created as { user?: { id: string } })?.user?.id ?? null;
    } catch (e: unknown) {
      console.error("[approve] createUser failed:", e);
      return NextResponse.json({ error: "Failed to create user account." }, { status: 500 });
    }
  }

  // Grant app access if this request is app-specific
  if (accessRequest.clientId && userId) {
    await db
      .insert(appAccess)
      .values({ userId, clientId: accessRequest.clientId })
      .onConflictDoNothing();
  }

  await db
    .update(accessRequests)
    .set({ status: "approved", reviewedAt: new Date() })
    .where(eq(accessRequests.id, id));

  const appLinkUrl = appUrl ?? `${process.env.BETTER_AUTH_URL}/sign-in`;
  let emailFailed = false;

  if (isNewUser) {
    // New account: send set-password email so they can activate their account.
    const emailResult = await Promise.allSettled([auth.api.requestPasswordReset({
      body: {
        email: accessRequest.email,
        redirectTo: `${process.env.BETTER_AUTH_URL}/reset-password`,
      },
    })]);
    const result = emailResult[0];
    emailFailed = result?.status === "rejected";
    if (result?.status === "rejected") {
      console.error(`[approve] password reset email failed for ${accessRequest.email}:`, result.reason);
    } else {
      console.info(`[approve] password reset email sent to ${accessRequest.email}`);
    }
  } else {
    // Existing account: notify them that access to this app has been granted.
    const emailResult = await Promise.allSettled([sendEmail({
      to: accessRequest.email,
      subject: `Your access to ${appName} has been approved`,
      html: renderEmailTemplate({
        heading: "Access approved",
        intro: `Hi ${escapeHtml(accessRequest.name)}, your request for access to <strong>${escapeHtml(appName)}</strong> has been approved. You can sign in now using your existing Cleverfish account.`,
        ctaText: `Go to ${escapeHtml(appName)}`,
        ctaUrl: appLinkUrl,
      }),
    })]);
    const result = emailResult[0];
    emailFailed = result?.status === "rejected";
    if (result?.status === "rejected") {
      console.error(`[approve] email notification failed for ${accessRequest.email}:`, result.reason);
    } else {
      console.info(`[approve] email notification sent to ${accessRequest.email}`);
    }
  }

  return NextResponse.json({ ok: true, emailNotificationsFailed: emailFailed ? 1 : 0 });
}
