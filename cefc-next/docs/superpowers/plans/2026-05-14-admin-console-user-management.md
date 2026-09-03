# Admin Console — User Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a protected `/admin/users` page where IT admins can list, ban/unban, change roles, and delete users via the better-auth admin plugin.

**Architecture:** Enable the better-auth admin plugin server-side and adminClient client-side. Next.js middleware guards all `/admin/*` routes by checking session role. The admin layout provides a sidebar shell. The users page is a client component that fetches users on mount and renders a table with per-row action buttons.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, better-auth admin plugin, `authClient.admin.*`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/auth.ts` | Modify | Add admin plugin with ADMIN_USER_ID |
| `lib/auth-client.ts` | Modify | Add adminClient plugin |
| `middleware.ts` | Create | Protect `/admin/*` — redirect non-admins to `/dashboard` |
| `app/admin/layout.tsx` | Create | Dark sidebar shell with CEFC branding and nav |
| `app/admin/page.tsx` | Create | Redirect to `/admin/users` |
| `app/admin/users/page.tsx` | Create | Client component — fetches and renders user table |
| `app/admin/users/UserActions.tsx` | Create | Client component — ban/unban, role toggle, delete per row |

---

### Task 1: Enable admin plugin in auth.ts and auth-client.ts

**Files:**
- Modify: `lib/auth.ts`
- Modify: `lib/auth-client.ts`

- [ ] **Step 1: Update `lib/auth.ts` to add the admin plugin**

Replace the entire file with:

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { db } from "./db";
import * as schema from "./schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
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

- [ ] **Step 2: Update `lib/auth-client.ts` to add adminClient plugin**

Replace the entire file with:

```ts
import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
  plugins: [adminClient()],
});
```

- [ ] **Step 3: Run the better-auth migration to add admin columns to the database**

```bash
DATABASE_URL=postgresql://localhost:5432/cefc_auth npx auth migrate --yes
```

Expected: migrations applied (adds `role`, `banned`, `banReason`, `banExpires` columns to the user table)

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add lib/auth.ts lib/auth-client.ts
git commit -m "feat: enable better-auth admin plugin"
```

---

### Task 2: Create middleware to protect /admin/* routes

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: Create `middleware.ts` at the project root**

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/admin")) {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session || (session.user as { role?: string }).role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: protect /admin routes with role-based middleware"
```

---

### Task 3: Create admin layout with sidebar

**Files:**
- Create: `app/admin/layout.tsx`

- [ ] **Step 1: Create `app/admin/layout.tsx`**

```tsx
import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-[#1c1c1c]">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-[#141414] border-r border-zinc-800 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-purple-700 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              CW
            </div>
            <div>
              <p className="text-white text-sm font-semibold">CEFC Woodlands</p>
              <p className="text-zinc-500 text-xs">Admin Console</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4">
          <p className="text-zinc-600 text-xs uppercase tracking-wider mb-2 px-2">Management</p>
          <Link
            href="/admin/users"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-300 hover:bg-zinc-800 hover:text-white text-sm transition-colors"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Users
          </Link>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-8">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/admin/layout.tsx
git commit -m "feat: add admin console sidebar layout"
```

---

### Task 4: Create /admin redirect page

**Files:**
- Create: `app/admin/page.tsx`

- [ ] **Step 1: Create `app/admin/page.tsx`**

```tsx
import { redirect } from "next/navigation";

export default function AdminPage() {
  redirect("/admin/users");
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/admin/page.tsx
git commit -m "feat: redirect /admin to /admin/users"
```

---

### Task 5: Create UserActions client component

**Files:**
- Create: `app/admin/users/UserActions.tsx`

- [ ] **Step 1: Create `app/admin/users/UserActions.tsx`**

```tsx
"use client";

import { authClient } from "@/lib/auth-client";

type User = {
  id: string;
  name: string;
  email: string;
  role: string | null | undefined;
  banned: boolean | null | undefined;
};

type Props = {
  user: User;
  onRefresh: () => void;
};

export function UserActions({ user, onRefresh }: Props) {
  const isBanned = !!user.banned;
  const isAdmin = user.role === "admin";

  async function handleToggleBan() {
    if (isBanned) {
      await authClient.admin.unbanUser({ userId: user.id });
    } else {
      await authClient.admin.banUser({ userId: user.id, banReason: "Banned by admin" });
    }
    onRefresh();
  }

  async function handleToggleRole() {
    await authClient.admin.setRole({
      userId: user.id,
      role: isAdmin ? "user" : "admin",
    });
    onRefresh();
  }

  async function handleDelete() {
    if (!confirm(`Permanently delete ${user.name} (${user.email})?`)) return;
    await authClient.admin.removeUser({ userId: user.id });
    onRefresh();
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleToggleRole}
        className="px-3 py-1 rounded text-xs font-medium bg-purple-900 text-purple-200 hover:bg-purple-800 transition-colors"
      >
        {isAdmin ? "Demote" : "Make Admin"}
      </button>
      <button
        onClick={handleToggleBan}
        className="px-3 py-1 rounded text-xs font-medium bg-zinc-700 text-zinc-200 hover:bg-zinc-600 transition-colors"
      >
        {isBanned ? "Unban" : "Ban"}
      </button>
      <button
        onClick={handleDelete}
        className="px-3 py-1 rounded text-xs font-medium bg-red-900 text-red-200 hover:bg-red-800 transition-colors"
      >
        Delete
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/admin/users/UserActions.tsx
git commit -m "feat: add UserActions component for per-row admin actions"
```

---

### Task 6: Create /admin/users page with user table

**Files:**
- Create: `app/admin/users/page.tsx`

- [ ] **Step 1: Create `app/admin/users/page.tsx`**

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { authClient } from "@/lib/auth-client";
import { UserActions } from "./UserActions";

type User = {
  id: string;
  name: string;
  email: string;
  role: string | null | undefined;
  banned: boolean | null | undefined;
  createdAt: Date | string;
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await authClient.admin.listUsers({ query: { limit: 100 } });
      setUsers((data?.users as User[]) ?? []);
    } catch {
      setError("Failed to load users. Make sure you are signed in as an admin.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Users</h1>
        <p className="text-zinc-400 text-sm mt-1">Manage all CEFC Woodlands user accounts</p>
      </div>

      {loading && (
        <p className="text-zinc-400 text-sm">Loading users...</p>
      )}

      {error && (
        <p role="alert" className="text-red-400 text-sm">{error}</p>
      )}

      {!loading && !error && (
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
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/admin/users/page.tsx
git commit -m "feat: add admin users table page"
```

---

### Task 7: Manual verification

- [ ] **Step 1: Ensure dev server is running**

```bash
npm run dev
```

Note the port (3000 or 3001).

- [ ] **Step 2: Sign in as admin and navigate to `/admin/users`**

Sign in at `/sign-in` with `paul.chan@cefc.org.sg`, then visit `http://localhost:<port>/admin/users`.

Expected: sidebar with "CEFC Woodlands / Admin Console" and a users table showing all 3 accounts.

- [ ] **Step 3: Verify non-admin is redirected**

Sign in with one of the Gmail accounts, then visit `/admin/users`.

Expected: redirected to `/dashboard`.

- [ ] **Step 4: Test Ban/Unban**

Click "Ban" on one of the Gmail accounts. Expected: status changes to "Banned" after refresh.
Click "Unban". Expected: status returns to "Active".

- [ ] **Step 5: Test role change**

Click "Make Admin" on a Gmail account. Expected: role badge changes to "admin".
Click "Demote". Expected: role returns to "user".
