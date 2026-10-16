import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@repo/shared/contracts";
import { createClient } from "../../../lib/supabase/server";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const response = NextResponse.redirect(
        new URL(
          safeNextPath(request.nextUrl.searchParams.get("next")),
          request.nextUrl.origin,
        ),
      );
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
  }
  return NextResponse.json(
    {
      error: "Authentication failed. Request a new sign-in link and try again.",
    },
    { status: 400, headers: { "Cache-Control": "private, no-store" } },
  );
}
