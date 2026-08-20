import { NextResponse } from "next/server";

export function middleware(req) {
  const { pathname } = req.nextUrl;

  // Allow public pages
  if (pathname === "/" || pathname.startsWith("/signup") || pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const token = req.cookies.get("authToken")?.value;

  // Protect /home and /inventory
  if ((pathname.startsWith("/home") || pathname.startsWith("/inventory")) && !token) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/home/:path*", "/inventory/:path*"]
};
