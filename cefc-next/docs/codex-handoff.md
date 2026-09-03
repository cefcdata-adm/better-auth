# CEFC Auth Server — Codex Handoff

## What this project is

A self-hosted OIDC authentication server for CEFC Woodlands (a church). It is the **single sign-on source of truth** for all CEFC apps. Other apps (Next.js, React Native, etc.) authenticate their users against this server via OIDC/OAuth2.

Built with: **Next.js 16 App Router**, **better-auth v1.6.11**, **Drizzle ORM**, **PostgreSQL**, **Nodemailer**.

Production URL: `https://id.cefc.org.sg`

---

## Architecture overview

```
cefc-next/
├── lib/
│   ├── auth.ts          # better-auth instance (oidcProvider + admin plugins)
│   ├── auth-client.ts   # client-side auth client
│   ├── schema.ts        # Drizzle schema (all tables)
│   ├── db.ts            # Drizzle + pg pool
│   └── email.ts         # Nodemailer transporter + escapeHtml helper
│
├── app/
│   ├── api/auth/[...all]/   # better-auth catch-all handler
│   ├── api/access-requests/ # public POST (submit request), admin GET (list)
│   │   └── [id]/
│   │       ├── approve/     # admin POST — creates user + grants app access
│   │       └── reject/      # admin POST — marks rejected + notifies requester
│   ├── api/admin/
│   │   ├── apps/            # CRUD for registered OAuth apps
│   │   │   └── [id]/
│   │   │       └── users/   # GET users who have access to a given app
│   │   └── access/          # GET/POST/DELETE per-user app access grants
│   │
│   ├── admin/               # Admin UI (server components, session-gated)
│   │   ├── layout.tsx       # auth guard — role === "admin" required
│   │   ├── users/           # user list, access panel, approve/reject actions
│   │   └── apps/            # app list, register app, per-app user panel
│   │
│   ├── oauth/consent/       # OIDC consent gate — checks app_access, auto-consents
│   ├── no-access/           # shown when user has no app_access row
│   ├── request-access/      # public form to submit an access request
│   ├── sign-in/             # redirects to better-auth sign-in
│   ├── reset-password/      # password reset page
│   └── dashboard/           # post-login landing for the auth server itself
│
├── middleware.ts            # cookie presence check; redirects to /sign-in
└── docs/
    ├── app-operations.md   # start/stop/restart/logs guide for the production app
    ├── production-install.md # production install and remediation guide
    ├── integration-guide.md # how to connect a new Next.js app to this auth server
    └── codex-handoff.md     # this file
```

---

## Database schema (lib/schema.ts)

| Table | Purpose |
|---|---|
| `user` | All users. Has `role` column (null = regular user, "admin" = admin). |
| `session` | Active sessions. Cascade-deletes on user delete. |
| `account` | OAuth provider links (Google, Microsoft). Cascade-deletes on user delete. |
| `verification` | Email verification / password reset tokens. |
| `oauth_application` | Registered OIDC client apps. `metadata` col stores JSON `{ subdomain, sessionTimeout }`. |
| `oauth_access_token` | Issued OIDC tokens. |
| `oauth_consent` | Consent records per user per app. |
| `app_access` | **Binary access control.** Composite PK `(userId, clientId)`. A row = user is allowed into that app. Cascade-deletes on user or app delete. |
| `access_requests` | Inbound access requests. Stores name+email directly — **no userId FK** (intentional; requests arrive before the user account exists). Orphaned pending requests on user delete are an accepted edge case. |

---

## Key flows

### OIDC login flow (client app → auth server → back)
1. Client app's `/sign-in` page calls `authClient.signIn.oauth2({ providerId: "cefc-auth" })`
2. Redirects to this server's `/api/auth/oauth2/authorize`
3. User authenticates (email/password, Google, or Microsoft)
4. Auth server redirects to `/oauth/consent?consent_code=...&client_id=...`
5. Consent page checks `app_access` table. If no row → `/no-access`. If row exists → auto-consent, redirect back to client with auth code.
6. Client exchanges code for tokens at `/api/auth/token`

### Access request → approval flow
1. User submits form at `/request-access` → `POST /api/access-requests`
2. Admin sees request in admin console → clicks Approve
3. `POST /api/access-requests/[id]/approve`:
   - Creates user account if new (randomUUID password)
   - Inserts `app_access` row
   - If new user: fires password reset email (fire-and-forget)
   - If existing user: fires "access granted" notification email (fire-and-forget)
