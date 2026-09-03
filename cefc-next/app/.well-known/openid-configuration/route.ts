import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const issuerURL = new URL(baseURL);
  const res = await fetch(
    new URL("/api/auth/.well-known/openid-configuration", baseURL),
    {
      headers: {
        "x-forwarded-proto": issuerURL.protocol.replace(":", ""),
        "x-forwarded-host": issuerURL.host,
      },
    },
  );
  const data = await res.json();
  return NextResponse.json(data);
}
