"use client";
import { SignIn } from "@clerk/nextjs";
export function SignInForm({ next }: { next: string }) {
  return <SignIn routing="hash" signUpUrl="/sign-up" forceRedirectUrl={next} />;
}
