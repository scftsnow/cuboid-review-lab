import { defineConfig } from "@playwright/test";

const previewUrl = "http://127.0.0.1:4173";
const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: "./test-results",
  use: {
    baseURL: previewUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-touch",
      use: {
        browserName: "chromium",
        hasTouch: true,
        viewport: { width: 1180, height: 820 },
        deviceScaleFactor: 2,
      },
    },
    {
      name: "webkit-touch",
      use: {
        browserName: "webkit",
        hasTouch: true,
        viewport: { width: 1180, height: 820 },
        deviceScaleFactor: 2,
      },
    },
  ],
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4173 --strictPort",
    url: previewUrl,
    reuseExistingServer: !isCi,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  reporter: isCi ? [["github"], ["html", { open: "never" }]] : [["list"]],
});
