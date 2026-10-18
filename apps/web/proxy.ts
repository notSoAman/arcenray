import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

import { appCspDirectives, setupCsp } from "./lib/security-policy";

const production = process.env.NODE_ENV === "production";
const configured = !!(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
);
const clerk = clerkMiddleware({
  contentSecurityPolicy: {
    strict: true,
    directives: configured
      ? appCspDirectives(
          {
            supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
            mediaUrl: process.env.NEXT_PUBLIC_MEDIA_URL,
          },
          production,
        )
      : {},
  },
});
// Browsing is public. Protected pages check the viewer and RLS protects writes.
export default function proxy(
  request: NextRequest,
  event: Parameters<typeof clerk>[1],
) {
  if (!configured) {
    const response = NextResponse.next();
    response.headers.set("Content-Security-Policy", setupCsp);
    return response;
  }
  // Clerk generates and forwards a per-request nonce. Next SSR uses that same
  // nonce; keep the SDK's request/response CSP implementation intact. Its
  // literal unsafe-inline fallback is ignored with nonce + strict-dynamic;
  // production does not include unsafe-eval. Inline styles remain required.
  return clerk(request, event);
}
export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
