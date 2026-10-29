import { PHASE_PRODUCTION_BUILD } from "next/constants.js";
import process from "node:process";
import { assertMediaBuildConfig } from "./lib/media/build-config.mjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value:
              'camera=(), microphone=(), geolocation=(), fullscreen=(self "https://www.youtube-nocookie.com" "https://player.vimeo.com")',
          },
        ],
      },
    ];
  },
};

export default function config(phase) {
  if (phase === PHASE_PRODUCTION_BUILD) {
    assertMediaBuildConfig(process.env.NEXT_PUBLIC_MEDIA_URL);
  }
  return nextConfig;
}
