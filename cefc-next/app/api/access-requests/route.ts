import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { randomUUID } from "crypto";
import rateLimit from "next-rate-limit";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user, accessRequests, oauthApplication } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { sendEmail, escapeHtml, renderEmailTemplate } from "@/lib/email";
import { parseAccessRequestInput } from "@/lib/validation";

// 10 requests per IP per minute
const limiter = rateLimit({ interval: 60_000, uniqueTokenPerInterval: 500 });

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || (session.user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db
    .select({
      id: accessRequests.id,
      name: accessRequests.name,
      email: accessRequests.email,
      status: accessRequests.status,
      clientId: accessRequests.clientId,
      createdAt: accessRequests.createdAt,
      reviewedAt: accessRequests.reviewedAt,
      appName: oauthApplication.name,
    })
    .from(accessRequests)
    .leftJoin(oauthApplication, eq(accessRequests.clientId, oauthApplication.clientId))
    .orderBy(accessRequests.createdAt);

  return NextResponse.json({ requests: rows });
}

export async function POST(request: NextRequest) {
  try {
    limiter.checkNext(request, 10);
  } catch {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const body = await request.json();
  const parsedBody = parseAccessRequestInput(body);
  if (!parsedBody.ok) {
    return NextResponse.json({ error: parsedBody.error }, { status: 400 });
  }

  const { name, email, clientId } = parsedBody.data;
  const duplicateCondition = clientId
    ? and(eq(accessRequests.email, email), eq(accessRequests.status, "pending"), eq(accessRequests.clientId, clientId))
    : and(eq(accessRequests.email, email), eq(accessRequests.status, "pending"));
  const existingRequest = await db
    .select({ id: accessRequests.id })
    .from(accessRequests)
    .where(duplicateCondition)
    .limit(1);
  if (existingRequest.length > 0) {
    return NextResponse.json({ error: "A pending request for this email already exists." }, { status: 409 });
  }

  // Fetch app name for emails if clientId provided
  let appName = "Cleverfish";
  if (clientId) {
    const appRows = await db
      .select({ name: oauthApplication.name, clientId: oauthApplication.clientId })
      .from(oauthApplication)
      .where(eq(oauthApplication.clientId, clientId))
      .limit(1);
    if (appRows.length === 0) {
      return NextResponse.json({ error: "Requested application was not found." }, { status: 400 });
    }
    appName = appRows[0]?.name ?? "Cleverfish";
  }

  await db.insert(accessRequests).values({
    id: randomUUID(),
    name,
    email,
    status: "pending",
    clientId,
  });

  // Notify admins — query by role OR by the hardcoded ADMIN_USER_ID (which
  // may not have role='admin' stored in DB if set only via adminUserIds config).
  const adminUrl = `${process.env.BETTER_AUTH_URL}/admin/users`;
  const adminId = process.env.ADMIN_USER_ID;
  db.select({ email: user.email, id: user.id, role: user.role })
    .from(user)
    .then((allUsers) => {
      const adminEmails = allUsers
        .filter((u) => u.role === "admin" || u.id === adminId)
        .map((u) => u.email)
        .filter((e, i, arr) => arr.indexOf(e) === i); // dedupe
      return Promise.all(
        adminEmails.map((adminEmail) =>
          sendEmail({
            to: adminEmail,
            subject: `New access request — ${appName}`,
            html: renderEmailTemplate({
              heading: "New access request",
              intro: `A new access request has been submitted for <strong>${escapeHtml(appName)}</strong>.`,
              quote: `<strong>Name:</strong> ${escapeHtml(name)}<br/><strong>Email:</strong> ${escapeHtml(email)}`,
              ctaText: "Review in admin console",
              ctaUrl: adminUrl,
            }),
          })
        )
      );
    })
    .catch((e) => console.error("[access-requests] admin notify failed:", e));

  return NextResponse.json({ ok: true }, { status: 201 });
}
