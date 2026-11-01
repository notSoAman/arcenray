import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Courier_Prime, Inter_Tight } from "next/font/google";
import "./globals.css";

// Type pairing from the accepted brand system: grotesk for headlines/body,
// tracked mono for kickers and labels only.
const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter-tight",
  display: "swap",
});
const courierPrime = Courier_Prime({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-courier-prime",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://arcenray.com"),
  title: {
    default: "Arcenray — discover independent short films & filmmakers",
    template: "%s · arcenray.",
  },
  description:
    "Discover independent short films, meet the filmmakers and creative crew behind them, and find collaborators for your next project.",
};

export const viewport: Viewport = {
  themeColor: "#0e0f0e",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${interTight.variable} ${courierPrime.variable}`}
    >
      <body>
        {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
        process.env.CLERK_SECRET_KEY ? (
          <ClerkProvider
            dynamic
            signInUrl="/sign-in"
            signUpUrl="/sign-up"
            signInFallbackRedirectUrl="/home"
            signUpFallbackRedirectUrl="/onboarding"
          >
            {children}
          </ClerkProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
