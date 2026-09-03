# Multi-App OIDC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the auth server into a shared OIDC identity provider with per-app access control, admin UI for app management, and a standalone integration guide.

**Architecture:** better-auth's built-in `oidcProvider` plugin handles authorization code flow and token issuance. A custom consent page at `/oauth/consent` acts as the access control gate — it checks the `app_access` table before auto-consenting or redirecting to a no-access page. Admin UI routes use direct Drizzle queries plus `auth.api.registerOAuthApplication` for creating clients.

**Tech Stack:** Next.js 16.2.6 App Router, TypeScript, Tailwind CSS v4, better-auth v1.6.11, Drizzle ORM, PostgreSQL

---

## Existing Code Context

- `lib/schema.ts` — Drizzle schema: `user`, `session`, `account`, `verification`, `accessRequests` tables
- `lib/auth.ts` — better-auth config with `admin` plugin, `emailAndPassword`, Google/Microsoft social providers
- `lib/email.ts` — `sendEmail({ to, subject, html })` utility via Nodemailer/Mandrill
- `app/admin/layout.tsx` — admin sidebar with one "Users" nav link
- `app/admin/users/page.tsx` — client component, Users + Requests tabs
- `app/request-access/page.tsx` — client component, public access request form
- `app/api/access-requests/route.ts` — GET (admin, list all) + POST (public, submit request)
- `app/api/access-requests/[id]/approve/route.ts` — POST, admin approve
- `app/api/access-requests/[id]/reject/route.ts` — POST, admin reject
- better-auth drizzle adapter maps model names to schema export keys (e.g. `schema["oauthApplication"]`)

---

## Task 1: Schema — Add OIDC and Access Tables

**Files:**
- Modify: `lib/schema.ts`
- Run: `npx drizzle-kit push`

- [ ] **Step 1: Add imports for new Drizzle types**

Open `lib/schema.ts`. Change the import on line 2:

```ts
import { pgTable, text, timestamp, boolean, index, primaryKey, integer } from "drizzle-orm/pg-core";
```

- [ ] **Step 2: Add the three OIDC plugin tables at the bottom of `lib/schema.ts`**

These tables are required by better-auth's `oidcProvider` plugin. The drizzle adapter looks them up via `schema["oauthApplication"]`, `schema["oauthAccessToken"]`, `schema["oauthConsent"]`.

```ts
// Required by better-auth oidcProvider plugin
export const oauthApplication = pgTable("oauth_application", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon"),
  metadata: text("metadata"), // JSON string: { subdomain, sessionTimeout }
  clientId: text("client_id").notNull().unique(),
  clientSecret: text("client_secret"),
  redirectUrls: text("redirect_urls").notNull(), // comma-separated
  type: text("type").notNull().default("web"),
  disabled: boolean("disabled").default(false),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const oauthAccessToken = pgTable("oauth_access_token", {
  id: text("id").primaryKey(),
  accessToken: text("access_token").notNull().unique(),
  refreshToken: text("refresh_token").unique(),
  accessTokenExpiresAt: timestamp("access_token_expires_at").notNull(),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  clientId: text("client_id").notNull(),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  scopes: text("scopes").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const oauthConsent = pgTable("oauth_consent", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  scopes: text("scopes").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  consentGiven: boolean("consent_given").notNull(),
});
```

- [ ] **Step 3: Add the `appAccess` table**

```ts
// Per-app binary access control
export const appAccess = pgTable(
  "app_access",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthApplication.clientId, { onDelete: "cascade" }),
    grantedAt: timestamp("granted_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.clientId] })],
);
```

- [ ] **Step 4: Add `clientId` to `accessRequests`**

Find the `accessRequests` table definition. Add `clientId` as a nullable column (nullable to preserve existing rows):

```ts
export const accessRequests = pgTable(
  "access_requests",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    status: text("status").notNull().default("pending"),
    clientId: text("client_id"), // nullable — legacy rows predate multi-app
    createdAt: timestamp("created_at").defaultNow().notNull(),
    reviewedAt: timestamp("reviewed_at"),
  },
  (table) => [index("access_requests_email_idx").on(table.email)],
);
```

- [ ] **Step 5: Push schema to database**

```bash
cd /Users/paul.chan/better-auth/cefc-next && npx drizzle-kit push
```

Expected: prompts confirm adding tables `oauth_application`, `oauth_access_token`, `oauth_consent`, `app_access` and column `client_id` to `access_requests`. Confirm each.

- [ ] **Step 6: Commit**

```bash
git add lib/schema.ts
git commit -m "feat: add OIDC provider and app access tables to schema"
```

---

## Task 2: Add OIDC Provider Plugin to Auth

