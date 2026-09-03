# Request for Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow unauthenticated users to submit an access request (name + email); admins approve or reject from the admin console; approval auto-creates the account and emails a set-password link; rejection sends a notification email.

**Architecture:** Custom `access_requests` Drizzle table stores requests. Three Next.js API routes handle submit/approve/reject. Email is sent via Nodemailer (Mandrill SMTP). The approve route calls `auth.api.signUpEmail` to create the account then `auth.api.forgetPassword` to trigger a set-password email through better-auth's `sendResetPasswordEmail` hook. Admin UI adds a Requests tab to the existing Users page.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, better-auth 1.6.11 (admin plugin), Drizzle ORM, PostgreSQL, Nodemailer

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/schema.ts` | Modify | Add `accessRequests` table |
| `lib/email.ts` | Create | Nodemailer `sendEmail` utility |
| `lib/auth.ts` | Modify | Add `sendResetPasswordEmail` hook to wire password-reset emails through SMTP |
| `app/reset-password/page.tsx` | Create | Page where users set their password after clicking the reset link |
| `app/api/access-requests/route.ts` | Create | `GET` (admin list) + `POST` (public submit) |
| `app/api/access-requests/[id]/approve/route.ts` | Create | `POST` — admin approve handler |
| `app/api/access-requests/[id]/reject/route.ts` | Create | `POST` — admin reject handler |
| `app/request-access/page.tsx` | Create | Request form page (name + email) |
| `app/sign-in/page.tsx` | Modify | Update "Request for Access" href from `#` to `/request-access` |
| `app/admin/users/page.tsx` | Modify | Add Users / Requests tabs |
| `app/admin/users/RequestActions.tsx` | Create | Approve / Reject buttons per request row |

---

### Task 1: Add accessRequests table to schema and migrate

**Files:**
- Modify: `lib/schema.ts`

- [ ] **Step 1: Add the accessRequests table to `lib/schema.ts`**

Open `lib/schema.ts` and append the following after the last export (after `accountRelations`):

```ts
export const accessRequests = pgTable("access_requests", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
});
```

No relations needed — this table stands alone.

- [ ] **Step 2: Push the schema to the database**

```bash
cd /Users/paul.chan/better-auth/cefc-next
DATABASE_URL=postgresql://localhost:5432/cefc_auth npx drizzle-kit push
```

Expected output: `[✓] Changes applied` (or similar — it creates the `access_requests` table).

- [ ] **Step 3: Verify the table exists**

```bash
psql cefc_auth -c "\d access_requests"
```

Expected: table with columns `id`, `name`, `email`, `status`, `created_at`, `reviewed_at`.

- [ ] **Step 4: Commit**

```bash
git add lib/schema.ts
git commit -m "feat: add access_requests table"
```

---

### Task 2: Install nodemailer and create email utility

**Files:**
- Create: `lib/email.ts`

- [ ] **Step 1: Install nodemailer**

```bash
cd /Users/paul.chan/better-auth/cefc-next
npm install nodemailer
npm install --save-dev @types/nodemailer
```

Expected: packages added to `node_modules`, `package.json` updated.

- [ ] **Step 2: Create `lib/email.ts`**

```ts
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    html,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/email.ts package.json package-lock.json
git commit -m "feat: add nodemailer email utility"
```

---

### Task 3: Wire password-reset email through SMTP in auth.ts

**Files:**
- Modify: `lib/auth.ts`

This step adds a `sendResetPasswordEmail` callback to better-auth so that when the approve route calls `auth.api.forgetPassword`, the email goes out via Mandrill SMTP instead of nowhere.

- [ ] **Step 1: Update `lib/auth.ts`**

