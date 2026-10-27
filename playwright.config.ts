import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    viewport: { width: 1280, height: 720 },
    locale: 'zh-CN',
    // 使用系统已安装的 Chrome，无需下载 Playwright 自带浏览器
    channel: 'chrome',
  },
  webServer: {
    command: 'node dist-server/server/index.js',
    port: 3100,
    env: { PORT: '3100', HOST: '127.0.0.1', DB_PATH: 'data/e2e-test.db' },
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