**Files:**
- Modify: `lib/auth.ts`

- [ ] **Step 1: Add the oidcProvider import**

In `lib/auth.ts`, change:
```ts
import { admin } from "better-auth/plugins";
```
to:
```ts
import { admin, oidcProvider } from "better-auth/plugins";
```

- [ ] **Step 2: Add oidcProvider to the plugins array**

The `plugins` array currently has only `admin(...)`. Add `oidcProvider(...)` after it:

```ts
  plugins: [
    admin({
      adminUserIds: [process.env.ADMIN_USER_ID!],
    }),
    oidcProvider({
      __skipDeprecationWarning: true,
      loginPage: "/sign-in",
      consentPage: "/oauth/consent",
      allowDynamicClientRegistration: false,
      storeClientSecret: "hashed",
      scopes: ["openid", "profile", "email"],
    }),
  ],
```

- [ ] **Step 3: Verify the discovery endpoint**

Start the dev server and open `http://localhost:3000/api/auth/.well-known/openid-configuration` in a browser.

Expected: JSON response containing `issuer`, `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `jwks_uri`.

- [ ] **Step 4: Commit**

```bash
git add lib/auth.ts
git commit -m "feat: add oidcProvider plugin to auth config"
```

---

## Task 3: Consent Page (Access Control Gate)

The OIDC provider redirects authenticated users to `/oauth/consent?consent_code=xxx&client_id=collab&scope=openid+profile+email`. This server component checks `app_access` and either auto-consents (redirecting back to the client app) or redirects to `/no-access`.

**Files:**
- Create: `app/oauth/consent/page.tsx`

- [ ] **Step 1: Create the consent page**

```tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { appAccess, oauthApplication } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

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
    redirect(`/no-access?client_id=${encodeURIComponent(client_id)}`);
  }

  // User has access — auto-consent
  const result = await (auth.api as any).oAuthConsent({
    body: { accept: true, consent_code },
    headers: await headers(),
  });

  // Follow the redirect back to the client app
  const redirectUrl =
    result instanceof Response
      ? result.headers.get("location")
      : (result as { url?: string })?.url;

  if (redirectUrl) redirect(redirectUrl);

  redirect("/sign-in");
}
```

- [ ] **Step 2: Verify the file was created**

```bash
cat /Users/paul.chan/better-auth/cefc-next/app/oauth/consent/page.tsx
```

Expected: file exists with the content above.

- [ ] **Step 3: Commit**

```bash
git add app/oauth/consent/page.tsx
git commit -m "feat: add OIDC consent page with app-access gate"
```

---

## Task 4: No-Access Page

**Files:**
- Create: `app/no-access/page.tsx`

- [ ] **Step 1: Create the no-access page**

```tsx
import Link from "next/link";
import { db } from "@/lib/db";
import { oauthApplication } from "@/lib/schema";
import { eq } from "drizzle-orm";

export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string }>;
}) {
  const { client_id } = await searchParams;

  let appName = "this application";
  if (client_id) {
    const rows = await db
      .select({ name: oauthApplication.name })
      .from(oauthApplication)
      .where(eq(oauthApplication.clientId, client_id))
      .limit(1);
    appName = rows[0]?.name ?? client_id;
  }

  return (
    <div className="flex h-screen bg-[#1c1c1c] items-center justify-center px-8">
      <div className="w-full max-w-sm bg-[#2a2a2a] rounded-xl p-8 border border-zinc-700 text-center">
        <div className="w-12 h-12 bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-red-300">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Access denied</h2>
        <p className="text-zinc-400 text-sm mb-6">
          You don&apos;t have access to <span className="text-white font-medium">{appName}</span>.
        </p>
        {client_id && (
          <Link
            href={`/request-access?client_id=${encodeURIComponent(client_id)}`}
            className="block w-full py-2.5 rounded-lg bg-purple-700 hover:bg-purple-600 text-white font-semibold text-sm transition-colors text-center mb-4"
          >
            Request Access
          </Link>
        )}
        <Link href="/sign-in" className="text-purple-400 text-sm hover:underline">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/no-access/page.tsx
git commit -m "feat: add no-access page"
```

---

## Task 5: Admin API — App Management

**Files:**
- Create: `app/api/admin/apps/route.ts`
- Create: `app/api/admin/apps/[id]/route.ts`

- [ ] **Step 1: Create the apps list + create route**

```ts
// app/api/admin/apps/route.ts
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { oauthApplication } from "@/lib/schema";
import { desc } from "drizzle-orm";

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
    metadata: JSON.parse(a.metadata ?? "{}") as { subdomain?: string; sessionTimeout?: number },
  }));

  return NextResponse.json({ apps: parsed });
}