Replace the entire file with:

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { db } from "./db";
import * as schema from "./schema";
import { sendEmail } from "./email";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    sendResetPasswordEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Set your CEFC Woodlands password",
        html: `
          <p>Hi ${user.name},</p>
          <p>Your access request has been approved. Click the link below to set your password and sign in:</p>
          <p><a href="${url}">Set my password</a></p>
          <p>This link expires in 1 hour. If you did not request access, you can ignore this email.</p>
          <br/>
          <p>CEFC Woodlands IT</p>
        `,
      });
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID as string,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET as string,
    },
  },
  plugins: [
    admin({
      adminUserIds: [process.env.ADMIN_USER_ID!],
    }),
  ],
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /Users/paul.chan/better-auth/cefc-next
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/auth.ts
git commit -m "feat: wire password-reset email through SMTP"
```

---

### Task 4: Create /reset-password page

**Files:**
- Create: `app/reset-password/page.tsx`

When better-auth sends the "set your password" email, the link points to `{BETTER_AUTH_URL}/reset-password?token=...`. This page handles that URL.

- [ ] **Step 1: Create `app/reset-password/page.tsx`**

```tsx
"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { error } = await authClient.resetPassword({ newPassword: password, token });
      if (error) {
        setError(error.message ?? "Failed to set password. The link may have expired.");
      } else {
        setDone(true);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="text-center">
        <h2 className="text-xl font-bold text-white mb-2">Password set!</h2>
        <p className="text-zinc-400 text-sm mb-6">You can now sign in with your new password.</p>
        <button
          onClick={() => router.push("/sign-in")}
          className="px-6 py-2.5 rounded-lg bg-purple-700 hover:bg-purple-600 text-white font-semibold text-sm transition-colors"
        >
          Go to Sign In
        </button>
      </div>
    );
  }

  return (
    <>
      <h2 className="text-xl font-bold text-white text-center mb-1">Set your password</h2>
      <p className="text-zinc-400 text-sm text-center mb-6">Choose a password to activate your account</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-white mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
            autoComplete="new-password"
            className="w-full px-3 py-2.5 rounded-lg bg-[#1c1c1c] border border-zinc-600 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-purple-500"
          />
        </div>
        <div>
          <label htmlFor="confirm" className="block text-sm font-medium text-white mb-1">
            Confirm password
          </label>
          <input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repeat your password"
            required
            autoComplete="new-password"
            className="w-full px-3 py-2.5 rounded-lg bg-[#1c1c1c] border border-zinc-600 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-purple-500"
          />
        </div>
        {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          aria-busy={loading}
          className="w-full py-2.5 rounded-lg bg-purple-700 hover:bg-purple-600 text-white font-semibold text-sm transition-colors disabled:opacity-50"
        >
          {loading ? "Setting password..." : "Set Password"}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex h-screen bg-[#1c1c1c] items-center justify-center px-8">
      <div className="w-full max-w-sm bg-[#2a2a2a] rounded-xl p-8 border border-zinc-700">
        <Suspense fallback={<p className="text-zinc-400 text-sm text-center">Loading...</p>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/reset-password/page.tsx
git commit -m "feat: add reset-password page"
```

---

### Task 5: Create access-requests API route (GET + POST)

**Files:**
- Create: `app/api/access-requests/route.ts`

- [ ] **Step 1: Create `app/api/access-requests/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user, accessRequests } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || (session.user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db
    .select()
    .from(accessRequests)
    .orderBy(accessRequests.createdAt);

  return NextResponse.json({ requests: rows });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();

  if (!name || !email) {
    return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
  }

  const existingUser = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (existingUser.length > 0) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const existingRequest = await db
    .select({ id: accessRequests.id })
    .from(accessRequests)
    .where(and(eq(accessRequests.email, email), eq(accessRequests.status, "pending")))
    .limit(1);
  if (existingRequest.length > 0) {
    return NextResponse.json({ error: "A pending request for this email already exists." }, { status: 409 });
  }

  await db.insert(accessRequests).values({
    id: randomUUID(),
    name,
    email,
    status: "pending",
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Test with curl**

Start dev server (`npm run dev`) in another terminal, then:

```bash
curl -s -X POST http://localhost:3000/api/access-requests \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"testuser@example.com"}' | jq .
```

Expected: `{"ok":true}`

```bash
# Duplicate request should return 409
curl -s -X POST http://localhost:3000/api/access-requests \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"testuser@example.com"}' | jq .
```

Expected: `{"error":"A pending request for this email already exists."}`

- [ ] **Step 4: Commit**

```bash
git add app/api/access-requests/route.ts
git commit -m "feat: add access-requests API (GET list + POST submit)"
```

---

### Task 6: Create admin approve API route

**Files:**
- Create: `app/api/access-requests/[id]/approve/route.ts`

- [ ] **Step 1: Create directory and file**

Create `app/api/access-requests/[id]/approve/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { accessRequests } from "@/lib/schema";
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

  const rows = await db
    .select()
    .from(accessRequests)
    .where(eq(accessRequests.id, id))
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  const accessRequest = rows[0];

  await auth.api.signUpEmail({
    body: {
      name: accessRequest.name,
      email: accessRequest.email,
      password: randomUUID(),
    },
  });

  await auth.api.forgetPassword({
    body: {
      email: accessRequest.email,
      redirectTo: `${process.env.BETTER_AUTH_URL}/sign-in`,
    },
  });

  await db
    .update(accessRequests)
    .set({ status: "approved", reviewedAt: new Date() })
    .where(eq(accessRequests.id, id));

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/api/access-requests/[id]/approve/route.ts"
git commit -m "feat: add admin approve access-request API"
```

---

### Task 7: Create admin reject API route

**Files:**
- Create: `app/api/access-requests/[id]/reject/route.ts`

- [ ] **Step 1: Create `app/api/access-requests/[id]/reject/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { accessRequests } from "@/lib/schema";
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

  const rows = await db
    .select()
    .from(accessRequests)
    .where(eq(accessRequests.id, id))
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  const accessRequest = rows[0];

  await sendEmail({
    to: accessRequest.email,
    subject: "Your CEFC Woodlands access request",
    html: `
      <p>Hi ${accessRequest.name},</p>
      <p>Thank you for your interest in CEFC Woodlands collaboration tools.</p>
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

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/api/access-requests/[id]/reject/route.ts"
git commit -m "feat: add admin reject access-request API"
```

---

### Task 8: Create /request-access page and update sign-in link

**Files:**
- Create: `app/request-access/page.tsx`
- Modify: `app/sign-in/page.tsx`

- [ ] **Step 1: Create `app/request-access/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";

export default function RequestAccessPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase() }),
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
              Submit your details and an IT admin will review your request.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-white mb-1">
                  Full name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  required
                  autoComplete="name"
                  className="w-full px-3 py-2.5 rounded-lg bg-[#1c1c1c] border border-zinc-600 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-white mb-1">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Your email address"
                  required
                  autoComplete="email"
                  className="w-full px-3 py-2.5 rounded-lg bg-[#1c1c1c] border border-zinc-600 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-purple-500"
                />
              </div>
              {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="w-full py-2.5 rounded-lg bg-purple-700 hover:bg-purple-600 text-white font-semibold text-sm transition-colors disabled:opacity-50"
              >
                {loading ? "Submitting..." : "Submit Request"}
              </button>
            </form>
            <div className="mt-6 text-center">
              <Link href="/sign-in" className="text-purple-400 text-sm hover:underline">
                Back to sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update sign-in link in `app/sign-in/page.tsx`**

Find line 153 in `app/sign-in/page.tsx`:

```tsx
            <a href="#" className="text-purple-400 text-sm hover:underline">
              Request for Access
            </a>
```

Replace with:

```tsx
            <a href="/request-access" className="text-purple-400 text-sm hover:underline">
              Request for Access
            </a>
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/request-access/page.tsx app/sign-in/page.tsx
git commit -m "feat: add request-access page and update sign-in link"
```

---

### Task 9: Create RequestActions component and update admin users page with tabs

**Files:**
- Create: `app/admin/users/RequestActions.tsx`
- Modify: `app/admin/users/page.tsx`

- [ ] **Step 1: Create `app/admin/users/RequestActions.tsx`**

```tsx
"use client";

type AccessRequest = {
  id: string;
  name: string;
  email: string;
  createdAt: string | Date;
};

type Props = {
  request: AccessRequest;
  onRefresh: () => void;
};

export function RequestActions({ request, onRefresh }: Props) {
  async function handleApprove() {
    await fetch(`/api/access-requests/${request.id}/approve`, { method: "POST" });
    onRefresh();
  }

  async function handleReject() {
    if (!confirm(`Reject access request from ${request.name} (${request.email})?`)) return;
    await fetch(`/api/access-requests/${request.id}/reject`, { method: "POST" });
    onRefresh();
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleApprove}
        className="px-3 py-1 rounded text-xs font-medium bg-green-900 text-green-200 hover:bg-green-800 transition-colors"
      >
        Approve
      </button>
      <button
        onClick={handleReject}
        className="px-3 py-1 rounded text-xs font-medium bg-red-900 text-red-200 hover:bg-red-800 transition-colors"
      >
        Reject
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Replace `app/admin/users/page.tsx` with the tabbed version**

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { authClient } from "@/lib/auth-client";
import { UserActions } from "./UserActions";
import { RequestActions } from "./RequestActions";

type User = {
  id: string;
  name: string;
  email: string;
  role: string | null | undefined;
  banned: boolean | null | undefined;
  createdAt: Date | string;
};

type AccessRequest = {
  id: string;
  name: string;
  email: string;
  status: string;
  createdAt: string | Date;
};

export default function UsersPage() {
  const [tab, setTab] = useState<"users" | "requests">("users");

  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState("");

  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestsError, setRequestsError] = useState("");

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError("");
    try {
      const { data } = await authClient.admin.listUsers({ query: { limit: 100 } });
      setUsers((data?.users as User[]) ?? []);
    } catch {
      setUsersError("Failed to load users. Make sure you are signed in as an admin.");
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const fetchRequests = useCallback(async () => {
    setRequestsLoading(true);
    setRequestsError("");
    try {
      const res = await fetch("/api/access-requests");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setRequests(data.requests ?? []);
    } catch {
      setRequestsError("Failed to load requests.");
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchRequests();
  }, [fetchUsers, fetchRequests]);

  const tabClass = (active: boolean) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      active
        ? "bg-zinc-700 text-white"
        : "text-zinc-400 hover:text-white"
    }`;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Users</h1>
        <p className="text-zinc-400 text-sm mt-1">Manage all CEFC Woodlands user accounts</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button className={tabClass(tab === "users")} onClick={() => setTab("users")}>
          Users
        </button>
        <button className={tabClass(tab === "requests")} onClick={() => setTab("requests")}>
          Requests
          {requests.filter((r) => r.status === "pending").length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 rounded-full bg-purple-700 text-purple-100 text-xs">
              {requests.filter((r) => r.status === "pending").length}
            </span>
          )}
        </button>
      </div>

      {/* Users Tab */}
      {tab === "users" && (
        <>
          {usersLoading && <p className="text-zinc-400 text-sm">Loading users...</p>}
          {usersError && <p role="alert" className="text-red-400 text-sm">{usersError}</p>}
          {!usersLoading && !usersError && (
            <div className="bg-[#2a2a2a] rounded-xl border border-zinc-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-700">
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Name</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Email</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Role</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Status</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Created</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-zinc-800 hover:bg-zinc-800/40 transition-colors">
                      <td className="px-4 py-3 text-white font-medium">{user.name}</td>
                      <td className="px-4 py-3 text-zinc-300">{user.email}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          user.role === "admin"
                            ? "bg-purple-900 text-purple-200"
                            : "bg-zinc-700 text-zinc-300"
                        }`}>
                          {user.role ?? "user"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          user.banned
                            ? "bg-red-900 text-red-200"
                            : "bg-green-900 text-green-200"
                        }`}>
                          {user.banned ? "Banned" : "Active"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-400">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <UserActions user={user} onRefresh={fetchUsers} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {users.length === 0 && (
                <p className="text-center text-zinc-500 text-sm py-8">No users found.</p>
              )}
            </div>
          )}
        </>
      )}

      {/* Requests Tab */}
      {tab === "requests" && (
        <>
          {requestsLoading && <p className="text-zinc-400 text-sm">Loading requests...</p>}
          {requestsError && <p role="alert" className="text-red-400 text-sm">{requestsError}</p>}
          {!requestsLoading && !requestsError && (
            <div className="bg-[#2a2a2a] rounded-xl border border-zinc-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-700">
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Name</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Email</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Submitted</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests
                    .filter((r) => r.status === "pending")
                    .map((request) => (
                      <tr key={request.id} className="border-b border-zinc-800 hover:bg-zinc-800/40 transition-colors">
                        <td className="px-4 py-3 text-white font-medium">{request.name}</td>
                        <td className="px-4 py-3 text-zinc-300">{request.email}</td>
                        <td className="px-4 py-3 text-zinc-400">
                          {new Date(request.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <RequestActions request={request} onRefresh={fetchRequests} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {requests.filter((r) => r.status === "pending").length === 0 && (
                <p className="text-center text-zinc-500 text-sm py-8">No pending requests.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/admin/users/RequestActions.tsx app/admin/users/page.tsx
git commit -m "feat: add Requests tab to admin users page with approve/reject actions"
```

---

### Task 10: Manual end-to-end verification

- [ ] **Step 1: Ensure dev server is running**

```bash
npm run dev
```

Note the port (3000 or 3001).

- [ ] **Step 2: Test Request for Access form**

Visit `http://localhost:<port>/sign-in`. Click "Request for Access" — should navigate to `/request-access`. Fill in a name and a new email address not already in the system. Submit. Expected: "Your request has been submitted. We'll be in touch."

- [ ] **Step 3: Verify request appears in admin console**

Sign in as `paul.chan@cefc.org.sg` and visit `/admin/users`. Click the "Requests" tab. Expected: the submitted request appears with name, email, and submitted date. A purple badge on the tab shows the count.

- [ ] **Step 4: Test Approve**

Click "Approve" on the request. Expected: row disappears from Requests tab. Check email inbox of the requester — they should receive "Set your CEFC Woodlands password" email with a set-password link.

- [ ] **Step 5: Test set-password link**

Click the link in the approval email. Expected: lands on `/reset-password`. Set a new password. Expected: "Password set!" confirmation. Click "Go to Sign In" and sign in with the new credentials. Expected: lands on `/dashboard`.

- [ ] **Step 6: Test Reject**

Submit another request with a different email. In the admin console, click "Reject" and confirm. Expected: request disappears. Requester receives a rejection email.

- [ ] **Step 7: Test duplicate protection**

Submit a request with an email that already has an account. Expected: "An account with this email already exists."
