import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const res = await fetch(
    "http://localhost:3000/api/auth/.well-known/openid-configuration",
    { headers: { "x-forwarded-proto": "https", "x-forwarded-host": "id.cefc.org.sg" } },
  );
  const data = await res.json();
  return NextResponse.json(data);
}
