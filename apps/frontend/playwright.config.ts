import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

const frontendBaseUrl =
  process.env.E2E_FRONTEND_BASE_URL ?? 'http://localhost:3200';
const backendBaseUrl =
  process.env.E2E_BACKEND_BASE_URL ?? 'http://localhost:3003/api';
const repoRoot = resolve(__dirname, '../..');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 90_000,
  reporter: process.env.CI ? [['github'], ['line']] : 'list',
  use: {
    baseURL: frontendBaseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  webServer: [
    {
      command: 'npm --workspace @bizgital-marketing-report/backend run start:e2e',
      cwd: repoRoot,
      url: `${backendBaseUrl}/health`,
      timeout: 300_000,
      reuseExistingServer: !process.env.CI,
      env: {
        ...process.env,
        PORT: process.env.PORT ?? '3003',
        APP_ORIGIN: frontendBaseUrl,
        API_PREFIX: process.env.API_PREFIX ?? 'api',
        IMPORT_STORAGE_DIR: process.env.IMPORT_STORAGE_DIR ?? 'storage/imports'
      }
    },
    {
      command: 'npm --workspace @bizgital-marketing-report/frontend run dev:e2e',
      cwd: repoRoot,
      url: frontendBaseUrl,
      timeout: 240_000,
      reuseExistingServer: !process.env.CI,
      env: {
        ...process.env,
        INTERNAL_API_BASE_URL: backendBaseUrl,
        NEXT_PUBLIC_API_BASE_URL: backendBaseUrl
      }
    }
  ]
});
