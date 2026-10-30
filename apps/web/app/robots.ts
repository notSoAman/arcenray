import type { MetadataRoute } from "next";

const siteUrl = "https://arcenray.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/api/",
        "/auth/",
        "/chats/",
        "/onboarding/",
        "/profile/edit/",
        "/publish/",
        "/settings/",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
