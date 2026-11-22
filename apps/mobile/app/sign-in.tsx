import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useClerk, useSignIn, useSignUp } from "@clerk/expo";
import { usePushSignOut } from "../src/chat-push";
import { useSSO } from "@clerk/expo/experimental";
import { useHostedAuth } from "@clerk/expo/hosted-auth";
import {
  completeGoogleSignUp,
  googleAuthOutcome,
  googleUsernameSeed,
  googleRedirectUrl,
  authFailureMessage,
  normalizeGoogleUsername,
  type PendingGoogleSignUp,
} from "../src/google-auth";
import Constants from "expo-constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Lockup } from "../src/brand";
import { SignInUpdates } from "../src/sign-in-updates";
import { KeyboardForm } from "../src/keyboard-form";
import {
  Button,
  Field,
  Kicker,
  Notice,
  IconButton,
  PageTitle,
  haptic,
} from "../src/ui";
import { IconGoogle } from "../src/icons";
import { colors, fonts, radius } from "../src/theme";

/**
 * Native in-app sign-in / sign-up using Clerk's future (Core 3) resources.
 * Google uses the system browser with the registered Clerk callback. This avoids
 * relying on a device Credential Manager registration matching the Play signer.
 */

type Mode = "sign-in" | "sign-up";

const packageName =
  Constants.expoConfig?.android?.package ?? "com.arcenray.mobile";
const ssoRedirectUrl = googleRedirectUrl(packageName);

function errorText(error: { longMessage?: string; message?: string } | null) {
  return (
    error?.longMessage ?? error?.message ?? "That didn't finish. Try again."
  );
}

function GoogleMark() {
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <IconGoogle size={15} />
    </View>
  );
}

function GoogleButton({
  onPress,
  busy,
}: {
  onPress: () => void;
  busy: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 54,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.lineStrong,
        backgroundColor: "rgba(243,239,233,0.03)",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 11,
        opacity: pressed || busy ? 0.65 : 1,
      })}
    >
      {busy ? <ActivityIndicator color={colors.bone} /> : <GoogleMark />}
      <Text
        style={{ color: colors.bone, fontFamily: fonts.semibold, fontSize: 16 }}
      >
        Continue with Google
      </Text>
    </Pressable>
  );
}

function GoogleUsernameCompletion({
  signUp,
  onDone,
  onError,
  onStart,
}: {
  signUp: PendingGoogleSignUp;
  onDone: (newAccount: boolean) => void;
  onError: (message: string) => void;
  onStart: () => void;
}) {
  const suggestedUsername = googleUsernameSeed(signUp);
  const [username, setUsername] = useState(suggestedUsername);
  const [busy, setBusy] = useState(false);
  const handle = normalizeGoogleUsername(username);

  async function finish() {
    onStart();
    setBusy(true);
    onError("");
    try {
      const result = await completeGoogleSignUp(signUp, username);
      if (result.kind === "complete") onDone(true);
      else onError(result.message);
    } catch (error) {
      onError(authFailureMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 14 }}>
      <Text
        style={{
          color: colors.text,
          fontFamily: fonts.extraBold,
          fontSize: 22,
          letterSpacing: -0.5,
        }}
      >
        Finish your Google account
      </Text>
      <Text
        style={{
          color: colors.muted,
          fontFamily: fonts.regular,
          fontSize: 14,
          lineHeight: 21,
        }}
      >
        Your Google details are ready. Confirm the username Arcenray will use
        for sign-in and your public profile.
      </Text>
      <Field
        label="Username (@handle)"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={32}
        editable={!busy}
        placeholder="your-handle"
        hint={
          suggestedUsername
            ? "Prefilled from Google. Use 4–32 letters, numbers or underscores."
            : "Use 4–32 lowercase letters, numbers or underscores."
        }
        onSubmitEditing={finish}
        returnKeyType="done"
      />
      <Button
        title={busy ? "Finishing…" : "Continue"}
        block
        disabled={busy || !handle}
        busy={busy}
        onPress={finish}
      />
    </View>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
      <Text
        style={{ color: colors.faint, fontFamily: fonts.regular, fontSize: 12 }}
      >
        {label}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
    </View>
  );
}

