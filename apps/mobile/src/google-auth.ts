import { signupHandle } from "@repo/shared";

type SignUpLike = {
  createdSessionId?: string | null;
  existingSession?: { sessionId: string } | null;
  firstName?: string | null;
  lastName?: string | null;
  emailAddress?: string | null;
  username?: string | null;
  missingFields?: string[];
  status?: string | null;
  update?: PendingGoogleSignUp["update"];
  finalize?: PendingGoogleSignUp["finalize"];
};
export type PendingGoogleSignUp = {
  status: string | null;
  createdSessionId: string | null;
  firstName?: string | null;
  lastName?: string | null;
  emailAddress?: string | null;
  username?: string | null;
  missingFields: string[];
  update: (params: { username: string }) => Promise<{ error: unknown }>;
  finalize: () => Promise<{ error: unknown }>;
};
export type GoogleSignUpCompletion =
  | { kind: "complete"; createdSessionId: string }
  | { kind: "incomplete"; message: string }
  | { kind: "error"; message: string };
type Resource = {
  createdSessionId?: string | null;
  existingSession?: { sessionId: string } | null;
  missingFields?: string[];
};
export type GoogleAuthResult = {
  createdSessionId?: string | null;
  authSessionResult: { type: string } | null;
  signIn?: Resource | null;
  signUp?: SignUpLike | null;
};
export function googleAuthOutcome(result: GoogleAuthResult):
  | { kind: "complete"; newAccount: boolean }
  | {
      kind: "needs-username";
      signUp: PendingGoogleSignUp;
      missingFields: string[];
      message: string;
    }
  | { kind: "cancelled" }
  | { kind: "incomplete"; message: string } {
  if (result.createdSessionId)
    return {
      kind: "complete",
      newAccount: result.signUp?.createdSessionId === result.createdSessionId,
    };
  if (
    result.authSessionResult?.type === "cancel" ||
    result.authSessionResult?.type === "dismiss"
  )
    return { kind: "cancelled" };
  if (
    result.authSessionResult?.type === "success" &&
    result.signUp?.missingFields?.includes("username") &&
    result.signUp.update &&
    result.signUp.finalize
  )
    return {
      kind: "needs-username",
      signUp: result.signUp as PendingGoogleSignUp,
      missingFields: result.signUp.missingFields,
      message: "Choose a username to finish your Google account.",
    };
  if (
    result.authSessionResult?.type === "success" &&
    (result.signIn?.existingSession || result.signUp?.existingSession)
  )
    return { kind: "complete", newAccount: false };
  return {
    kind: "incomplete",
    message: result.signUp?.missingFields?.length
      ? "Finish creating your account with your email and username below, then sign in with Google."
      : "Google sign-in did not finish. Try again or use your email.",
  };
}
export function authFailureMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "errors" in error &&
    Array.isArray(error.errors)
  ) {
    const first = error.errors[0];
    if (typeof first?.longMessage === "string") return first.longMessage;
    if (typeof first?.message === "string") return first.message;
  }
  return error instanceof Error
    ? error.message
    : "Google sign-in could not finish. Try again or use your email.";
}

export function googleRedirectUrl(packageName: string) {
  return `clerk://${packageName}.hosted-callback`;
}

export async function completeGoogleSignUp(
  signUp: PendingGoogleSignUp,
  username: string,
): Promise<GoogleSignUpCompletion> {
  const handle = normalizeGoogleUsername(username);
  if (!handle)
    return {
      kind: "error",
      message: "Use 4–32 lowercase letters, numbers or underscores.",
    };

  const { error: updateError } = await signUp.update({ username: handle });
  if (updateError)
    return { kind: "error", message: authFailureMessage(updateError) };

  if (signUp.status !== "complete" || !signUp.createdSessionId)
    return {
      kind: "incomplete",
      message: "Google sign-up still needs more information. Try again.",
    };

  const { error: finalizeError } = await signUp.finalize();
  if (finalizeError)
    return { kind: "error", message: authFailureMessage(finalizeError) };

  return { kind: "complete", createdSessionId: signUp.createdSessionId };
}

export function normalizeGoogleUsername(value: string | null | undefined) {
  const normalized = value
    ?.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32)
    .replace(/_+$/g, "");
  if (!normalized || normalized.length < 4) return null;
  return signupHandle(normalized);
}

/** Prefill the one optional Clerk field from the Google profile already returned by SSO. */
export function googleUsernameSeed(
  signUp: Pick<
    PendingGoogleSignUp,
    "username" | "firstName" | "lastName" | "emailAddress"
  >,
) {
  const name = [signUp.firstName, signUp.lastName]
    .filter((part): part is string => !!part?.trim())
    .join("_");
  const emailLocal = signUp.emailAddress?.split("@")[0];
  for (const candidate of [signUp.username, name, emailLocal]) {
    const handle = normalizeGoogleUsername(candidate);
    if (handle) return handle;
  }
  return "";
}
