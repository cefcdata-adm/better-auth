# CEFC Auth Server - Production Install Guide

Target URL: `https://id.cefc.org.sg`
Stack: Next.js 16, Node.js 20, PostgreSQL 15+, Nginx, PM2

---

## 1. System prerequisites

```bash
# Node.js 20 LTS
node -v   # should print v20.x.x

# PM2
pm2 -v

# PostgreSQL
sudo apt update
sudo apt install -y postgresql postgresql-contrib

# Nginx
sudo apt install -y nginx

# Certbot
sudo apt install -y certbot python3-certbot-nginx
```

---

## 2. PostgreSQL setup

Create the database user and database:

```bash
sudo -u postgres psql <<'SQL'
CREATE USER cefc_auth WITH PASSWORD 'choose-a-strong-password';
CREATE DATABASE cefc_auth OWNER cefc_auth;
GRANT ALL PRIVILEGES ON DATABASE cefc_auth TO cefc_auth;
SQL
```

Test the connection:

```bash
psql "postgresql://cefc_auth:choose-a-strong-password@localhost:5432/cefc_auth" -c '\l'
```

---

## 3. Repository location

The production repo root on this server is:

```bash
/opt/better-auth
```

The Next.js app root is:

```bash
/opt/better-auth/cefc-next
```

Run normal operational commands from the repo root unless a step explicitly says otherwise.

---

## 4. Environment variables

Create or update:

```bash
/opt/better-auth/cefc-next/.env.local
```

Required values:

```env
# App
BETTER_AUTH_SECRET=<generate: openssl rand -base64 32>
BETTER_AUTH_URL=https://id.cefc.org.sg
NEXT_PUBLIC_BETTER_AUTH_URL=https://id.cefc.org.sg

# Database
DATABASE_URL=postgresql://cefc_auth:choose-a-strong-password@localhost:5432/cefc_auth

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Microsoft OAuth
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=

# SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=it@cefc.org.sg
SMTP_PASS=
SMTP_FROM="CEFC Woodlands IT <it@cefc.org.sg>"

# Set this after first sign-in bootstrap
ADMIN_USER_ID=
```

Lock it down:

```bash
chmod 600 /opt/better-auth/cefc-next/.env.local
```

---

## 5. Install dependencies and build

From the repo root:

```bash
cd /opt/better-auth
npm run build
```

This delegates into `cefc-next` and runs the production build there.

---

## 6. Apply database schema

From the app root:

```bash
cd /opt/better-auth/cefc-next
npx drizzle-kit push
```

When prompted, confirm the schema changes.

---

## 7. Start the app with PM2

From the repo root:

```bash
cd /opt/better-auth
npm run pm2:start
pm2 save
pm2 startup
```

Run the `sudo` command printed by `pm2 startup` to enable auto-start on reboot.

Verify:

```bash
pm2 status cefc-auth
pm2 logs cefc-auth --lines 20
curl -I http://localhost:3000/sign-in
```

The app listens on port `3000`.

---

## 8. Nginx reverse proxy

Create:

```bash
/etc/nginx/sites-available/cefc-auth
```

With:

```nginx
server {
    listen 80;
    server_name id.cefc.org.sg;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/cefc-auth /etc/nginx/sites-enabled/cefc-auth
sudo nginx -t
sudo systemctl reload nginx
```

---

## 9. SSL certificate

```bash
sudo certbot --nginx -d id.cefc.org.sg
sudo certbot renew --dry-run
```

---

## 10. First sign-in and admin bootstrap

1. Go to `https://id.cefc.org.sg/sign-in`
2. Sign in with Microsoft or Google
3. Query the database for your user ID:

```bash
psql "postgresql://cefc_auth:choose-a-strong-password@localhost:5432/cefc_auth" \
  -c "SELECT id, email FROM \"user\";"
```

4. Copy the `id` for the admin user and set:

```env
ADMIN_USER_ID=<user.id from the user table>
```

5. Restart the app:

```bash
cd /opt/better-auth
npm run pm2:restart
```

6. Sign out and sign back in
7. Verify admin access at `/admin/users`

`ADMIN_USER_ID` is a database user ID, not an email address.

---

## 11. Register the first OAuth app

After admin access works:

1. Go to `https://id.cefc.org.sg/admin/apps`
2. Click **Register App**
3. Fill in name, subdomain, and redirect URIs
4. Copy the generated client secret immediately

Then follow [integration-guide.md](/opt/better-auth/cefc-next/docs/integration-guide.md).

---

## 12. Verify OIDC discovery

```bash
curl https://id.cefc.org.sg/api/auth/.well-known/openid-configuration
```

Confirm the response contains the issuer and token endpoints used by client apps.

---

## Ongoing operations

Deploy an update:

```bash
cd /opt/better-auth
git pull
npm run build
npm run pm2:restart
```

Apply a schema change:

```bash
cd /opt/better-auth/cefc-next
npx drizzle-kit push
cd /opt/better-auth
npm run pm2:restart
```

View logs:

```bash
pm2 logs cefc-auth --lines 50
```

Backup the database:

```bash
pg_dump -U cefc_auth -d cefc_auth > cefc_auth_$(date +%Y%m%d).sql
```

---

## OAuth provider setup

Google:

- redirect URI: `https://id.cefc.org.sg/api/auth/callback/google`

Microsoft:

- redirect URI: `https://id.cefc.org.sg/api/auth/callback/microsoft`
- enable ID tokens
- create a client secret

---

## Quick checklist

- [ ] Node.js 20 installed
- [ ] PostgreSQL running, `cefc_auth` database created
- [ ] `.env.local` created and locked down
- [ ] `npm run build` succeeded
- [ ] `npx drizzle-kit push` applied all tables
- [ ] PM2 running, `pm2 save` and `pm2 startup` done
- [ ] Nginx proxying `id.cefc.org.sg` to `localhost:3000`
- [ ] SSL certificate issued and renewal verified
- [ ] Signed in, retrieved user ID, set `ADMIN_USER_ID`, restarted
- [ ] Admin console accessible at `/admin/users`
- [ ] OIDC discovery endpoint returning valid JSON
- [ ] First client app registered and tested
