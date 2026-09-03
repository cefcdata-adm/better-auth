# Multi-App OIDC Architecture — Design Spec

**Goal:** Transform the auth server into a shared OIDC identity provider serving all CEFC apps, with per-app access control, per-app session configuration, and a standalone integration guide for new app developers.

**Architecture:** better-auth's `oidcProvider` plugin turns `auth.cefc.org.sg` into a standards-compliant OIDC authorization server. Each client app (Next.js) uses better-auth's `genericOAuth` plugin configured to point at the auth server. Access is binary per app — the auth server checks `app_access` before issuing tokens. App-specific roles and permissions are the client app's own responsibility.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, better-auth v1.6.11 (`oidcProvider` + `admin` plugins), Drizzle ORM, PostgreSQL, Nodemailer (Mandrill SMTP)

---

## Principles

- **One identity, many apps.** A single user account works across all CEFC apps.
- **Per-app sessions.** Each app manages its own session independently. Logging into collab does not log you into meetings.
- **Binary access.** The auth server only decides yes/no per app. What authenticated users can do within an app is the app's business.
- **Mobile-ready from day one.** PKCE is supported at registration time. No server changes needed when a React Native app is added.

---

## Data Model

### New: `oidc_clients`

Registered app registry. Each row is one CEFC app.

| Column | Type | Notes |
|---|---|---|
| `id` | text | primary key — the `client_id` (e.g. `collab`) |
| `name` | text | human-readable app name (e.g. `CEFC Collab`) |
| `client_secret` | text | hashed with bcrypt |
| `redirect_uris` | text[] | allowed OAuth callback URLs |
| `subdomain` | text | e.g. `collab.cefc.org.sg` |
| `session_timeout` | integer | seconds — overrides the auth server default (28800 = 8h) |
| `created_at` | timestamp | |

### New: `app_access`

Binary user ↔ app access grant.

| Column | Type | Notes |
|---|---|---|
| `user_id` | text | FK → `user.id` |
| `client_id` | text | FK → `oidc_clients.id` |
| `granted_at` | timestamp | |
| PK | | `(user_id, client_id)` |

### Modified: `access_requests`

Add `client_id text NOT NULL` column (FK → `oidc_clients.id`). Every request is now tied to a specific app.

---

## Auth Server Changes

### 1. OIDC Provider Plugin

Add `oidcProvider()` to `auth.ts` plugins. This exposes:
- `GET /oauth/authorize` — authorization endpoint
- `POST /oauth/token` — token exchange endpoint
- `GET /.well-known/openid-configuration` — discovery document
- `GET /.well-known/jwks.json` — public keys for token verification

Access control hook: before issuing an authorization code, check `app_access` for `(user_id, client_id)`. If no row exists, redirect to `/no-access?client_id=<id>` instead of issuing a code.

Session timeout: read `oidc_clients.session_timeout` for the requesting client and apply it to the issued session. Falls back to the global 8h default if not set.

### 2. No-Access Page (`/no-access`)

Shown when a user authenticates successfully but has no access to the requested app. Displays the app name. Includes a link to `/request-access?client_id=<id>`.

### 3. Request-Access Flow (updated)

`/request-access` accepts a `client_id` query param. The page heading reads "Request access to [App Name]". The `client_id` is stored on the `access_requests` row.

On approval:
1. Create user account if it doesn't exist (`auth.api.createUser`)
2. Insert row into `app_access` for `(user_id, client_id)`
3. Send set-password email if account was just created (subject: "Set your [App Name] password")
4. Mark request approved

All emails (admin notification, approval, rejection) pull the app name from `oidc_clients.name`.

### 4. Admin UI Additions

**Apps tab** (new, in `/admin`) — table of registered apps with columns: Name, Subdomain, Session Timeout, Created. Actions: Edit, Delete. Create button opens a form: name, subdomain, redirect URIs, session timeout. Generating a new app produces a `client_id` (derived from name, slugified) and a random `client_secret` (shown once, then stored hashed).

**Access management** (extend Users tab) — per user row, add a "Manage Access" action that opens a panel listing all registered apps with a toggle (granted / not granted) for each.

---

## Client App Integration Guide

> The standalone guide is the authoritative reference for new app developers. It is saved separately at `docs/integration-guide.md`. The spec below summarises the content; the guide contains the full copy-paste-ready code.

### What the guide covers

1. **Register the app** — admin console → Apps tab → Create app → copy `client_id` and `client_secret`
2. **Install better-auth** — `npm install better-auth`
3. **Configure auth** — `lib/auth.ts` using `genericOAuth` plugin pointing to `https://auth.cefc.org.sg`
4. **Set up API route** — `app/api/auth/[...all]/route.ts`
5. **Configure middleware** — protect routes; redirect unauthenticated users to `/sign-in`
6. **Sign-in page** — single "Sign in with CEFC" button; no password fields
7. **Environment variables** — `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`
8. **What the session contains** — `user.id`, `user.name`, `user.email` from OIDC ID token
9. **App-level permissions** — store roles in the app's own DB keyed on `user.id`
10. **Mobile (React Native)** — register a separate client with `pkce: true`, no `client_secret`; use `expo-auth-session`

### Discovery URL

```
https://auth.cefc.org.sg/.well-known/openid-configuration
```

All OIDC configuration (token endpoint, JWKS URI, scopes supported) is available at this URL. Client apps should use it via `discoveryUrl` rather than hardcoding individual endpoints.

---

## File Map

| File | Action |
|---|---|
| `lib/schema.ts` | Modify — add `oidcClients`, `appAccess` tables; add `clientId` to `accessRequests` |
| `lib/auth.ts` | Modify — add `oidcProvider` plugin |
| `app/no-access/page.tsx` | Create — no-access page with app name and request-access link |
| `app/request-access/page.tsx` | Modify — accept `client_id` param, show app name, pass to API |
| `app/api/access-requests/route.ts` | Modify — store `client_id` on insert; notify admin with app name |
| `app/api/access-requests/[id]/approve/route.ts` | Modify — insert `app_access` row on approval; app-aware emails |
| `app/api/access-requests/[id]/reject/route.ts` | Modify — app-aware rejection email |
| `app/admin/layout.tsx` | Modify — add Apps nav link to sidebar |
| `app/admin/apps/page.tsx` | Create — app registry management UI |
| `app/admin/users/page.tsx` | Modify — add per-user access management panel |
| `docs/integration-guide.md` | Create — standalone developer guide |
