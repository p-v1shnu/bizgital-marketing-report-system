const { existsSync, readdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const prismaClientDir = resolve(__dirname, '../../../node_modules/.prisma/client');
const requiredFiles = ['index.js', 'index.d.ts'];

const hasEngineArtifact = () => {
  if (!existsSync(prismaClientDir)) {
    return false;
  }

  return readdirSync(prismaClientDir).some((filename) =>
    filename.startsWith('query_engine')
  );
};

const hasGeneratedClient =
  requiredFiles.every((filename) => existsSync(resolve(prismaClientDir, filename))) &&
  hasEngineArtifact();

if (hasGeneratedClient) {
  console.log('[build] Prisma Client already present. Skipping prisma generate.');
  process.exit(0);
}

console.log('[build] Prisma Client artifacts missing. Running prisma generate...');
const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['prisma', 'generate', '--schema', 'prisma/schema.prisma'],
  {
    cwd: resolve(__dirname, '..'),
    stdio: 'inherit',
    env: process.env
  }
);

if (result.error) {
  console.error('[build] Failed to run prisma generate:', result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const generatedNow =
  requiredFiles.every((filename) => existsSync(resolve(prismaClientDir, filename))) &&
  hasEngineArtifact();

if (!generatedNow) {
  console.error(
    '[build] prisma generate completed but required client artifacts are still missing.'
  );
  process.exit(1);
}

console.log('[build] Prisma Client generated successfully.');
