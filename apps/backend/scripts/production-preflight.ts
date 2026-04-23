import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type CheckLevel = 'pass' | 'warn' | 'fail';

type CheckResult = {
  name: string;
  level: CheckLevel;
  detail: string;
};

type ParsedArgs = {
  checkApi: boolean;
  baseUrl: string;
};

const AUTH_SESSION_DEV_FALLBACK_SECRET = 'dev-insecure-auth-session-secret';
const AUTH_SESSION_PLACEHOLDER_SECRET = 'change-this-in-production';
const MIN_SECRET_LENGTH = 32;
const MIN_READ_PRESIGN_SECONDS = 30;
const MAX_READ_PRESIGN_SECONDS = 600;

function parseArgs(argv: string[]): ParsedArgs {
  const checkApi = argv.includes('--check-api');
  const baseUrlArg = argv.find((value) => value.startsWith('--base-url='));
  const defaultBaseUrl =
    process.env.INTERNAL_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    'http://localhost:3003/api';

  return {
    checkApi,
    baseUrl: (baseUrlArg?.split('=')[1] ?? defaultBaseUrl).replace(/\/+$/g, '')
  };
}

function parseDotEnvFile(path: string) {
  if (!existsSync(path)) {
    return {};
  }

  const output: Record<string, string> = {};
  const content = readFileSync(path, 'utf8');

  for (const rawLine of content.split(/\r?\n/g)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const equalsIndex = line.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

    if (!key) {
      continue;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    output[key] = value;
  }

  return output;
}

function readLocalEnvMap() {
  const cwd = process.cwd();
  const candidates = [
    resolve(cwd, '.env'),
    resolve(cwd, '.env.local'),
    resolve(cwd, 'apps/backend/.env'),
    resolve(cwd, 'apps/backend/.env.local'),
    resolve(cwd, '../../.env'),
    resolve(cwd, '../../.env.local')
  ];
  const merged: Record<string, string> = {};

  for (const path of candidates) {
    Object.assign(merged, parseDotEnvFile(path));
  }

  return merged;
}

function readFrontendEnvMap() {
  const cwd = process.cwd();
  const candidates = [
    resolve(cwd, 'apps/frontend/.env.local'),
    resolve(cwd, 'apps/frontend/.env'),
    resolve(cwd, '../frontend/.env.local'),
    resolve(cwd, '../frontend/.env')
  ];
  const merged: Record<string, string> = {};

  for (const path of candidates) {
    Object.assign(merged, parseDotEnvFile(path));
  }

  return merged;
}

function resolveEnv(name: string, localEnv: Record<string, string>) {
  return (process.env[name] ?? localEnv[name] ?? '').trim();
}

function maskSecret(value: string) {
  if (!value) {
    return '(missing)';
  }

  if (value.length <= 8) {
    return '********';
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function readBodySnippet(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '(empty body)';
  }

  return normalized.slice(0, 140);
}

function addRequiredEnvChecks(
  results: CheckResult[],
  localEnv: Record<string, string>
) {
  const requiredVars = [
    'AUTH_SESSION_SECRET',
    'MEDIA_S3_ENDPOINT',
    'MEDIA_S3_BUCKET',
    'MEDIA_S3_ACCESS_KEY',
    'MEDIA_S3_SECRET_KEY',
    'MEDIA_S3_PUBLIC_BASE_URL',
    'MEDIA_READ_PRESIGN_EXPIRES_SECONDS'
  ];

  for (const variable of requiredVars) {
    const value = resolveEnv(variable, localEnv);
    results.push({
      name: `Env ${variable}`,
      level: value ? 'pass' : 'fail',
      detail: value ? 'configured' : 'missing'
    });
  }
}

function addAuthSecretChecks(
  results: CheckResult[],
  localEnv: Record<string, string>,
  frontendEnv: Record<string, string>
) {
  const backendSecret = resolveEnv('AUTH_SESSION_SECRET', localEnv);
  const frontendSecret = (process.env.AUTH_SESSION_SECRET ?? frontendEnv.AUTH_SESSION_SECRET ?? '').trim();

  if (!backendSecret) {
    results.push({
      name: 'Auth session secret value',
      level: 'fail',
      detail: 'missing'
    });
    return;
  }

  if (
    backendSecret === AUTH_SESSION_DEV_FALLBACK_SECRET ||
    backendSecret === AUTH_SESSION_PLACEHOLDER_SECRET
  ) {
    results.push({
      name: 'Auth session secret value',
      level: 'fail',
      detail: `uses insecure default placeholder (${maskSecret(backendSecret)})`
    });
  } else {
    results.push({
      name: 'Auth session secret value',
      level: 'pass',
      detail: `configured (${maskSecret(backendSecret)})`
    });
  }

  if (backendSecret.length < MIN_SECRET_LENGTH) {
    results.push({
      name: 'Auth session secret length',
      level: 'fail',
      detail: `must be at least ${MIN_SECRET_LENGTH} characters`
    });
  } else {
    results.push({
      name: 'Auth session secret length',
      level: 'pass',
      detail: `length ${backendSecret.length}`
    });
  }

  if (frontendSecret && frontendSecret !== backendSecret) {
    results.push({
      name: 'Frontend/backend auth secret alignment',
      level: 'fail',
      detail: 'AUTH_SESSION_SECRET does not match between frontend and backend env files'
    });
  } else {
    results.push({
      name: 'Frontend/backend auth secret alignment',
      level: 'pass',
      detail: frontendSecret
        ? 'matching value detected'
        : 'frontend secret file not found, using backend/runtime value only'
    });
  }
}

function addMediaReadTtlChecks(
  results: CheckResult[],
  localEnv: Record<string, string>
) {
  const rawValue = resolveEnv('MEDIA_READ_PRESIGN_EXPIRES_SECONDS', localEnv);
  const parsed = Number(rawValue);

  if (!Number.isInteger(parsed)) {
    results.push({
      name: 'Media read presign TTL',
      level: 'fail',
      detail: 'must be an integer in seconds'
    });
    return;
  }

  if (parsed < MIN_READ_PRESIGN_SECONDS || parsed > MAX_READ_PRESIGN_SECONDS) {
    results.push({
      name: 'Media read presign TTL',
      level: 'fail',
      detail: `must be between ${MIN_READ_PRESIGN_SECONDS} and ${MAX_READ_PRESIGN_SECONDS} seconds`
    });
    return;
  }

  results.push({
    name: 'Media read presign TTL',
    level: 'pass',
    detail: `${parsed} seconds`
  });
}

function addUrlSanityChecks(
  results: CheckResult[],
  localEnv: Record<string, string>
) {
  const nodeEnv = (resolveEnv('NODE_ENV', localEnv) || 'development').toLowerCase();
  const appOrigin = resolveEnv('APP_ORIGIN', localEnv);
  const mediaPublicBaseUrl = resolveEnv('MEDIA_S3_PUBLIC_BASE_URL', localEnv);

  if (!appOrigin) {
    results.push({
      name: 'App origin',
      level: 'warn',
      detail: 'APP_ORIGIN is missing'
    });
  } else if (nodeEnv === 'production' && !appOrigin.startsWith('https://')) {
    results.push({
      name: 'App origin',
      level: 'fail',
      detail: 'APP_ORIGIN should use https:// in production'
    });
  } else {
    results.push({
      name: 'App origin',
      level: 'pass',
      detail: appOrigin
    });
  }

  if (!mediaPublicBaseUrl) {
    results.push({
      name: 'Media public base URL',
      level: 'warn',
      detail: 'MEDIA_S3_PUBLIC_BASE_URL is missing'
    });
  } else if (nodeEnv === 'production' && mediaPublicBaseUrl.startsWith('http://')) {
    results.push({
      name: 'Media public base URL',
      level: 'fail',
      detail: 'MEDIA_S3_PUBLIC_BASE_URL should use https:// in production'
    });
  } else if (nodeEnv === 'production' && /localhost|127\.0\.0\.1/i.test(mediaPublicBaseUrl)) {
    results.push({
      name: 'Media public base URL',
      level: 'fail',
      detail: 'MEDIA_S3_PUBLIC_BASE_URL points to localhost in production'
    });
  } else {
    results.push({
      name: 'Media public base URL',
      level: 'pass',
      detail: mediaPublicBaseUrl
    });
  }
}

async function addApiGuardChecks(results: CheckResult[], baseUrl: string) {
  const checks: Array<{
    name: string;
    path: string;
    body: Record<string, unknown>;
  }> = [
    {
      name: 'Anonymous media presign-upload blocked',
      path: '/media/presign-upload',
      body: {
        filename: 'preflight.webp',
        mimeType: 'image/webp',
        sizeBytes: 1024,
        scope: 'preflight'
      }
    },
    {
      name: 'Anonymous media presign-read blocked',
      path: '/media/presign-read',
      body: {
        publicUrl: 'https://example.invalid/uploads/any.webp'
      }
    },
    {
      name: 'Anonymous media delete blocked',
      path: '/media/delete-object',
      body: {
        publicUrl: 'https://example.invalid/uploads/any.webp'
      }
    }
  ];

  for (const check of checks) {
    try {
      const response = await fetch(`${baseUrl}${check.path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(check.body)
      });

      if (response.status === 401) {
        results.push({
          name: check.name,
          level: 'pass',
          detail: 'returned 401 as expected'
        });
      } else {
        const bodyText = await response.text().catch(() => '');
        results.push({
          name: check.name,
          level: 'fail',
          detail: `expected 401, got ${response.status} (${readBodySnippet(bodyText)})`
        });
      }
    } catch (error) {
      results.push({
        name: check.name,
        level: 'fail',
        detail: `request failed: ${error instanceof Error ? error.message : 'unknown error'}`
      });
    }
  }
}

function printSummary(results: CheckResult[]) {
  console.log('Production preflight checks:\n');

  for (const result of results) {
    const icon = result.level === 'pass' ? 'PASS' : result.level === 'warn' ? 'WARN' : 'FAIL';
    console.log(`[${icon}] ${result.name}: ${result.detail}`);
  }

  const passCount = results.filter((result) => result.level === 'pass').length;
  const warnCount = results.filter((result) => result.level === 'warn').length;
  const failCount = results.filter((result) => result.level === 'fail').length;

  console.log('\nSummary:');
  console.log(`- pass: ${passCount}`);
  console.log(`- warn: ${warnCount}`);
  console.log(`- fail: ${failCount}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const localEnv = readLocalEnvMap();
  const frontendEnv = readFrontendEnvMap();
  const results: CheckResult[] = [];

  addRequiredEnvChecks(results, localEnv);
  addAuthSecretChecks(results, localEnv, frontendEnv);
  addMediaReadTtlChecks(results, localEnv);
  addUrlSanityChecks(results, localEnv);

  if (args.checkApi) {
    await addApiGuardChecks(results, args.baseUrl);
  }

  printSummary(results);

  const hasFail = results.some((result) => result.level === 'fail');
  if (hasFail) {
    process.exit(1);
  }
}

void main();
