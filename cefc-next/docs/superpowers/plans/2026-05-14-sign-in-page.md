# Sign-In Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a two-column sign-in page at `/sign-in` supporting Microsoft OAuth, Google OAuth, and email/password via better-auth, matching the CEFC Woodlands reference design.

**Architecture:** A client component at `app/sign-in/page.tsx` handles all auth interactions using the existing `authClient` from `lib/auth-client.ts`. A minimal placeholder at `app/dashboard/page.tsx` confirms successful login. No new libraries required.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, better-auth `authClient`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/sign-in/page.tsx` | Create | Full sign-in UI — layout, social buttons, email/password form, error display |
| `app/dashboard/page.tsx` | Create | Placeholder page shown after successful login |

---

### Task 1: Create placeholder dashboard page

**Files:**
- Create: `app/dashboard/page.tsx`

- [ ] **Step 1: Create the file**

```tsx
export default function DashboardPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#1c1c1c]">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-white">You are logged in</h1>
        <p className="mt-2 text-zinc-400">Welcome to CEFC Woodlands</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript is happy**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: add placeholder dashboard page"
```

---

### Task 2: Create sign-in page — two-column shell

**Files:**
- Create: `app/sign-in/page.tsx`

- [ ] **Step 1: Create the file with left panel and right panel shell**

```tsx
"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await authClient.signIn.email({
      email,
      password,
      callbackURL: "/dashboard",
    });
    if (error) {
      setError(error.message ?? "Sign in failed. Please try again.");
    }
    setLoading(false);
  }

  async function handleSocialSignIn(provider: "microsoft" | "google") {
    await authClient.signIn.social({
      provider,
      callbackURL: "/dashboard",
    });
  }

  return (
    <div className="flex h-screen">
      {/* Left Panel */}
      <div className="hidden md:flex w-1/2 bg-purple-800 flex-col justify-center px-16 text-white">
        <div className="mb-8">
          <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center font-bold text-lg mb-6">
            CW
          </div>
          <h1 className="text-3xl font-bold mb-2">CEFC Woodlands</h1>
          <p className="text-purple-200 text-lg">
            Internal collaboration tools for church staff
          </p>
        </div>
        <ul className="space-y-4 text-purple-100">
          <li>Kanban board for planning and tracking ministry tasks</li>
          <li>Team workspaces with role-based access control</li>
          <li>Real-time updates shared across all devices</li>
        </ul>
      </div>

      {/* Right Panel */}
      <div className="flex w-full md:w-1/2 bg-[#1c1c1c] items-center justify-center px-8">
        <div className="w-full max-w-sm bg-[#2a2a2a] rounded-xl p-8 border border-zinc-700">
          <h2 className="text-xl font-bold text-white text-center mb-1">
            Sign in to Collab Tools
          </h2>
          <p className="text-zinc-400 text-sm text-center mb-6">
            Welcome back! Please sign in to continue
          </p>

          {/* Social Buttons */}
          <div className="space-y-3 mb-6">
            <button
              onClick={() => handleSocialSignIn("microsoft")}
              className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg border border-zinc-600 bg-[#1c1c1c] text-white text-sm hover:bg-zinc-800 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              Continue with Microsoft
            </button>
            <button
              onClick={() => handleSocialSignIn("google")}
              className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg border border-zinc-600 bg-[#1c1c1c] text-white text-sm hover:bg-zinc-800 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Continue with Google
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-zinc-700" />
            <span className="text-zinc-500 text-sm">or</span>
            <div className="flex-1 h-px bg-zinc-700" />
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleEmailSignIn} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white mb-1">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                required
                className="w-full px-3 py-2.5 rounded-lg bg-[#1c1c1c] border border-zinc-600 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                className="w-full px-3 py-2.5 rounded-lg bg-[#1c1c1c] border border-zinc-600 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-purple-700 hover:bg-purple-600 text-white font-semibold text-sm transition-colors disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <a href="#" className="text-purple-400 text-sm hover:underline">
              Request for Access
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript is happy**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/sign-in/page.tsx
git commit -m "feat: add sign-in page with Microsoft, Google, and email/password auth"
```

---

### Task 3: Manual verification

- [ ] **Step 1: Ensure the dev server is running**

```bash
npm run dev
```

Note which port it starts on (3000 or 3001 if another app is running).

- [ ] **Step 2: Open the sign-in page**

Navigate to `http://localhost:<port>/sign-in`

Expected:
- Left panel: purple background, "CW" logo tile, "CEFC Woodlands" heading, tagline, 3 bullet points
- Right panel: dark background, sign-in card with Microsoft button, Google button, "or" divider, email + password fields, "Sign In" button, "Request for Access" link

- [ ] **Step 3: Test Microsoft sign-in**

Click "Continue with Microsoft" — should redirect to Microsoft login.

- [ ] **Step 4: Test Google sign-in**

Click "Continue with Google" — should redirect to Google login.

- [ ] **Step 5: Test email/password error state**

Enter a wrong email/password and click "Sign In".
Expected: red error message appears below the button.

- [ ] **Step 6: Verify dashboard redirect**

After a successful login (OAuth or email), confirm you land on `http://localhost:<port>/dashboard` showing "You are logged in".
