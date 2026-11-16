import { NextResponse, type NextRequest } from "next/server";

/** next-auth v4 cookie names (plain and secure prefixes, including chunked session tokens). */
const AUTH_COOKIE_PREFIXES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.callback-url",
  "__Secure-next-auth.callback-url",
  "next-auth.csrf-token",
  "__Host-next-auth.csrf-token",
];

/**
 * Clears a stale session (its user no longer exists or is inactive) and lands
 * on the login page with an "expired" notice.
 */
export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login?expired=1", request.url));
  for (const cookie of request.cookies.getAll()) {
    if (AUTH_COOKIE_PREFIXES.some((prefix) => cookie.name === prefix || cookie.name.startsWith(`${prefix}.`))) {
      response.cookies.set(cookie.name, "", { path: "/", maxAge: 0 });
    }
  }
  return response;
}
