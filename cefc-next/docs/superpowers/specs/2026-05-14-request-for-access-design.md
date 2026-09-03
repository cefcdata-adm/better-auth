# Request for Access — Design Spec

**Goal:** Allow unauthenticated users to submit a request for an account. IT admins review and approve or reject requests in the admin console. Approval auto-creates the account and emails the user a link to set their password. Rejection sends a notification email.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, better-auth admin plugin, Drizzle ORM, PostgreSQL, Nodemailer (Mandrill SMTP)

---

## Data Layer

New `access_requests` table added to `lib/schema.ts` via Drizzle and migrated with `drizzle-kit push`.

| Column | Type | Notes |
|---|---|---|
| `id` | text | primary key |
| `name` | text | requester's full name |
| `email` | text | requester's email address |
| `status` | text | `pending` \| `approved` \| `rejected` |
| `createdAt` | timestamp | when the request was submitted |
| `reviewedAt` | timestamp | when the request was actioned (nullable) |

No foreign key to the `user` table — approved requests create a new user row but the request record stands alone.

---

## Email Utility

`lib/email.ts` — Nodemailer transporter configured from environment variables:

```
SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
```

Exports a single `sendEmail({ to, subject, html })` function used by the API routes. No other files import nodemailer directly.

---

## API Routes

### `POST /api/access-requests`
**Auth:** Public (no session required)

1. Validate `name` and `email` are present
2. Check `user` table — reject with 409 if email already has an account
3. Check `access_requests` table — reject with 409 if a pending request already exists for this email
4. Insert row with `status = 'pending'`
5. Return 201

### `POST /api/access-requests/[id]/approve`
**Auth:** Admin only (check session role = `admin`)

1. Load request row — 404 if not found
2. Create user account via `auth.api.createUser` (better-auth admin plugin, server-side) with a random temporary password
3. Trigger password reset via `auth.api.forgetPassword` so the user receives a "set your password" email from better-auth
4. Update request row: `status = 'approved'`, `reviewedAt = now()`
5. Return 200

### `POST /api/access-requests/[id]/reject`
**Auth:** Admin only (check session role = `admin`)

1. Load request row — 404 if not found
2. Send rejection email via `lib/email.ts` to the requester's email
3. Update request row: `status = 'rejected'`, `reviewedAt = now()`
4. Return 200

---

## UI Changes

### Sign-in page (`app/sign-in/page.tsx`)
Update the "Request for Access" link from `href="#"` to `href="/request-access"`. No other changes.

### New page: `/request-access` (`app/request-access/page.tsx`)
- Same dark background and card styling as the sign-in page
- Form: Name field + Email field + Submit button
- On submit: `POST /api/access-requests`
- On success: replace form with a confirmation message — "Your request has been submitted. We'll be in touch."
- On error (already registered, already requested): show inline error message

### Admin Users page (`app/admin/users/page.tsx`)
Add two tabs at the top: **Users** and **Requests**.

- **Users tab** — existing user table, unchanged
- **Requests tab** — new table showing `pending` requests only, columns: Name, Email, Submitted, Actions

### New component: `app/admin/users/RequestActions.tsx`
Client component rendered per row in the Requests tab.

- **Approve** button → `POST /api/access-requests/[id]/approve` → calls `onRefresh()`
- **Reject** button → `POST /api/access-requests/[id]/reject` → calls `onRefresh()`

---

## File Map

| File | Action |
|---|---|
| `lib/schema.ts` | Modify — add `accessRequests` table |
| `lib/email.ts` | Create — Nodemailer sendEmail utility |
| `app/api/access-requests/route.ts` | Create — POST submit handler |
| `app/api/access-requests/[id]/approve/route.ts` | Create — POST approve handler |
| `app/api/access-requests/[id]/reject/route.ts` | Create — POST reject handler |
| `app/request-access/page.tsx` | Create — request form page |
| `app/sign-in/page.tsx` | Modify — update "Request for Access" href |
| `app/admin/users/page.tsx` | Modify — add Users/Requests tabs |
| `app/admin/users/RequestActions.tsx` | Create — approve/reject buttons |
