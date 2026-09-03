# CEFC Auth Integration Guide

This guide shows how to connect a new CEFC Next.js app to the shared auth server at `id.cefc.org.sg`.

---

## Prerequisites

- Node.js 18+
- Next.js 15+ App Router project
- PostgreSQL database for the app's own sessions

---

## Step 1 — Register Your App

1. Go to `https://id.cefc.org.sg/admin/apps` (requires admin login)
2. Click **Register App**
3. Fill in:
   - **App Name** — e.g. `CEFC Collab`
   - **Subdomain** — e.g. `collab.cefc.org.sg`
   - **Redirect URIs** — one per line. The path must be `/api/auth/oauth2/callback/cefc-auth`:
     ```
     https://collab.cefc.org.sg/api/auth/oauth2/callback/cefc-auth
     http://localhost:3001/api/auth/oauth2/callback/cefc-auth
     ```
   - **Post-Logout Redirect URIs** — optional, one per line. The page users land on after OIDC end-session (typically your sign-in page):
     ```
     https://collab.cefc.org.sg/sign-in
     ```
   - **Session Timeout** — seconds before an idle session expires (default: 28800 = 8 hours)
4. Copy the generated **Client ID** and **Client Secret**. The secret is shown only once.

---

## Step 2 — Environment Variables

Add to your app's `.env.local`:

```
BETTER_AUTH_SECRET=<random 32+ char string — generate with: openssl rand -base64 32>
BETTER_AUTH_URL=https://collab.cefc.org.sg
NEXT_PUBLIC_BETTER_AUTH_URL=https://collab.cefc.org.sg

AUTH_CLIENT_ID=<client_id from Step 1>
AUTH_CLIENT_SECRET=<client_secret from Step 1>
AUTH_DISCOVERY_URL=https://id.cefc.org.sg/api/auth/.well-known/openid-configuration

DATABASE_URL=postgresql://user:password@host:5432/your_app_db
```

> **Docker deployments:** `localhost` in `DATABASE_URL` will not reach the host's PostgreSQL from inside a container. Use the database container's internal hostname instead (e.g. `postgresql://postgres:password@supabase-db:5434/postgres` for the CEFC shared Supabase stack). Check the actual port with `SHOW port;` — the CEFC stack runs on **5434**, not the default 5432.

> **Important:** Copy the client secret carefully — avoid trailing whitespace or encoding artifacts. If you get `invalid_client` errors, re-check the secret value.

---

## Step 2b — Docker Build Args (containerised deployments only)

`NEXT_PUBLIC_*` variables are baked into the JavaScript bundle at build time. Passing them only via `env_file` at runtime has no effect — they must also be declared as Docker build args, otherwise the auth client will have no `baseURL` and sign-in will silently fail.

In `docker-compose.yml`:

```yaml
services:
  your-app:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_BETTER_AUTH_URL: ${NEXT_PUBLIC_BETTER_AUTH_URL}
    env_file:
      - .env.local
    networks:
      - default
      - supabase_default   # needed to reach supabase-db internally

networks:
  supabase_default:
    external: true
```

In `Dockerfile`, declare each build arg and set it as an `ENV` before the build step:

```dockerfile
ARG NEXT_PUBLIC_BETTER_AUTH_URL
ENV NEXT_PUBLIC_BETTER_AUTH_URL=$NEXT_PUBLIC_BETTER_AUTH_URL

RUN npm run build
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
import { Pool } from "pg";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  // Pass a pg Pool directly — do NOT use { db: pool, type: "postgres" },
  // that is v0.x syntax and throws "insertInto is not a function" in v1.x.
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
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
          discoveryUrl: process.env.AUTH_DISCOVERY_URL as string,
          scopes: ["openid", "profile", "email"],
        },
      ],
    }),
  ],
});
```

Better Auth will auto-create the required session tables (`user`, `session`, `account`, `verification`) on first run, **provided the DB user has `CREATE TABLE` permission**. If your database user is restricted (common in production), run the migration manually first:

```bash
npx better-auth migrate
```

Or apply the DDL directly:

```sql
CREATE TABLE IF NOT EXISTS "user" (
  "id"            TEXT        NOT NULL PRIMARY KEY,
  "name"          TEXT        NOT NULL,
  "email"         TEXT        NOT NULL UNIQUE,
  "emailVerified" BOOLEAN     NOT NULL DEFAULT FALSE,
  "image"         TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "session" (
  "id"          TEXT        NOT NULL PRIMARY KEY,
  "expiresAt"   TIMESTAMPTZ NOT NULL,
  "token"       TEXT        NOT NULL UNIQUE,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "ipAddress"   TEXT,
  "userAgent"   TEXT,
  "userId"      TEXT        NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  "id"                    TEXT        NOT NULL PRIMARY KEY,
  "accountId"             TEXT        NOT NULL,
  "providerId"            TEXT        NOT NULL,
  "userId"                TEXT        NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken"           TEXT,
  "refreshToken"          TEXT,
  "idToken"               TEXT,
  "accessTokenExpiresAt"  TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  "scope"                 TEXT,
  "password"              TEXT,
  "createdAt"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id"         TEXT        NOT NULL PRIMARY KEY,
  "identifier" TEXT        NOT NULL,
  "value"      TEXT        NOT NULL,
  "expiresAt"  TIMESTAMPTZ NOT NULL,
  "createdAt"  TIMESTAMPTZ,
  "updatedAt"  TIMESTAMPTZ
);
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

## Step 7 — Sign-In Page (`app/sign-in/page.tsx`)

This page is where unauthenticated users land. It immediately triggers the OIDC redirect to the auth server.

Two important requirements:
- `useSearchParams()` must be inside a `<Suspense>` boundary or Next.js will throw at build time.
- Initiate sign-in via a direct `fetch` rather than `authClient.signIn.oauth2(...)` — the latter is a proxy method with no TypeScript signature in v1.x and fails silently if something goes wrong.

```tsx
"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

