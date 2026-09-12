#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wranglerBin = join(repoRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

function readOption(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index !== -1 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return fallback;
}

const timestamp = new Date()
  .toISOString()
  .replace(/[-:T]/g, '')
  .replace(/\..+$/, '');
const output = resolve(
  readOption('--output', join(repoRoot, 'work', `d1-export-${timestamp}.sql`))
);

mkdirSync(dirname(output), { recursive: true });

const result = spawnSync(
  process.execPath,
  [
    wranglerBin,
    'd1',
    'export',
    'DB',
    '--remote',
    '--output',
    output,
    '--skip-confirmation'
  ],
  {
    cwd: join(repoRoot, 'apps', 'api'),
    stdio: 'inherit'
  }
);

if (result.error) {
  console.error(`Failed to start Wrangler: ${result.error.message}`);
  process.exit(1);
}

if (result.status === null) {
  process.exit(1);
}

process.exit(result.status);
