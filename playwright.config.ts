import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
// Use a locally installed browser channel when set (e.g. PW_CHANNEL=msedge); CI installs Chromium.
const channel = process.env.PW_CHANNEL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // Serial locally keeps one browser and the server from competing for CPU; CI runners are dedicated.
  workers: process.env.CI ? 2 : 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { outputFolder: "e2e/report", open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    ...(channel ? { channel } : {}),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], ...(channel ? { channel } : {}) } },
    { name: "mobile", use: { ...devices["Pixel 7"], ...(channel ? { channel } : {}) } },
  ],
  webServer: {
    command: "node server/dist/index.js",
    url: `http://127.0.0.1:${PORT}/health`,
    stdout: "pipe",
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      // Test mode relaxes per-IP rate limits: every e2e account is created from the same address.
      NODE_ENV: "test",
      PORT: String(PORT),
      APP_URL: `http://localhost:${PORT}`,
      JOB_TOKEN: "e2e-job-token-0123456789abcdef",
      SESSION_SECRET: "e2e-session-secret-0123456789abcdef0123",
      LOG_LEVEL: "info",
    },
  },
});
