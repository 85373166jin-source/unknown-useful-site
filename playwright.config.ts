import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'playwright/test';

const root = process.cwd();
const apiDir = path.join(root, 'apps', 'api');
const webDir = path.join(root, 'apps', 'web');
const wranglerCandidates = [
  path.join(apiDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
  path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
];
const viteCandidates = [
  path.join(webDir, 'node_modules', 'vite', 'bin', 'vite.js'),
  path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
];
const wranglerBin = wranglerCandidates.find((candidate) => fs.existsSync(candidate));
const viteBin = viteCandidates.find((candidate) => fs.existsSync(candidate));
if (!wranglerBin || !viteBin) throw new Error('wrangler or vite executable was not found');
const seedScript = path.join(root, 'tests', 'e2e', 'seed-local.mjs');
const configHome = path.join(root, 'work', '.config');

const apiVars = [
  'SESSION_PEPPER:test-session-pepper',
  'CONTACT_HMAC_SECRET:test-contact-secret',
  'ALLOWED_ORIGINS:http://127.0.0.1:5173,http://localhost:5173',
  'ADMIN_USERNAME:admin'
]
  .map((entry) => `--var ${entry}`)
  .join(' ');

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'msedge',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: [
    {
      command: `node ${seedScript} && node ${wranglerBin} dev --local --ip 127.0.0.1 --port 8787 --show-interactive-dev-session false ${apiVars}`,
      cwd: apiDir,
      url: 'http://127.0.0.1:8787/api/v1/health',
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...process.env, XDG_CONFIG_HOME: configHome }
    },
    {
      command: `node ${viteBin} --host 127.0.0.1 --port 5173 --strictPort`,
      cwd: webDir,
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      timeout: 120_000
    }
  ]
});
