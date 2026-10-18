import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// All application pages render dynamically. No extra cache bucket is required.
export default defineCloudflareConfig({});
