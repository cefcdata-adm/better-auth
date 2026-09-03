# Sign-In Page Design Spec
Date: 2026-05-14

## Overview

A dedicated `/sign-in` page for CEFC Woodlands' internal collaboration tool. Two-column full-screen layout matching the provided reference design. Supports Microsoft OAuth, Google OAuth, and email/password authentication via better-auth.

## Layout

Two-column, full-screen (`h-screen`):

- **Left panel (50%)**: Purple background (`#5b21b6`), white text. Contains CEFC Woodlands branding and feature highlights.
- **Right panel (50%)**: Dark background (`#1c1c1c`). Contains the centered sign-in card.

## Left Panel Content

- Logo: "CW" initials in a rounded purple tile (lighter shade)
- App name: "CEFC Woodlands"
- Tagline: "Internal collaboration tools for church staff"
- Feature bullets:
  - Kanban board for planning and tracking ministry tasks
  - Team workspaces with role-based access control
  - Real-time updates shared across all devices

## Sign-In Card

- Title: "Sign in to Collab Tools"
- Subtitle: "Welcome back! Please sign in to continue"
- "Continue with Microsoft" button — full width, dark bordered, Microsoft logo SVG
- "Continue with Google" button — full width, dark bordered, Google logo SVG
- "or" divider with horizontal rules
- Email address label + input field
- Password label + input field
- "Sign In" button — full width, purple background
- Footer: "Request for Access" link (no functionality yet, placeholder `href="#"`)

## Behaviour

| Action | Handler |
|---|---|
| Click "Continue with Microsoft" | `authClient.signIn.social({ provider: "microsoft", callbackURL: "/dashboard" })` |
| Click "Continue with Google" | `authClient.signIn.social({ provider: "google", callbackURL: "/dashboard" })` |
| Submit email/password form | `authClient.signIn.email({ email, password, callbackURL: "/dashboard" })` |
| Success | Redirect to `/dashboard` (placeholder page) |
| Error | Inline error message below the Sign In button |

## Files

- `app/sign-in/page.tsx` — the sign-in page component (client component)
- `app/dashboard/page.tsx` — placeholder page shown after successful login

## Out of Scope

- "Request for Access" functionality (link is a placeholder)
- Forgot password flow
- Sign-up flow
- `/dashboard` content beyond a simple "You are logged in" confirmation