function SignInRedirect() {
  const searchParams = useSearchParams();
  const callbackURL = searchParams.get("callbackURL") ?? "/";

  useEffect(() => {
    fetch("/api/auth/sign-in/oauth2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ providerId: "cefc-auth", callbackURL }),
    })
      .then(r => r.json())
      .then(data => { if (data.url) window.location.href = data.url; })
      .catch(e => console.error("sign-in failed", e));
  }, [callbackURL]);

  return null;
}

export default function SignInPage() {
  return (
    <Suspense>
      <div style={{ padding: "2rem", fontFamily: "sans-serif", color: "#888" }}>
        Redirecting to CEFC sign-in...
      </div>
      <SignInRedirect />
    </Suspense>
  );
}
```

---

## Step 8 — Proxy / Middleware

The proxy checks for a session cookie. If none is present, it redirects to `/sign-in`, which triggers the OIDC flow. The auth server handles login and redirects back when done.

> **Cookie name gotcha:** When `BETTER_AUTH_URL` is an `https://` URL, Better Auth automatically names the cookie `__Secure-better-auth.session_token`. Check for both names so the proxy works in both local (http) and production (https) environments.

**Next.js 16+** — create `proxy.ts` (the file and export must both be named `proxy`):

```ts
import { NextRequest, NextResponse } from "next/server";

const SKIP_PATHS = ["/api/auth", "/_next", "/favicon.ico", "/sign-in"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (SKIP_PATHS.some(p => pathname.startsWith(p))) return NextResponse.next();

  const hasSession =
    request.cookies.has("__Secure-better-auth.session_token") ||
    request.cookies.has("better-auth.session_token");

  if (!hasSession) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("callbackURL", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

**Next.js 15** — use `middleware.ts` with `export function middleware(...)` instead (same body).

The proxy only checks cookie **presence** — no DB call. Expired sessions are caught by page-level `auth.api.getSession()` checks.

---

## Step 9 — `force-dynamic` on Auth-Dependent Pages

Any page, layout, or route segment that calls `auth.api.getSession()` must opt out of static generation:

```ts
export const dynamic = "force-dynamic";
```

Add this to the top of every file that touches auth on the server side, including root `layout.tsx` and `page.tsx`. Without it, Next.js will attempt to statically render the route at build time, producing a corrupted page manifest that causes 500 errors in production even though the build appears to succeed.

If you are unsure whether a file needs it, add it — there is no meaningful performance cost for an authenticated app since all pages are user-specific anyway.

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

**Account linking** is enabled on the auth server. If a user signs in with Google and later with Microsoft using the same email address, they are treated as the same person and receive the same `user.id`. Your app does not need to handle this — it is transparent.

---

## Sign-Out

Call `authClient.signOut()` and redirect to `/sign-in` on success. If your app calls the OIDC end-session endpoint, register `/sign-in` in **Post-Logout Redirect URIs** during app registration (Step 1):

```tsx
<button
  onClick={() =>
    authClient.signOut({
      fetchOptions: {
        onSuccess: () => { window.location.href = "/sign-in"; },
      },
    })
  }
>
  Sign out
</button>
```

---

## App-Level Permissions

The auth server only determines **who the user is** and whether they have access to your app. Roles, permissions, and feature flags within your app are your responsibility. Store them in your app's own database, keyed on `user.id`.

---

## Pre-Authorizing Users

By default, a user must be granted access to your app in the cefc-auth admin panel before they can sign in. This creates friction when your app has its own user management — the admin would need to add the user in two places.

The **pre-authorization API** solves this. When your app adds a user, it calls cefc-auth to register that user's email in advance. The next time that user signs in at `id.cefc.org.sg`, access is granted automatically without them ever seeing an "unauthorized" screen.

### How it works

1. Your app's admin adds a user (by email)
2. Your app calls `POST https://id.cefc.org.sg/api/app-access/invite` with that email
3. The user receives their invite email and clicks the link to your app
4. Your app redirects them to `id.cefc.org.sg` to authenticate (Google, Microsoft, or email + password)
5. cefc-auth recognizes the email, silently grants access, and redirects them back to your app

