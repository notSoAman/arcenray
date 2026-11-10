import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { useClerk, useSignIn, useSignUp } from "@clerk/expo";
import { useSSO } from "@clerk/expo/experimental";
import { useHostedAuth } from "@clerk/expo/hosted-auth";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import { LogoTile, Lockup } from "../src/brand";
import { Spectrum } from "../src/visuals";
import { Button, Field, Kicker, Notice } from "../src/ui";
import { IconGoogle } from "../src/icons";
import { colors, fonts, radius } from "../src/theme";

/**
 * Native in-app sign-in / sign-up using Clerk's future (Core 3) resources.
 * Matches the web sign-in art + form layout. Clerk production factors:
 * email code, password (min 15), username; Google OAuth.
 */

type Mode = "sign-in" | "sign-up";

/**
 * Clerk authorizes `clerk://<package>.callback` for the registered native app.
 * The SDK default (`<scheme>://sso-callback`) is not on that allowlist, so pass
 * the registered callback explicitly.
 */
const packageName =
  Constants.expoConfig?.android?.package ?? "com.arcenray.mobile";
const ssoRedirectUrl = `clerk://${packageName}.callback`;

function errorText(error: { longMessage?: string; message?: string } | null) {
  return error?.longMessage ?? error?.message ?? "That didn't finish. Try again.";
}

function GoogleButton({ onPress, busy }: { onPress: () => void; busy: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 52,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.lineStrong,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 10,
        opacity: pressed || busy ? 0.6 : 1,
      })}
    >
      <IconGoogle size={18} />
      <Text style={{ color: colors.bone, fontFamily: fonts.semibold, fontSize: 16 }}>
        Continue with Google
      </Text>
    </Pressable>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
      <Text style={{ color: colors.faint, fontFamily: fonts.regular, fontSize: 13 }}>
        {label}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
    </View>
  );
}

function SignInForm() {
  const { signIn, errors } = useSignIn();
  const { startSSOFlow } = useSSO();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"identifier" | "password" | "code">("identifier");
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
      const { error: pwError } = await signIn.password({ identifier: id, password });
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
      const { error: codeError } = await signIn.emailCode.verifyCode({ code: code.trim() });
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

  async function google() {
    setBusy(true);
    setError(null);
    try {
      const { createdSessionId } = await startSSOFlow({ strategy: "oauth_google", redirectUrl: ssoRedirectUrl });
      if (createdSessionId) router.replace("/home");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google sign-in didn't finish.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 14 }}>
      <GoogleButton onPress={google} busy={busy} />
      <Divider label="or with your account" />

      {step === "identifier" ? (
        <>
          <Field
            label="Email or username"
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!busy}
            onSubmitEditing={identify}
            returnKeyType="next"
            error={errors.fields.identifier?.message ?? null}
          />
          <Button
            title="Continue"
            block
            disabled={busy || !id}
            busy={busy}
            onPress={identify}
          />
        </>
      ) : null}

      {step === "password" ? (
        <>
          <Pressable accessibilityRole="button" onPress={() => setStep("identifier")} hitSlop={8}>
            <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 14 }}>
              ‹ {id}
            </Text>
          </Pressable>
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
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
            <Pressable accessibilityRole="button" onPress={() => void sendCode()} disabled={busy}>
              <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 14, textDecorationLine: "underline" }}>
                Email me a sign-in code instead
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      {step === "code" ? (
        <>
          {info ? <Notice message={info} tone="success" /> : null}
          <Pressable accessibilityRole="button" onPress={() => setStep("identifier")} hitSlop={8}>
            <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 14 }}>
              ‹ Use a different account
            </Text>
          </Pressable>
          <Field
            label="Verification code"
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

function SignUpForm() {
  const { signUp, errors } = useSignUp();
  const { startSSOFlow } = useSSO();

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
      const { error: createError } = await signUp.create({
        emailAddress: email.trim(),
        username: username.trim().toLowerCase(),
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

  async function google() {
    setBusy(true);
    setError(null);
    try {
      const { createdSessionId } = await startSSOFlow({ strategy: "oauth_google", redirectUrl: ssoRedirectUrl });
      if (createdSessionId) router.replace("/onboarding");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google sign-up didn't finish.");
    } finally {
      setBusy(false);
    }
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
      <GoogleButton onPress={google} busy={busy} />
      <Divider label="or create with email" />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        editable={!busy}
        error={errors.fields.emailAddress?.message ?? null}
      />
      <Field
        label="Username"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
        hint="4–64 characters. Used to sign in and share your profile."
        error={errors.fields.username?.message ?? null}
      />
      <Field
        label="Name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        editable={!busy}
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
  const { signOut } = useClerk();
  const { startHostedAuth } = useHostedAuth();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [hostedBusy, setHostedBusy] = useState(false);

  async function openHosted() {
    setHostedBusy(true);
    try {
      await startHostedAuth({ mode });
    } catch {
      /* The native screen is primary; hosted auth is only a fallback. */
    } finally {
      setHostedBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.void }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 24, paddingBottom: 60, gap: 24 }}
        >
          <Lockup />

          {/* Art panel — the accepted sign-in artboard, stacked on phone. */}
          <View style={{ borderRadius: radius.panel, overflow: "hidden" }}>
            <LinearGradient
              colors={["rgba(14,15,14,0.2)", "rgba(14,15,14,0.75)"]}
              style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, zIndex: 1 }}
            />
            <Spectrum kind="hero" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />
            <View style={{ padding: 28, gap: 20, zIndex: 2 }}>
              <LogoTile size={120} />
              <Text style={{ color: colors.text, fontFamily: fonts.extraBold, fontSize: 32, letterSpacing: -1.3, lineHeight: 34 }}>
                Find your people.{"\n"}
                <Text style={{ color: colors.pink }}>Make your art.</Text>
              </Text>
            </View>
          </View>

          <View style={{ gap: 14 }}>
            <Kicker color={colors.ember}>
              {mode === "sign-in" ? "Welcome back" : "Join arcenray."}
            </Kicker>
            <Text style={{ color: colors.text, fontFamily: fonts.extraBold, fontSize: 36, letterSpacing: -1.4, lineHeight: 40 }}>
              {mode === "sign-in" ? "Sign in" : "Create your account"}
            </Text>
            <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 }}>
              {mode === "sign-in"
                ? "Sign in with Google, your email address or account username."
                : "Use Google or an email and username to join arcenray."}
            </Text>
          </View>

          {mode === "sign-in" ? <SignInForm /> : <SignUpForm />}

          <View style={{ gap: 10 }}>
            {mode === "sign-in" ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setMode("sign-up")}
                style={{ minHeight: 44, justifyContent: "center" }}
              >
                <Text style={{ color: colors.bone, fontFamily: fonts.bold, fontSize: 15 }}>
                  New to arcenray? Create an account
                </Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => setMode("sign-in")}
                style={{ minHeight: 44, justifyContent: "center" }}
              >
                <Text style={{ color: colors.bone, fontFamily: fonts.bold, fontSize: 15 }}>
                  Already have an account? Sign in
                </Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              onPress={() => void signOut()}
              style={{ minHeight: 40, justifyContent: "center" }}
            >
              <Text style={{ color: colors.faint, fontFamily: fonts.regular, fontSize: 13 }}>
                Sign out
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={hostedBusy}
              onPress={() => void openHosted()}
              style={{ minHeight: 40, justifyContent: "center" }}
            >
              <Text style={{ color: colors.faint, fontFamily: fonts.regular, fontSize: 13, textDecorationLine: "underline" }}>
                {hostedBusy ? "Opening…" : "Trouble signing in? Use the browser"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