function GoogleFlow({
  onDone,
  onError,
  onStart,
  onStop,
}: {
  onDone: (newAccount: boolean) => void;
  onError: (message: string) => void;
  onStart: () => void;
  onStop: () => void;
}) {
  const { startSSOFlow } = useSSO();
  const { loaded } = useClerk();
  const [busy, setBusy] = useState(false);
  const [pendingSignUp, setPendingSignUp] =
    useState<PendingGoogleSignUp | null>(null);
  const inFlight = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function go() {
    if (inFlight.current) return;
    if (!loaded) {
      onError("Sign-in is still loading. Check your connection and try again.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    onError("");
    onStart();
    haptic("medium");
    let completed = false;
    try {
      // The installed Core 3 hook finalizes/activates before resolving.
      const result = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl: ssoRedirectUrl,
        oidcPrompt: "select_account",
      });
      if (!alive.current) return;
      const outcome = googleAuthOutcome(result);
      if (outcome.kind === "complete") {
        completed = true;
        onDone(outcome.newAccount);
      } else if (outcome.kind === "needs-username")
        setPendingSignUp(outcome.signUp);
      else if (outcome.kind === "incomplete") onError(outcome.message);
    } catch (error) {
      if (alive.current) onError(authFailureMessage(error));
    } finally {
      inFlight.current = false;
      if (!completed) onStop();
      if (alive.current) setBusy(false);
    }
  }

  if (pendingSignUp)
    return (
      <GoogleUsernameCompletion
        signUp={pendingSignUp}
        onDone={onDone}
        onError={onError}
        onStart={onStart}
      />
    );
  return <GoogleButton onPress={() => void go()} busy={busy} />;
}

