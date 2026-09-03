import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { appAccess, pendingAppAccess } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

type OAuthConsentResult = Response | { redirectURI?: string };

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ consent_code?: string; client_id?: string }>;
}) {
  const { consent_code, client_id } = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) redirect("/sign-in");
  if (!consent_code || !client_id) redirect("/sign-in");

  const accessRows = await db
    .select()
    .from(appAccess)
    .where(
      and(
        eq(appAccess.userId, session.user.id),
        eq(appAccess.clientId, client_id),
      ),
    )
    .limit(1);

  if (accessRows.length === 0) {
    // Check if the user was pre-authorized by email before their first sign-in
    const email = session.user.email.toLowerCase();
    const pendingRows = await db
      .select({ id: pendingAppAccess.id })
      .from(pendingAppAccess)
      .where(and(eq(pendingAppAccess.email, email), eq(pendingAppAccess.clientId, client_id)))
      .limit(1);

    if (pendingRows.length > 0) {
      await db.insert(appAccess).values({ userId: session.user.id, clientId: client_id }).onConflictDoNothing();
      await db.delete(pendingAppAccess).where(eq(pendingAppAccess.id, pendingRows[0].id));
    } else {
      redirect(`/no-access?client_id=${encodeURIComponent(client_id)}`);
    }
  }

  // User has access — auto-consent
  const authApi = auth.api as unknown as {
    oAuthConsent(args: {
      body: { accept: boolean; consent_code: string };
      headers: Headers;
    }): Promise<OAuthConsentResult>;
  };

  const result = await authApi.oAuthConsent({
    body: { accept: true, consent_code },
    headers: await headers(),
  });

  // Follow the redirect back to the client app
  const redirectUrl =
    result instanceof Response
      ? result.headers.get("location")
      : result.redirectURI;

  if (redirectUrl) redirect(redirectUrl);

  redirect("/sign-in");
}