4. Admin can also Reject → fires rejection email (fire-and-forget)

### Admin role
- Set via `adminUserIds: [process.env.ADMIN_USER_ID]` in `lib/auth.ts`
- OR by setting `role = "admin"` directly on the `user` row
- Admin UI is at `/admin/users` and `/admin/apps`
- All admin API routes check `session.user.role === "admin"` server-side

---

## Auth configuration (lib/auth.ts)

```ts
plugins: [
  admin({ adminUserIds: [process.env.ADMIN_USER_ID!] }),
  oidcProvider({
    loginPage: "/sign-in",
    consentPage: "/oauth/consent",
    allowDynamicClientRegistration: false,  // only admin can register apps
    storeClientSecret: "hashed",
    scopes: ["openid", "profile", "email"],
  }),
]
```

Social providers: Google + Microsoft (env vars `GOOGLE_CLIENT_ID`, `MICROSOFT_CLIENT_ID`, etc.)

---

## Environment variables

```
BETTER_AUTH_SECRET        # 32+ char random secret
BETTER_AUTH_URL           # https://id.cefc.org.sg (or http://localhost:3000)
ADMIN_USER_ID             # ID of the admin user (from user table)

DATABASE_URL              # PostgreSQL connection string

GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET

SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM
```

---

## Security posture (as of 2026-05-15)

**Recently fixed (this session):**
- HTML injection in transactional emails — user-supplied `name`/`email`/`appName` are now run through `escapeHtml()` before interpolation into email HTML bodies (`lib/email.ts`)
- Admin action latency — reject email is now fire-and-forget (matching approve), so SMTP delays don't block the API response
- Rate limiting — `POST /api/access-requests` enforces 10 req/IP/min via `next-rate-limit` (in-memory, resets on restart — acceptable for single-server deployment)

**Known accepted gaps:**
- `access_requests` has no userId FK and no cascade delete — orphaned pending rows on user delete are an accepted edge case (won't surface to users unless they somehow have a pending request while being deleted)
- Rate limiter is in-memory only — does not survive server restarts or scale across multiple instances

**What is safe:**
- All DB queries use Drizzle ORM parameterised queries — no SQL injection risk
- No `dangerouslySetInnerHTML` anywhere in JSX — React handles escaping in all UI
- All admin API routes have server-side session + role checks
- OIDC redirect URIs are validated by better-auth against registered app URIs — no open redirect from consent page
- Client secrets are stored hashed (`storeClientSecret: "hashed"`)

---

## Things Codex should look at

1. **Input validation on access request POST** — `name` and `email` are only trimmed/lowercased. No server-side email format validation or max-length enforcement.

2. **`app/api/admin/apps/[id]/route.ts` PATCH** — `body.name`, `body.subdomain`, `body.redirectUris`, `body.sessionTimeout` are taken directly from request body. No length or format validation on any of them. A very long `name` or a non-numeric `sessionTimeout` gets stored as-is (though `Number()` coerces the timeout).

3. **`app/api/admin/access/route.ts`** — POST/DELETE take `userId` and `clientId` from the request body with no existence check. Granting access to a non-existent user or non-existent app silently fails (DB constraint would catch it, but returns a 500 rather than a 400).

4. **Admin notification query** (`access-requests/route.ts:80`) — fetches ALL users from the DB to filter admins in JS. Fine at church scale; would need a `WHERE role = 'admin' OR id = $adminId` query if the user table grows large.

5. **`oauthApplication.metadata`** is stored as a raw JSON string in Postgres (`text` column). The GET route in `admin/apps/route.ts` does `JSON.parse(a.metadata ?? "{}")` — if the column ever contains malformed JSON this throws an unhandled error.

6. **No CSRF protection on admin action routes** — the admin API routes (`approve`, `reject`, `grant access`, `revoke access`) rely purely on the session cookie. better-auth may add a CSRF header check; worth verifying. If not, a CSRF token or `SameSite=Strict` cookie policy would close this.

7. **Password reset link in approval email** — uses `BETTER_AUTH_URL` env var as the base. If this var is misconfigured, the link in the new-user activation email points to the wrong host.

---

## How to run locally

```bash
cd cefc-next
cp .env.local.example .env.local   # fill in values
npm install
npm run dev                         # http://localhost:3000
```

Database migrations are managed with Drizzle Kit:
```bash
npx drizzle-kit push   # apply schema to DB
```