### Calling the API

Authenticate using **HTTP Basic Auth** with your app's `clientId` and `clientSecret` (from Step 1).

```http
POST https://id.cefc.org.sg/api/app-access/invite
Authorization: Basic <base64(clientId:clientSecret)>
Content-Type: application/json

{ "email": "user@example.com" }
```

**Node.js / Next.js:**

```ts
async function preAuthorizeUser(email: string) {
  const token = Buffer.from(
    `${process.env.AUTH_CLIENT_ID}:${process.env.AUTH_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch("https://id.cefc.org.sg/api/app-access/invite", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });

  if (!res.ok) throw new Error(`Pre-auth failed: ${res.status}`);
}
```

**Python:**

```python
import base64, requests

def pre_authorize_user(email: str):
    token = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
    res = requests.post(
        "https://id.cefc.org.sg/api/app-access/invite",
        headers={"Authorization": f"Basic {token}"},
        json={"email": email},
    )
    res.raise_for_status()
```

### Responses

| Status | Meaning |
|--------|---------|
| `200 { "ok": true }` | Email registered (or was already registered — safe to call again) |
| `400` | Missing or invalid email |
| `401` | Invalid `clientId` or `clientSecret` |

### When to call it

Call the endpoint in your "add user" flow — immediately after you add the user to your own system, before sending them their invite email. The call is idempotent, so calling it multiple times for the same email is harmless.

If a user already has full access (they've signed in before), the invite call still returns `200` — it simply does nothing extra.

---

## Mobile (React Native)

To connect a React Native app:

1. Register a separate app in the admin console — use **type: public** (no client secret)
2. Set redirect URI to a custom scheme: `cefc://auth/callback`
3. Use `expo-auth-session` or `react-native-app-auth` with PKCE enabled
4. The auth server's discovery URL works for any OIDC client library:
   `https://id.cefc.org.sg/api/auth/.well-known/openid-configuration`

---

## Development Configuration

When building a new app locally, the CEFC auth flow still works, but the shared auth server at `id.cefc.org.sg` must be configured with the exact callback URL your local app will use. OIDC redirect URIs are exact-match, so `localhost`, `127.0.0.1`, and your LAN IP are treated as different origins.

### Register local redirect URIs

In the app registration at `https://id.cefc.org.sg/admin/apps`, add any local callback URLs you plan to use:

```
http://localhost:3001/api/auth/oauth2/callback/cefc-auth
http://127.0.0.1:3001/api/auth/oauth2/callback/cefc-auth
http://192.168.1.50:3001/api/auth/oauth2/callback/cefc-auth
```

Replace `192.168.1.50` with your development machine's actual LAN IP if you want to test from another device on the same network.

### Local `.env.local` example

For browser testing on the same machine:

```env
BETTER_AUTH_SECRET=<random 32+ char string>
BETTER_AUTH_URL=http://localhost:3001
NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3001

AUTH_CLIENT_ID=<dev client id>
AUTH_CLIENT_SECRET=<dev client secret>
AUTH_DISCOVERY_URL=https://id.cefc.org.sg/api/auth/.well-known/openid-configuration

DATABASE_URL=postgresql://user:password@host:5432/your_app_db
```

If you are testing from a phone, tablet, or another computer on the LAN, switch both app URLs to your machine's LAN IP:

```env
BETTER_AUTH_URL=http://192.168.1.50:3001
NEXT_PUBLIC_BETTER_AUTH_URL=http://192.168.1.50:3001
```

### Recommended setup

Use a separate app registration for development rather than reusing production credentials. A typical split:

- **Production app registration:**
  `https://yourapp.cefc.org.sg/api/auth/oauth2/callback/cefc-auth`
- **Development app registration:**
  `http://localhost:3001/api/auth/oauth2/callback/cefc-auth`
  `http://127.0.0.1:3001/api/auth/oauth2/callback/cefc-auth`
  `http://192.168.1.50:3001/api/auth/oauth2/callback/cefc-auth`

This keeps local testing isolated from production and avoids accidental redirect URI mismatches.

### Cookie behavior in local development

When `BETTER_AUTH_URL` uses `http://`, Better Auth uses the cookie name `better-auth.session_token`.
When `BETTER_AUTH_URL` uses `https://`, Better Auth uses `__Secure-better-auth.session_token`.

Keep the proxy check for both cookie names so the same code works in local and production environments.

### Common local failure modes

- **`invalid_client`** — Re-check the client secret for trailing whitespace or copy/paste corruption.
- **Redirect URI mismatch** — Ensure the exact local origin you opened in the browser is registered in the auth server.
- **Callback works on `localhost` but not on phone/tablet** — Use your LAN IP in both the app URL env vars and the registered redirect URI.
- **App loads but sign-in silently fails in Docker** — Make sure `NEXT_PUBLIC_BETTER_AUTH_URL` is passed as a Docker build arg, not only at runtime.

---

## Support

Contact IT admin at paul.chan@cefc.org.sg or the CEFC IT channel.
