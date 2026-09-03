# Admin Console — User Management Design Spec
Date: 2026-05-14

## Overview

A protected admin console at `/admin` for IT administrators to manage CEFC Woodlands users. Built on top of better-auth's admin plugin. Access is restricted to users with the `admin` role. Application-level permissions are out of scope — each application manages its own permissions.

## Access Control

- All `/admin/*` routes are protected by Next.js middleware
- Users without the `admin` role are redirected to `/dashboard`
- Admin role is assigned via the better-auth admin plugin (named IT admins only)

## Layout

- Route prefix: `/admin` (redirects to `/admin/users`)
- `app/admin/layout.tsx` — shared sidebar layout, separate from the rest of the app
- Sidebar: dark background (`#1c1c1c`), purple accent, CEFC Woodlands logo/initials, "Users" nav link (more added in future subsystems)
- Theme: matches the dark/purple sign-in page design

## User Management Page (`/admin/users`)

A client component that fetches all users via `authClient.admin.listUsers()` and renders a table.

### Table Columns
- Name
- Email
- Role (`admin` or `user`)
- Status (`active` or `banned`)
- Created date
- Actions

### Per-Row Actions
- **Change Role** — toggle between `admin` and `user`
- **Ban / Unban** — block or restore user sign-in access
- **Delete** — permanently remove the user

Actions are client-side buttons that call the better-auth admin plugin API via `authClient.admin.*`.

## Files

| File | Action | Responsibility |
|---|---|---|
| `middleware.ts` | Create | Protect `/admin/*` — redirect non-admins to `/dashboard` |
| `app/admin/layout.tsx` | Create | Sidebar shell with nav |
| `app/admin/page.tsx` | Create | Redirect to `/admin/users` |
| `app/admin/users/page.tsx` | Create | User table — client component fetching user list via authClient.admin.listUsers() |
| `app/admin/users/UserActions.tsx` | Create | Client component — ban/unban, role change, delete buttons per row |
| `lib/auth.ts` | Modify | Add admin plugin |
| `lib/auth-client.ts` | Modify | Add adminClient plugin |

## Auth Plugin Changes

### `lib/auth.ts`
Add the `admin` plugin. The first admin user's ID must be added to `adminUserIds` to bootstrap access.

```ts
import { admin } from "better-auth/plugins";

plugins: [
  admin({
    adminUserIds: [process.env.ADMIN_USER_ID!],
  }),
]
```

### `lib/auth-client.ts`
Add the `adminClient` plugin so client components can call `authClient.admin.*`.

```ts
import { adminClient } from "better-auth/client/plugins";

plugins: [adminClient()]
```

## Environment Variables

Add to `.env`:
```
ADMIN_USER_ID=<your-user-id-from-the-database>
```

## Out of Scope

- Request for Access flow (next subsystem)
- Subdomain management (third subsystem)
- Application-level permissions
- Audit logs
- User detail/profile view page
- Pagination (acceptable for now given small user count)
