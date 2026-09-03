# CEFC Auth Server - App Operations

## Paths

- Repo root: `/opt/better-auth`
- Next.js app root: `/opt/better-auth/cefc-next`
- PM2 config: `/opt/better-auth/cefc-next/ecosystem.config.cjs`

## Normal workflow

Run all commands from the repo root:

```bash
cd /opt/better-auth
```

## Before starting

Confirm these are in place:

- `/opt/better-auth/cefc-next/.env.local`
- Database is reachable from `DATABASE_URL`
- `BETTER_AUTH_URL` points to the production auth hostname
- `ADMIN_USER_ID` is set if admin access should work
- SMTP values are set if transactional emails should work
- Google and Microsoft client ID/secret values are set if social sign-in should work

## Build the app

```bash
npm run build
```

This runs the production build for `cefc-next` from the repo root control point.

## Start the app with PM2

```bash
npm run pm2:start
```

This starts the app as PM2 process `cefc-auth` on port `3000`.

## Check status

```bash
pm2 list
pm2 status cefc-auth
```

## View logs

```bash
pm2 logs cefc-auth
```

To stop following logs, press `Ctrl+C`.

## Restart after config or code changes

If dependencies or code changed:

```bash
npm run build
npm run pm2:restart
```

## Stop the app

```bash
npm run pm2:stop
```

This deletes the PM2 process entry for `cefc-auth`.

## Start without PM2

For a one-off foreground run:

```bash
npm run start
```

Use this only for temporary testing. The process stops when the shell exits.

## Common checks

Confirm the repo is clean:

```bash
git status
```

Confirm the app builds:

```bash
npm run build
```

Confirm PM2 sees the process:

```bash
pm2 list
```

## Current process definition

PM2 currently runs:

- app name: `cefc-auth`
- working directory: `/opt/better-auth/cefc-next`
- command: `node_modules/next/dist/bin/next start -p 3000`

## Notes

- The repo root is the control point. Use `/opt/better-auth` for normal operations.
- The actual Next.js app still lives under `cefc-next`.
- If social login is not configured, the app can still build, but Google and Microsoft sign-in will not work.