export async function POST(request: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const name = (body.name ?? "").trim();
  const subdomain = (body.subdomain ?? "").trim();
  const sessionTimeout = Number(body.sessionTimeout) || 28800;
  const redirectUris: string[] = body.redirectUris ?? [];

  if (!name || redirectUris.length === 0) {
    return NextResponse.json({ error: "name and redirectUris are required." }, { status: 400 });
  }

  try {
    const result = await (auth.api as any).registerOAuthApplication({
      body: {
        client_name: name,
        redirect_uris: redirectUris,
        metadata: JSON.stringify({ subdomain, sessionTimeout }),
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
```

- [ ] **Step 2: Create the app update + delete route**

```ts
// app/api/admin/apps/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { oauthApplication } from "@/lib/schema";
import { eq } from "drizzle-orm";

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || (session.user as { role?: string }).role !== "admin") return null;
  return session;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();

  const rows = await db.select().from(oauthApplication).where(eq(oauthApplication.clientId, id)).limit(1);
  if (rows.length === 0) return NextResponse.json({ error: "App not found." }, { status: 404 });

  const existing = JSON.parse(rows[0].metadata ?? "{}") as { subdomain?: string; sessionTimeout?: number };
  const metadata = JSON.stringify({
    subdomain: body.subdomain ?? existing.subdomain ?? "",
    sessionTimeout: Number(body.sessionTimeout) || existing.sessionTimeout || 28800,
  });

  await db
    .update(oauthApplication)
    .set({
      name: body.name ?? rows[0].name,
      redirectUrls: body.redirectUris ? body.redirectUris.join(",") : rows[0].redirectUrls,
      metadata,
    })
    .where(eq(oauthApplication.clientId, id));

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const rows = await db.select({ id: oauthApplication.id }).from(oauthApplication).where(eq(oauthApplication.clientId, id)).limit(1);
  if (rows.length === 0) return NextResponse.json({ error: "App not found." }, { status: 404 });

  await db.delete(oauthApplication).where(eq(oauthApplication.clientId, id));

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/apps/route.ts "app/api/admin/apps/[id]/route.ts"
git commit -m "feat: add admin API routes for app management"
```

---

## Task 6: Admin API — Access Management

**Files:**
- Create: `app/api/admin/access/route.ts`

- [ ] **Step 1: Create the access grant/revoke route**

```ts
// app/api/admin/access/route.ts
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { appAccess, oauthApplication } from "@/lib/schema";
import { eq } from "drizzle-orm";

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
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { userId, clientId } = body;
  if (!userId || !clientId) return NextResponse.json({ error: "userId and clientId required." }, { status: 400 });

  await db
    .insert(appAccess)
    .values({ userId, clientId })
    .onConflictDoNothing();

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/access — revoke access { userId, clientId }
export async function DELETE(request: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { userId, clientId } = body;
  if (!userId || !clientId) return NextResponse.json({ error: "userId and clientId required." }, { status: 400 });

  await db
    .delete(appAccess)
    .where(eq(appAccess.userId, userId) && eq(appAccess.clientId, clientId));

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/admin/access/route.ts
git commit -m "feat: add admin API routes for app access management"
```

---

## Task 7: Admin UI — Apps Tab

**Files:**
- Modify: `app/admin/layout.tsx`
- Create: `app/admin/apps/page.tsx`

- [ ] **Step 1: Add Apps nav link to the sidebar in `app/admin/layout.tsx`**

Find the `<nav>` section. After the existing Users link, add:

```tsx
          <Link
            href="/admin/apps"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-300 hover:bg-zinc-800 hover:text-white text-sm transition-colors"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
            </svg>
            Apps
          </Link>
```

- [ ] **Step 2: Create the Apps page**

```tsx
// app/admin/apps/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";

type App = {
  id: string;
  name: string;
  clientId: string;
  redirectUrls: string;
  disabled: boolean | null;
  createdAt: string | Date;
  metadata: { subdomain?: string; sessionTimeout?: number };
};

type CreatedApp = { clientId: string; clientSecret: string; name: string } | null;

export default function AppsPage() {
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [createdApp, setCreatedApp] = useState<CreatedApp>(null);

  const [formName, setFormName] = useState("");
  const [formSubdomain, setFormSubdomain] = useState("");
  const [formRedirectUris, setFormRedirectUris] = useState("");
  const [formSessionTimeout, setFormSessionTimeout] = useState("28800");

  const fetchApps = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/apps");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setApps(data.apps ?? []);
    } catch {
      setError("Failed to load apps.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/admin/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          subdomain: formSubdomain.trim(),
          redirectUris: formRedirectUris.split("\n").map(s => s.trim()).filter(Boolean),
          sessionTimeout: Number(formSessionTimeout),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to create app."); return; }
      setCreatedApp(data);
      setShowForm(false);
      setFormName(""); setFormSubdomain(""); setFormRedirectUris(""); setFormSessionTimeout("28800");
      fetchApps();
    } catch {
      setError("Network error.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(clientId: string, name: string) {
    if (!confirm(`Permanently delete app "${name}"? This will revoke all user access.`)) return;
    const res = await fetch(`/api/admin/apps/${clientId}`, { method: "DELETE" });
    if (!res.ok) { setError("Failed to delete app."); return; }
    fetchApps();
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Apps</h1>
          <p className="text-zinc-400 text-sm mt-1">Registered OIDC client applications</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 text-white text-sm font-medium transition-colors"
        >
          Register App
        </button>
      </div>

      {createdApp && (
        <div className="mb-6 bg-green-900/30 border border-green-700 rounded-xl p-4">
          <p className="text-green-300 font-semibold text-sm mb-2">App registered — save the client secret now, it won&apos;t be shown again.</p>
          <p className="text-zinc-300 text-sm"><span className="text-zinc-500">Client ID:</span> <code className="text-green-300">{createdApp.clientId}</code></p>
          <p className="text-zinc-300 text-sm mt-1"><span className="text-zinc-500">Client Secret:</span> <code className="text-yellow-300 break-all">{createdApp.clientSecret}</code></p>
          <button onClick={() => setCreatedApp(null)} className="mt-3 text-zinc-500 text-xs hover:text-zinc-300">Dismiss</button>
        </div>
      )}

      {showForm && (
        <div className="mb-6 bg-[#2a2a2a] border border-zinc-700 rounded-xl p-6">
          <h2 className="text-white font-semibold mb-4">Register New App</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">App Name</label>
                <input value={formName} onChange={e => setFormName(e.target.value)} required placeholder="CEFC Collab"
                  className="w-full px-3 py-2 rounded-lg bg-[#1c1c1c] border border-zinc-600 text-white text-sm focus:outline-none focus:border-purple-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Subdomain</label>
                <input value={formSubdomain} onChange={e => setFormSubdomain(e.target.value)} placeholder="collab.cefc.org.sg"
                  className="w-full px-3 py-2 rounded-lg bg-[#1c1c1c] border border-zinc-600 text-white text-sm focus:outline-none focus:border-purple-500" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Redirect URIs (one per line)</label>
              <textarea value={formRedirectUris} onChange={e => setFormRedirectUris(e.target.value)} required rows={3}
                placeholder={"https://collab.cefc.org.sg/api/auth/callback/cefc-auth\nhttp://localhost:3001/api/auth/callback/cefc-auth"}
                className="w-full px-3 py-2 rounded-lg bg-[#1c1c1c] border border-zinc-600 text-white text-sm focus:outline-none focus:border-purple-500 font-mono" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Session Timeout (seconds)</label>
              <input type="number" value={formSessionTimeout} onChange={e => setFormSessionTimeout(e.target.value)} min="300"
                className="w-full px-3 py-2 rounded-lg bg-[#1c1c1c] border border-zinc-600 text-white text-sm focus:outline-none focus:border-purple-500" />
              <p className="text-zinc-500 text-xs mt-1">Default: 28800 (8 hours)</p>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex gap-3">
              <button type="submit" disabled={creating}
                className="px-4 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
                {creating ? "Registering..." : "Register"}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading && <p className="text-zinc-400 text-sm">Loading apps...</p>}
      {error && !showForm && <p className="text-red-400 text-sm">{error}</p>}
      {!loading && (
        <div className="bg-[#2a2a2a] rounded-xl border border-zinc-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700">
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">Name</th>
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">Client ID</th>
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">Subdomain</th>
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">Session</th>
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">Created</th>
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => (
                <tr key={app.id} className="border-b border-zinc-800 hover:bg-zinc-800/40 transition-colors">
                  <td className="px-4 py-3 text-white font-medium">{app.name}</td>
                  <td className="px-4 py-3 text-zinc-300 font-mono text-xs">{app.clientId}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">{app.metadata.subdomain ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">{app.metadata.sessionTimeout ?? 28800}s</td>
                  <td className="px-4 py-3 text-zinc-400">{new Date(app.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(app.clientId, app.name)}
                      className="px-3 py-1 rounded text-xs font-medium bg-red-900 text-red-200 hover:bg-red-800 transition-colors">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {apps.length === 0 && (
            <p className="text-center text-zinc-500 text-sm py-8">No apps registered yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify manually**

Navigate to `http://localhost:3000/admin/apps`. Expected: "Apps" link appears in sidebar, the page loads, "Register App" button shows the form, form submission creates a new app and displays client_id + client_secret.

- [ ] **Step 4: Commit**

```bash
git add app/admin/layout.tsx app/admin/apps/page.tsx
git commit -m "feat: add admin Apps tab with app registration UI"
```

---

## Task 8: Admin UI — Access Management Panel

Add a "Manage Access" action per user row that opens an inline panel listing all apps with grant/revoke toggles.

**Files:**
- Create: `app/admin/users/AccessPanel.tsx`
- Modify: `app/admin/users/page.tsx`

- [ ] **Step 1: Create `AccessPanel.tsx`**

```tsx
// app/admin/users/AccessPanel.tsx
"use client";

import { useEffect, useState } from "react";

type AppAccess = { clientId: string; name: string; granted: boolean };

type Props = { userId: string; onClose: () => void };

export function AccessPanel({ userId, onClose }: Props) {
  const [access, setAccess] = useState<AppAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toggling, setToggling] = useState<string | null>(null);

  async function fetchAccess() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/access?userId=${userId}`);
      const data = await res.json();
      setAccess(data.access ?? []);
    } catch {
      setError("Failed to load access.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAccess(); }, [userId]);

  async function handleToggle(clientId: string, currently: boolean) {
    setToggling(clientId);
    setError("");
    try {
      const res = await fetch("/api/admin/access", {
        method: currently ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, clientId }),
      });
      if (!res.ok) { setError("Failed to update access."); return; }
      await fetchAccess();
    } catch {
      setError("Network error.");
    } finally {
      setToggling(null);
    }
  }

  return (
    <div className="mt-2 p-4 bg-zinc-900 rounded-lg border border-zinc-700">
      <div className="flex items-center justify-between mb-3">
        <p className="text-white text-sm font-semibold">App Access</p>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xs">Close</button>
      </div>
      {loading && <p className="text-zinc-500 text-xs">Loading...</p>}
      {error && <p className="text-red-400 text-xs">{error}</p>}
      {!loading && access.length === 0 && (
        <p className="text-zinc-500 text-xs">No apps registered. Register apps in the Apps tab first.</p>
      )}
      <div className="space-y-2">
        {access.map((app) => (
          <div key={app.clientId} className="flex items-center justify-between">
            <div>
              <p className="text-white text-xs font-medium">{app.name}</p>
              <p className="text-zinc-500 text-xs font-mono">{app.clientId}</p>
            </div>
            <button
              onClick={() => handleToggle(app.clientId, app.granted)}
              disabled={toggling === app.clientId}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
                app.granted
                  ? "bg-green-900 text-green-200 hover:bg-red-900 hover:text-red-200"
                  : "bg-zinc-700 text-zinc-300 hover:bg-green-900 hover:text-green-200"
              }`}
            >
              {toggling === app.clientId ? "..." : app.granted ? "Revoke" : "Grant"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Modify `app/admin/users/page.tsx` to add access panel**

In `page.tsx`, import `AccessPanel` and add state for which user's panel is open:

```tsx
import { AccessPanel } from "./AccessPanel";
```

After the existing state declarations, add:
```tsx
const [accessPanelUserId, setAccessPanelUserId] = useState<string | null>(null);
```

In the Users table, find the `<UserActions>` cell and add an "Access" button and the panel below the row. Replace the existing `<td>` containing `<UserActions>`:

```tsx
<td className="px-4 py-3">
  <div className="flex flex-col gap-2">
    <div className="flex items-center gap-2">
      <UserActions user={user} onRefresh={fetchUsers} />
      <button
        onClick={() => setAccessPanelUserId(accessPanelUserId === user.id ? null : user.id)}
        className="px-3 py-1 rounded text-xs font-medium bg-blue-900 text-blue-200 hover:bg-blue-800 transition-colors"
      >
        Access
      </button>
    </div>
    {accessPanelUserId === user.id && (
      <AccessPanel userId={user.id} onClose={() => setAccessPanelUserId(null)} />
    )}
  </div>
</td>
```

- [ ] **Step 3: Verify manually**

Navigate to `http://localhost:3000/admin/users`. Click "Access" on any user row. Expected: panel opens listing all registered apps with Grant/Revoke buttons. Toggling updates state immediately.

- [ ] **Step 4: Commit**

```bash
git add app/admin/users/AccessPanel.tsx app/admin/users/page.tsx
git commit -m "feat: add per-user app access management panel in admin UI"
```

---

## Task 9: App-Aware Request-Access Flow

Update the request-access page, submit API, approve route, and reject route to be app-aware. The `client_id` query param identifies which app the user is requesting access to.

**Files:**
- Modify: `app/request-access/page.tsx`
- Modify: `app/api/access-requests/route.ts`
- Modify: `app/api/access-requests/[id]/approve/route.ts`
- Modify: `app/api/access-requests/[id]/reject/route.ts`

- [ ] **Step 1: Split `app/request-access/page.tsx` into server shell + client form**

The page needs to fetch the app name server-side (to avoid an extra client API call), then pass it to a client form component.

Replace the entire contents of `app/request-access/page.tsx` with:

```tsx
import { db } from "@/lib/db";
import { oauthApplication } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { RequestAccessForm } from "./RequestAccessForm";

export default async function RequestAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string }>;
}) {
  const { client_id } = await searchParams;

  let appName: string | null = null;
  if (client_id) {
    const rows = await db
      .select({ name: oauthApplication.name })
      .from(oauthApplication)
      .where(eq(oauthApplication.clientId, client_id))
      .limit(1);
    appName = rows[0]?.name ?? null;
  }

  return <RequestAccessForm clientId={client_id ?? null} appName={appName} />;
}
```

- [ ] **Step 2: Create `app/request-access/RequestAccessForm.tsx`**

This is the existing client component logic extracted and made app-aware:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";

type Props = { clientId: string | null; appName: string | null };

export function RequestAccessForm({ clientId, appName }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const displayName = appName ?? "CEFC Woodlands";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          clientId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
      } else {
        setSubmitted(true);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen bg-[#1c1c1c] items-center justify-center px-8">
      <div className="w-full max-w-sm bg-[#2a2a2a] rounded-xl p-8 border border-zinc-700">
        {submitted ? (
          <div className="text-center">
            <h2 className="text-xl font-bold text-white mb-2">Request submitted</h2>
            <p className="text-zinc-400 text-sm mb-6">
              Your request has been submitted. We&apos;ll be in touch.
            </p>
            <Link href="/sign-in" className="text-purple-400 text-sm hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold text-white text-center mb-1">Request for Access</h2>
            <p className="text-zinc-400 text-sm text-center mb-6">
              {appName
                ? `Submit your details to request access to ${displayName}.`
                : "Submit your details and an IT admin will review your request."}
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-white mb-1">Full name</label>
                <input id="name" type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Your full name" required autoComplete="name"
                  className="w-full px-3 py-2.5 rounded-lg bg-[#1c1c1c] border border-zinc-600 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-purple-500" />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-white mb-1">Email address</label>
                <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="Your email address" required autoComplete="email"
                  className="w-full px-3 py-2.5 rounded-lg bg-[#1c1c1c] border border-zinc-600 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-purple-500" />
              </div>
              {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
              <button type="submit" disabled={loading} aria-busy={loading}
                className="w-full py-2.5 rounded-lg bg-purple-700 hover:bg-purple-600 text-white font-semibold text-sm transition-colors disabled:opacity-50">
                {loading ? "Submitting..." : "Submit Request"}
              </button>
            </form>
            <div className="mt-6 text-center">
              <Link href="/sign-in" className="text-purple-400 text-sm hover:underline">Back to sign in</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update `app/api/access-requests/route.ts`** to store `clientId` and use app name in emails

Replace the POST handler's insert and email section. Find where `db.insert(accessRequests)` is called. Replace from the insert to the end of the function:

```ts
  // Fetch app name for emails if clientId provided
  let appName = "CEFC Woodlands";
  if (body.clientId) {
    const appRows = await db
      .select({ name: oauthApplication.name })
      .from(oauthApplication)
      .where(eq(oauthApplication.clientId, body.clientId))
      .limit(1);
    appName = appRows[0]?.name ?? "CEFC Woodlands";
  }

  await db.insert(accessRequests).values({
    id: randomUUID(),
    name,
    email,
    status: "pending",
    clientId: body.clientId ?? null,
  });

  const adminUrl = `${process.env.BETTER_AUTH_URL}/admin/users`;
  db.select({ email: user.email })
    .from(user)
    .where(eq(user.role, "admin"))
    .then((admins) =>
      Promise.all(
        admins.map((a) =>
          sendEmail({
            to: a.email,
            subject: `New access request — ${appName}`,
            html: `<p>A new access request has been submitted for <strong>${appName}</strong>.</p><p><strong>Name:</strong> ${name}<br/><strong>Email:</strong> ${email}</p><p><a href="${adminUrl}">Review in admin console</a></p>`,
          })
        )
      )
    )
    .catch((e) => console.error("[access-requests] admin notify failed:", e));

  return NextResponse.json({ ok: true }, { status: 201 });
```

Also add `oauthApplication` to the imports at the top of the file:
```ts
import { user, accessRequests, oauthApplication } from "@/lib/schema";
```

- [ ] **Step 4: Update the approve route**

Replace the full contents of `app/api/access-requests/[id]/approve/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { accessRequests, appAccess, oauthApplication, user } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
  let appName = "CEFC Woodlands";
  if (accessRequest.clientId) {
    const appRows = await db
      .select({ name: oauthApplication.name })
      .from(oauthApplication)
      .where(eq(oauthApplication.clientId, accessRequest.clientId))
      .limit(1);
    appName = appRows[0]?.name ?? "CEFC Woodlands";
  }

  // Create user account (if it doesn't already exist)
  let userId: string | null = null;
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
    const code = (e as { body?: { code?: string } })?.body?.code;
    if (code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
      // User already exists — look up their ID to grant access
      const existingRows = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, accessRequest.email))
        .limit(1);
      userId = existingRows[0]?.id ?? null;
    } else {
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

  // Send set-password email if the account was just created (userId came from createUser, not lookup)
  try {
    await auth.api.requestPasswordReset({
      body: {
        email: accessRequest.email,
        redirectTo: `${process.env.BETTER_AUTH_URL}/reset-password`,
      },
    });
  } catch (e) {
    console.error("[approve] requestPasswordReset failed:", e);
    return NextResponse.json({ error: "User created but failed to send set-password email." }, { status: 500 });
  }

  await db
    .update(accessRequests)
    .set({ status: "approved", reviewedAt: new Date() })
    .where(eq(accessRequests.id, id));

  return NextResponse.json({ ok: true });
}
```

Note: `sendResetPassword` in `lib/auth.ts` currently hardcodes "Set your CEFC Woodlands password" as the subject. Update that line to use a generic subject since it can't know the app context at that point:

In `lib/auth.ts`, change the `sendResetPassword` subject:
```ts
subject: "Set your CEFC Woodlands password",
```
to:
```ts
subject: "Set your password — CEFC",
```

- [ ] **Step 5: Update the reject route**

Replace the full contents of `app/api/access-requests/[id]/reject/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { accessRequests, oauthApplication } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { sendEmail } from "@/lib/email";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  let appName = "CEFC Woodlands";
  if (accessRequest.clientId) {
    const appRows = await db
      .select({ name: oauthApplication.name })
      .from(oauthApplication)
      .where(eq(oauthApplication.clientId, accessRequest.clientId))
      .limit(1);
    appName = appRows[0]?.name ?? "CEFC Woodlands";
  }

  await sendEmail({
    to: accessRequest.email,
    subject: `Your ${appName} access request`,
    html: `
      <p>Hi ${accessRequest.name},</p>
      <p>Thank you for your interest in ${appName}.</p>
      <p>Unfortunately, your access request has not been approved at this time.</p>
      <p>If you believe this is an error, please contact your ministry leader or IT administrator.</p>
      <br/>
      <p>CEFC Woodlands IT</p>
    `,
  });

  await db
    .update(accessRequests)
    .set({ status: "rejected", reviewedAt: new Date() })
    .where(eq(accessRequests.id, id));

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Commit**

```bash
git add app/request-access/page.tsx app/request-access/RequestAccessForm.tsx \
  app/api/access-requests/route.ts \
  "app/api/access-requests/[id]/approve/route.ts" \
  "app/api/access-requests/[id]/reject/route.ts" \
  lib/auth.ts
git commit -m "feat: make request-access flow app-aware with client_id context"
```

---

## Task 10: Integration Guide

**Files:**
- Create: `docs/integration-guide.md`

- [ ] **Step 1: Create the guide**

```markdown
# CEFC Auth Integration Guide

This guide shows how to connect a new CEFC Next.js app to the shared auth server at `auth.cefc.org.sg`.

---

## Prerequisites

- Node.js 18+
- Next.js 15+ App Router project
- PostgreSQL database for the app's own sessions

---

## Step 1 — Register Your App

1. Go to `https://auth.cefc.org.sg/admin/apps` (requires admin login)
2. Click **Register App**
3. Fill in:
   - **App Name** — e.g. `CEFC Collab`
   - **Subdomain** — e.g. `collab.cefc.org.sg`
   - **Redirect URIs** — one per line, e.g.:
     ```
     https://collab.cefc.org.sg/api/auth/callback/cefc-auth
     http://localhost:3001/api/auth/callback/cefc-auth
     ```
   - **Session Timeout** — seconds before an idle session expires (default: 28800 = 8 hours)
4. Copy the generated **Client ID** and **Client Secret**. The secret is shown only once.

---

## Step 2 — Environment Variables

Add to your app's `.env`:

```
BETTER_AUTH_SECRET=<random 32+ char string>
BETTER_AUTH_URL=https://collab.cefc.org.sg

AUTH_CLIENT_ID=<client_id from Step 1>
AUTH_CLIENT_SECRET=<client_secret from Step 1>
DATABASE_URL=postgresql://localhost:5432/your_app_db
```

---

## Step 3 — Install Dependencies

```bash
npm install better-auth pg
```

---

## Step 4 — Configure Auth (`lib/auth.ts`)

```ts
import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  database: {
    // configure your app's own database for session storage
    // see https://www.better-auth.com/docs/adapters
  },
  session: {
    expiresIn: Number(process.env.SESSION_TIMEOUT ?? 28800),
    updateAge: 3600,
  },
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "cefc-auth",
          clientId: process.env.AUTH_CLIENT_ID as string,
          clientSecret: process.env.AUTH_CLIENT_SECRET as string,
          discoveryUrl:
            "https://auth.cefc.org.sg/api/auth/.well-known/openid-configuration",
          scopes: ["openid", "profile", "email"],
        },
      ],
    }),
  ],
});
```

---

## Step 5 — Auth API Route (`app/api/auth/[...all]/route.ts`)

```ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

---

## Step 6 — Auth Client (`lib/auth-client.ts`)

```ts
import { createAuthClient } from "better-auth/react";
import { genericOAuthClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
  plugins: [genericOAuthClient()],
});
```

---

## Step 7 — Middleware (`middleware.ts`)

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function middleware(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    const signInUrl = new URL("/sign-in", request.url);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

// Protect your app routes
export const config = {
  matcher: ["/dashboard/:path*", "/app/:path*"],
};
```

---

## Step 8 — Sign-In Page (`app/sign-in/page.tsx`)

```tsx
"use client";

import { authClient } from "@/lib/auth-client";

export default function SignInPage() {
  return (
    <div className="flex h-screen items-center justify-center">
      <button
        onClick={() =>
          authClient.signIn.social({ provider: "cefc-auth", callbackURL: "/dashboard" })
        }
        className="px-6 py-3 bg-purple-700 hover:bg-purple-600 text-white rounded-lg font-semibold"
      >
        Sign in with CEFC
      </button>
    </div>
  );
}
```

---

## What the Session Contains

After sign-in, `authClient.useSession()` returns a user object with:

```ts
{
  id: string,       // stable user ID — use this to key app-specific data
  name: string,     // full name from the auth server
  email: string,    // email address
}
```

---

## App-Level Permissions

The auth server only determines **who the user is** and whether they have access to your app. Roles, permissions, and feature flags within your app are your responsibility. Store them in your app's own database, keyed on `user.id`.

---

## Mobile (React Native)

To connect a React Native app:

1. Register a separate app in the admin console — use **type: public** (no client secret)
2. Set redirect URI to a custom scheme: `cefc://auth/callback`
3. Use `expo-auth-session` or `react-native-app-auth` with PKCE enabled
4. The auth server's discovery URL works for any OIDC client library:
   `https://auth.cefc.org.sg/api/auth/.well-known/openid-configuration`

---

## Support

Contact IT admin at paul.chan@cefc.org.sg or the CEFC IT channel.
```

- [ ] **Step 2: Commit**

```bash
git add docs/integration-guide.md
git commit -m "docs: add CEFC Auth integration guide for client apps"
```

---

## Self-Review

**Spec coverage:**
- ✅ `oidc_clients` → using `oauthApplication` (plugin-managed) + metadata JSON for custom fields
- ✅ `app_access` table → Task 1
- ✅ `access_requests.clientId` → Task 1
- ✅ OIDC provider plugin → Task 2
- ✅ Access control at consent → Task 3
- ✅ No-access page → Task 4
- ✅ Admin API: app management → Task 5
- ✅ Admin API: access management → Task 6
- ✅ Admin UI: Apps tab + sidebar → Task 7
- ✅ Admin UI: per-user access panel → Task 8
- ✅ Request-access flow app-aware → Task 9
- ✅ Integration guide → Task 10

**Notes for implementer:**
- Task 3 uses `(auth.api as any).oAuthConsent` because `oAuthConsent` may not be typed in the public API surface. If TypeScript errors, cast appropriately.
- The `registerOAuthApplication` call in Task 5 also uses `(auth.api as any)` for the same reason.
- The DELETE handler in Task 6 uses `&&` in the Drizzle where clause — use `and()` from drizzle-orm instead if TypeScript complains:
  ```ts
  import { and } from "drizzle-orm";
  .where(and(eq(appAccess.userId, userId), eq(appAccess.clientId, clientId)))
  ```
- After Task 2, verify the discovery endpoint before proceeding to Task 3 — all subsequent tasks depend on the OIDC plugin working correctly.
