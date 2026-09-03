import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, jwt, oidcProvider } from "better-auth/plugins";
import { db } from "./db";
import * as schema from "./schema";
import { escapeHtml, sendEmail, renderEmailTemplate } from "./email";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  session: {
    expiresIn: 60 * 60 * 8,  // 8 hours
    updateAge: 60 * 60,       // refresh session if older than 1 hour
  },
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Set your password — CEFC",
        html: renderEmailTemplate({
          heading: "Set your password",
          intro: `Hi ${escapeHtml(user.name)}, your access request has been approved. Click below to set your password and sign in. This link expires in 1 hour — if you did not request access, you can ignore this email.`,
          ctaText: "Set my password",
          ctaUrl: url,
        }),
      });
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      requireLocalEmailVerified: false,
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  plugins: [
    admin({
      adminUserIds: [process.env.ADMIN_USER_ID!],
    }),
    jwt(),
    oidcProvider({
      __skipDeprecationWarning: true,
      loginPage: "/sign-in",
      consentPage: "/oauth/consent",
      allowDynamicClientRegistration: false,
      storeClientSecret: "hashed",
      scopes: ["openid", "profile", "email"],
      useJWTPlugin: true,
      getAdditionalUserInfoClaim: async () => ({
        profile: undefined, // suppress inline base64 image
      }),
    }),
  ],
});
