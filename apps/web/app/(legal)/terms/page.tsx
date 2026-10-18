import type { Metadata } from "next";
import { termsOfService } from "../../../lib/legal";
import { PolicyDocument } from "../policy-document";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Arcenray's terms for browsing, publishing creative work and connecting with collaborators.",
  alternates: { canonical: "https://arcenray.com/terms" },
};

export default function TermsPage() {
  return <PolicyDocument policy={termsOfService} />;
}