function SignInForm({
  onGoogleDone,
  onGoogleStart,
  onGoogleStop,
}: {
  onGoogleDone: (newAccount: boolean) => void;
  onGoogleStart: () => void;
  onGoogleStop: () => void;
}) {
  const { signIn, errors } = useSignIn();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"identifier" | "password" | "code">(
    "identifier",
  );
  const [allowCode, setAllowCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const id = identifier.trim();

  async function identify() {
    if (!signIn) return;
    setBusy(true);
    setError(null);
    try {
      const { error: createError } = await signIn.create({ identifier: id });
      if (createError) {
        setError(errorText(createError));
        return;
      }
      const factors = signIn.supportedFirstFactors.map((f) => f.strategy);
      const canPassword = factors.includes("password");
      const canCode = factors.includes("email_code");
      if (canPassword) {
        setAllowCode(canCode);
        setStep("password");
      } else if (canCode) {
        await sendCode();
      } else {
        setError("No supported sign-in method is available for that account.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function sendCode() {
    if (!signIn) return;
    setBusy(true);
    setError(null);
    try {
      const { error: sendError } = await signIn.emailCode.sendCode(
        id.includes("@") ? { emailAddress: id } : undefined,
      );
      if (sendError) {
        setError(errorText(sendError));
        return;
      }
      setInfo(`We emailed a code to ${id}.`);
      setStep("code");
    } finally {
      setBusy(false);
    }
  }

  async function submitPassword() {
    if (!signIn) return;
    setBusy(true);
    setError(null);
    try {
      const { error: pwError } = await signIn.password({
        identifier: id,
        password,
      });
      if (pwError) {
        setError(errorText(pwError));
        return;
      }
      if (signIn.status === "complete") {
        await finish();
      } else if (
        signIn.status === "needs_client_trust" ||
        signIn.status === "needs_second_factor"
      ) {
        setError(
          "This device needs an extra check. Use “Trouble signing in? Use the browser” below to finish securely.",
        );
      } else {
        setError("Sign-in needs another step. Try the browser sign-in below.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    if (!signIn) return;
    setBusy(true);
    setError(null);
    try {
      const { error: codeError } = await signIn.emailCode.verifyCode({
        code: code.trim(),
      });
      if (codeError) {
        setError(errorText(codeError));
        return;
      }
      if (signIn.status === "complete") await finish();
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!signIn) return;
    const { error: finalizeError } = await signIn.finalize();
    if (finalizeError) {
      setError(errorText(finalizeError));
      return;
    }
    router.replace("/home");
  }

  return (
    <View style={{ gap: 14 }}>
      <GoogleFlow
        onError={setError}
        onDone={onGoogleDone}
        onStart={onGoogleStart}
        onStop={onGoogleStop}
      />
      <Divider label="or continue with email" />

      {step === "identifier" ? (
        <>
          <Field
            label="Email address"
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!busy}
            onSubmitEditing={identify}
            returnKeyType="next"
            placeholder="you@example.com"
            autoComplete="email"
            textContentType="emailAddress"
            error={errors.fields.identifier?.message ?? null}
          />
          <Button
            title="Continue with email"
            block
            disabled={busy || !id}
            busy={busy}
            onPress={identify}
          />
        </>
      ) : null}

      {step === "password" ? (
        <>
          <Pressable
            accessibilityRole="button"
            onPress={() => setStep("identifier")}
            hitSlop={8}
          >
            <Text
              style={{
                color: colors.muted,
                fontFamily: fonts.regular,
                fontSize: 14,
              }}
            >
              ‹ {id}
            </Text>
          </Pressable>
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoFocus
            autoComplete="current-password"
            textContentType="password"
            autoCapitalize="none"
            editable={!busy}
            onSubmitEditing={submitPassword}
            returnKeyType="done"
            error={errors.fields.password?.message ?? null}
          />
          <Button
            title="Sign in"
            block
            disabled={busy || !password}
            busy={busy}
            onPress={submitPassword}
          />
          {allowCode ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void sendCode()}
              disabled={busy}
            >
              <Text
                style={{
                  color: colors.muted,
                  fontFamily: fonts.regular,
                  fontSize: 14,
                  textDecorationLine: "underline",
                }}
              >
                Email me a sign-in code instead
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      {step === "code" ? (
        <>
          {info ? <Notice message={info} tone="success" /> : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => setStep("identifier")}
            hitSlop={8}
          >
            <Text
              style={{
                color: colors.muted,
                fontFamily: fonts.regular,
                fontSize: 14,
              }}
            >
              ‹ Use a different account
            </Text>
          </Pressable>
          <Field
            label="Verification code"
            autoFocus
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            editable={!busy}
            onSubmitEditing={submitCode}
            returnKeyType="done"
            error={errors.fields.code?.message ?? null}
          />
          <Button
            title="Verify code"
            block
            disabled={busy || code.trim().length < 6}
            busy={busy}
            onPress={submitCode}
          />
        </>
      ) : null}

      <Notice message={error} />
    </View>
  );
}

function SignUpForm({
  onGoogleDone,
  onGoogleStart,
  onGoogleStop,
}: {
  onGoogleDone: (newAccount: boolean) => void;
  onGoogleStart: () => void;
  onGoogleStop: () => void;
}) {
  const { signUp, errors } = useSignUp();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"form" | "code">("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function createAccount() {
    if (!signUp) return;
    setBusy(true);
    setError(null);
    try {
      const parts = name.trim().split(/\s+/);
      const normalizedUsername = normalizeGoogleUsername(username);
      if (!normalizedUsername) {
        setError("Use 4–32 lowercase letters, numbers or underscores.");
        return;
      }
      const { error: createError } = await signUp.create({
        emailAddress: email.trim(),
        username: normalizedUsername,
        password,
        firstName: parts[0] || undefined,
        lastName: parts.slice(1).join(" ") || undefined,
      });
      if (createError) {
        setError(errorText(createError));
        return;
      }
      if (signUp.status === "complete") {
        await finish();
        return;
      }
      const { error: sendError } = await signUp.verifications.sendEmailCode();
      if (sendError) {
        setError(errorText(sendError));
        return;
      }
      setInfo(`We emailed a code to ${email.trim()}.`);
      setStep("code");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!signUp) return;
    setBusy(true);
    setError(null);
    try {
      const { error: codeError } = await signUp.verifications.verifyEmailCode({
        code: code.trim(),
      });
      if (codeError) {
        setError(errorText(codeError));
        return;
      }
      if (signUp.status === "complete") await finish();
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!signUp) return;
    const { error: finalizeError } = await signUp.finalize();
    if (finalizeError) {
      setError(errorText(finalizeError));
      return;
    }
    router.replace("/onboarding");
  }

  if (step === "code")
    return (
      <View style={{ gap: 14 }}>
        {info ? <Notice message={info} tone="success" /> : null}
        <Field
          label="Verification code"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
          editable={!busy}
          onSubmitEditing={verify}
          returnKeyType="done"
          error={errors.fields.code?.message ?? null}
        />
        <Button
          title="Verify and continue"
          block
          disabled={busy || code.trim().length < 6}
          busy={busy}
          onPress={verify}
        />
        <Notice message={error} />
      </View>
    );

  return (
    <View style={{ gap: 14 }}>
      <GoogleFlow
        onError={setError}
        onDone={onGoogleDone}
        onStart={onGoogleStart}
        onStop={onGoogleStop}
      />
      <Divider label="or create with email" />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        editable={!busy}
        placeholder="you@example.com"
        error={errors.fields.emailAddress?.message ?? null}
      />
      <Field
        label="Username"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={32}
        editable={!busy}
        placeholder="your-handle"
        hint="4–32 lowercase letters, numbers or underscores."
        error={errors.fields.username?.message ?? null}
      />
      <Field
        label="Name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        editable={!busy}
        placeholder="Your name"
        hint="Shown on your profile."
        error={errors.fields.firstName?.message ?? null}
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        editable={!busy}
        hint="At least 15 characters."
        error={errors.fields.password?.message ?? null}
      />
      <Button
        title="Create account"
        block
        disabled={busy || !email.trim() || !username.trim() || !password}
        busy={busy}
        onPress={createAccount}
      />
      <Notice message={error} />
    </View>
  );
}

export default function SignInScreen() {
  const { isSignedIn } = useClerk();
  const signOut = usePushSignOut();
  const insets = useSafeAreaInsets();
  const { startHostedAuth } = useHostedAuth();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [hostedBusy, setHostedBusy] = useState(false);
  const googleNavigationPending = useRef(false);

  useEffect(() => {
    if (isSignedIn && !googleNavigationPending.current) router.replace("/home");
  }, [isSignedIn]);

  function finishGoogle(newAccount: boolean) {
    googleNavigationPending.current = true;
    router.replace(newAccount ? "/onboarding" : "/home");
  }

  async function openHosted() {
    setHostedBusy(true);
    try {
      await startHostedAuth({ mode });
    } catch {
      /* Native remains primary; hosted auth is only a fallback. */
    } finally {
      setHostedBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.void }}>
      <KeyboardForm
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 20,
          paddingBottom: 40 + insets.bottom,
          gap: 22,
        }}
      >
        <View
          style={{ flexDirection: "row", alignItems: "center", height: 48 }}
        >
          <IconButton
            label="Back"
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace("/home")
            }
            glass={false}
            icon={
              <Text
                style={{
                  color: colors.bone,
                  fontSize: 28,
                  lineHeight: 30,
                  marginTop: -2,
                }}
              >
                ‹
              </Text>
            }
          />
          <View style={{ flex: 1, alignItems: "center" }}>
            <Lockup size={24} />
          </View>
          <View style={{ width: 44 }} />
        </View>

        <View style={{ gap: 6 }}>
          <Kicker color={colors.ember}>
            {mode === "sign-in" ? "Welcome back" : "Join arcenray."}
          </Kicker>
          <PageTitle size={38}>
            {mode === "sign-in" ? "Sign in" : "Create your account"}
          </PageTitle>
          <Text
            style={{
              color: colors.muted,
              fontFamily: fonts.regular,
              fontSize: 15,
              lineHeight: 23,
            }}
          >
            {mode === "sign-in"
              ? "Use Google or your email address."
              : "Use Google or your email to join arcenray."}
          </Text>
        </View>

        <View
          style={{
            flexDirection: "row",
            gap: 4,
            padding: 4,
            borderRadius: radius.pill,
            backgroundColor: colors.graphite,
          }}
        >
          {(["sign-in", "sign-up"] as const).map((m) => {
            const on = mode === m;
            return (
              <Pressable
                key={m}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  haptic();
                  setMode(m);
                }}
                style={{
                  flex: 1,
                  minHeight: 42,
                  borderRadius: radius.pill,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: on ? colors.bone : "transparent",
                }}
              >
                <Text
                  style={{
                    color: on ? colors.void : colors.chead,
                    fontFamily: fonts.bold,
                    fontSize: 14,
                  }}
                >
                  {m === "sign-in" ? "Sign in" : "Create account"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {mode === "sign-in" ? (
          <SignInForm
            onGoogleDone={finishGoogle}
            onGoogleStart={() => {
              googleNavigationPending.current = true;
            }}
            onGoogleStop={() => {
              googleNavigationPending.current = false;
            }}
          />
        ) : (
          <SignUpForm
            onGoogleDone={finishGoogle}
            onGoogleStart={() => {
              googleNavigationPending.current = true;
            }}
            onGoogleStop={() => {
              googleNavigationPending.current = false;
            }}
          />
        )}

        <SignInUpdates />
        <View style={{ gap: 10, paddingTop: 4 }}>
          <Pressable
            accessibilityRole="button"
            disabled={hostedBusy}
            onPress={() => void openHosted()}
            style={{ minHeight: 40, justifyContent: "center" }}
          >
            <Text
              style={{
                color: colors.faint,
                fontFamily: fonts.regular,
                fontSize: 12,
                textDecorationLine: "underline",
              }}
            >
              {hostedBusy ? "Opening…" : "Trouble signing in? Use the browser"}
            </Text>
          </Pressable>
          {isSignedIn ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void signOut()}
              style={{ minHeight: 40, justifyContent: "center" }}
            >
              <Text
                style={{
                  color: colors.faint,
                  fontFamily: fonts.regular,
                  fontSize: 12,
                }}
              >
                Sign out of the current account
              </Text>
            </Pressable>
          ) : null}
        </View>
      </KeyboardForm>
    </View>
  );
}
