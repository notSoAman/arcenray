import type { Metadata } from "next";
import { privacyPolicy } from "../../../lib/legal";
import { PolicyDocument } from "../policy-document";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Arcenray handles account information, creative work, messages and preferences.",
  alternates: { canonical: "https://arcenray.com/privacy" },
};

export default function PrivacyPage() {
  return <PolicyDocument policy={privacyPolicy} />;
}
