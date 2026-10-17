import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@repo/shared/contracts";
import { createClient } from "../../../lib/supabase/server";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const response = NextResponse.redirect(
        new URL(safeNextPath(params.get("next")), request.nextUrl.origin),
      );
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
  }
  // Send people back to the sign-in screen with a readable reason instead of raw JSON.
  // Only a fixed reason code is forwarded; provider error text is never reflected.
  const reason =
    params.get("error_code") === "otp_expired" ? "expired" : "link";
  const response = NextResponse.redirect(
    new URL(`/sign-in?error=${reason}`, request.nextUrl.origin),
  );
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
