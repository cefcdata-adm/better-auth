import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { oauthApplication } from "@/lib/schema";
import { desc } from "drizzle-orm";
import { enforceSameOrigin } from "@/lib/security";
import { parseOAuthAppInput, parseOAuthMetadata } from "@/lib/validation";

type OAuthAppRegistrationResult = {
  client_id: string;
  client_secret: string;
};

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || (session.user as { role?: string }).role !== "admin") return null;
  return session;
}

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const apps = await db
    .select({
      id: oauthApplication.id,
      name: oauthApplication.name,
      clientId: oauthApplication.clientId,
      redirectUrls: oauthApplication.redirectUrls,
      type: oauthApplication.type,
      disabled: oauthApplication.disabled,
      metadata: oauthApplication.metadata,
      createdAt: oauthApplication.createdAt,
    })
    .from(oauthApplication)
    .orderBy(desc(oauthApplication.createdAt));

  const parsed = apps.map((a) => ({
    ...a,
    metadata: parseOAuthMetadata(a.metadata),
  }));

  return NextResponse.json({ apps: parsed });
}

export async function POST(request: NextRequest) {
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const parsedBody = parseOAuthAppInput(body);
  if (!parsedBody.ok) {
    return NextResponse.json({ error: parsedBody.error }, { status: 400 });
  }
  const { name, subdomain, redirectUris, postLogoutRedirectUris, sessionTimeout } = parsedBody.data;
  const registeredRedirectUris = Array.from(new Set([
    ...redirectUris,
    ...postLogoutRedirectUris,
  ]));

  try {
    const authApi = auth.api as unknown as {
      registerOAuthApplication(args: {
        body: {
          client_name: string;
          redirect_uris: string[];
          metadata: {
            subdomain: string;
            sessionTimeout: number;
            postLogoutRedirectUris: string[];
          };
        };
        headers: Headers;
      }): Promise<OAuthAppRegistrationResult>;
    };

    const result = await authApi.registerOAuthApplication({
      body: {
        client_name: name,
        redirect_uris: registeredRedirectUris,
        metadata: { subdomain, sessionTimeout, postLogoutRedirectUris },
      },
      headers: await headers(),
    });

    return NextResponse.json({
      clientId: result.client_id,
      clientSecret: result.client_secret,
      name,
    }, { status: 201 });
  } catch (e) {
    console.error("[admin/apps] register failed:", e);
    return NextResponse.json({ error: "Failed to create app." }, { status: 500 });
  }
}
