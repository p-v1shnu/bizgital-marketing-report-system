import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

import type { NextConfig } from 'next';

function loadRootEnvForFrontend() {
  const rootEnvPath = path.resolve(__dirname, '../../.env');
  if (!existsSync(rootEnvPath)) {
    return;
  }

  const content = readFileSync(rootEnvPath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadRootEnvForFrontend();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: [
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    'http://localhost:3200',
    'http://127.0.0.1:3200',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ],
  outputFileTracingRoot: path.resolve(__dirname, '../..')
};

export default nextConfig;
