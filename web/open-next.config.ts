import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page is rendered per request (prices and sources come from the API), so no
// incremental cache bucket is needed.
export default defineCloudflareConfig({});
