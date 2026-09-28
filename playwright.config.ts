import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", timeout: 90_000, workers: 1, retries: process.env.CI ? 1 : 0,
  use: { baseURL: "http://localhost:3330", trace: "retain-on-failure",
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } },
  webServer: [
    { command: "npx next dev --port 3330", url: "http://localhost:3330", timeout: 120_000,
      env: { NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "", NEXT_PUBLIC_LOCAL_SIGNAL_PORT: "3331" } },
    { command: "node --import tsx scripts/signaling.ts", port: 3331, env: { SIGNAL_PORT: "3331" } },
  ],
});
