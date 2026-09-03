import { NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/admin")) {
    const res = await fetch(new URL("/api/auth/get-session", "http://localhost:3000"), {
      headers: {
        cookie: request.headers.get("cookie") ?? "",
      },
    });

    const session = await res.json();

    if (!session?.user || (session.user as Record<string, unknown>).role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
