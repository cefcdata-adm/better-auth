import { NextRequest, NextResponse } from "next/server";

function getRequestOrigin(request: NextRequest) {
  const headerValue = request.headers.get("origin") ?? request.headers.get("referer");
  if (!headerValue || headerValue === "null") return null;

  try {
    return new URL(headerValue).origin;
  } catch {
    return null;
  }
}

export function enforceSameOrigin(request: NextRequest) {
  const requestOrigin = getRequestOrigin(request);

  const expectedOrigin = process.env.BETTER_AUTH_URL
    ? new URL(process.env.BETTER_AUTH_URL).origin
    : request.nextUrl.origin;

  if (!requestOrigin || requestOrigin !== expectedOrigin) {
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  }

  return null;
}
