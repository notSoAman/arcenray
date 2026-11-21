import assert from "node:assert/strict";
import test from "node:test";
import {
  completeGoogleSignUp,
  googleAuthOutcome,
  googleRedirectUrl,
  authFailureMessage,
  type PendingGoogleSignUp,
} from "../src/google-auth.ts";

test("completed browser authentication proceeds only after SDK completion", () => {
  assert.deepEqual(
    googleAuthOutcome({
      createdSessionId: "session",
      authSessionResult: { type: "success" },
      signUp: { createdSessionId: "session" },
    }),
    { kind: "complete", newAccount: true },
  );
});
test("an existing active session is a successful return, not a silent dead end", () => {
  assert.deepEqual(
    googleAuthOutcome({
      createdSessionId: null,
      authSessionResult: { type: "success" },
      signIn: { existingSession: { sessionId: "existing" } },
    }),
    { kind: "complete", newAccount: false },
  );
});
test("a new Google account missing its required username enters completion instead of dead-ending", () => {
  const signUp: PendingGoogleSignUp = {
    createdSessionId: null,
    missingFields: ["username"],
    status: "missing_requirements",
    update: async () => ({ error: null }),
    finalize: async () => ({ error: null }),
  };
  const outcome = googleAuthOutcome({
    createdSessionId: null,
    authSessionResult: { type: "success" },
    signUp,
  });
  assert.equal(outcome.kind, "needs-username");
  if (outcome.kind === "needs-username") {
    assert.equal(outcome.signUp, signUp);
    assert.deepEqual(outcome.missingFields, ["username"]);
  }
});

test("completing a pending Google sign-up saves the username and activates the session", async () => {
  let updatedWith = "";
  let finalized = false;
  const signUp: PendingGoogleSignUp = {
    createdSessionId: null,
    missingFields: ["username"],
    status: "missing_requirements",
    update: async (params: { username: string }) => {
      updatedWith = params.username;
      signUp.status = "complete";
      signUp.createdSessionId = "session";
      return { error: null };
    },
    finalize: async () => {
      finalized = true;
      return { error: null };
    },
  };
  const result = await completeGoogleSignUp(signUp, " Aman Singh ");
  assert.deepEqual(result, { kind: "complete", createdSessionId: "session" });
  assert.equal(updatedWith, "aman singh");
  assert.equal(finalized, true);
});

test("Google sign-up completion reports update and activation failures without hiding the error", async () => {
  const failing = {
    createdSessionId: null,
    missingFields: ["username"],
    status: "missing_requirements",
    update: async () => ({ error: new Error("Username is taken") }),
    finalize: async () => ({ error: null }),
  };
  const result = await completeGoogleSignUp(failing, "aman");
  assert.equal(result.kind, "error");
  if (result.kind === "error") {
    assert.match(result.message, /Username is taken/);
  }
});
test("dismissal is quiet but incomplete Google registration gives recovery guidance", () => {
  assert.equal(
    googleAuthOutcome({ authSessionResult: { type: "cancel" } }).kind,
    "cancelled",
  );
  const outcome = googleAuthOutcome({
    authSessionResult: { type: "success" },
    signUp: { missingFields: ["username"] },
  });
  assert.equal(outcome.kind, "incomplete");
  assert.match(
    outcome.kind === "incomplete" ? outcome.message : "",
    /email|username/i,
  );
});
test("unavailable SDK state does not look like a cancelled login", () => {
  assert.equal(
    googleAuthOutcome({ authSessionResult: null }).kind,
    "incomplete",
  );
});
test("structured Clerk failures show helpful messages without dumping tokens", () => {
  assert.equal(
    authFailureMessage({
      errors: [{ longMessage: "This sign-in could not finish." }],
    }),
    "This sign-in could not finish.",
  );
  assert.equal(
    authFailureMessage({ token: "private" }),
    "Google sign-in could not finish. Try again or use your email.",
  );
});

// The store manifest only declares the Clerk hosted callback, not .callback.
test("Google returns to a deep link handled by the existing store binary", () => {
  assert.equal(
    googleRedirectUrl("com.arcenray.mobile"),
    "clerk://com.arcenray.mobile.hosted-callback",
  );
  assert.equal(
    googleRedirectUrl("com.arcenray.mobile.dev"),
    "clerk://com.arcenray.mobile.dev.hosted-callback",
  );
});
