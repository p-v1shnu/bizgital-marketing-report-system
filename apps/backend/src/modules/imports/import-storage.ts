import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

const STORAGE_MARKER = '/storage/imports/';

function getStorageRootCandidates() {
  const configuredRoot = process.env.IMPORT_STORAGE_DIR;

  if (configuredRoot && isAbsolute(configuredRoot)) {
    return [resolve(configuredRoot)];
  }

  const relativeRoot = configuredRoot || join('storage', 'imports');
  const baseDirectories = Array.from(
    new Set(
      [
        process.env.INIT_CWD,
        process.env.npm_config_local_prefix,
        resolve(process.cwd(), '..', '..'),
        process.cwd()
      ].filter((value): value is string => !!value && value.trim().length > 0)
    )
  );

  return baseDirectories.map((baseDirectory) =>
    resolve(baseDirectory, relativeRoot)
  );
}

export function getImportStorageRoot() {
  const candidates = getStorageRootCandidates();

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

export function toStoredImportPath(
  brandCode: string,
  periodId: string,
  storedFilename: string
) {
  return [brandCode, periodId, storedFilename].join('/');
}

export function resolveImportStoragePath(input: {
  storagePath: string;
  brandCode: string;
  periodId: string;
  storedFilename: string;
}) {
  const storageRoots = getStorageRootCandidates();
  const candidates = new Set<string>();

  if (input.storagePath) {
    if (isAbsolute(input.storagePath)) {
      candidates.add(resolve(input.storagePath));
    } else {
      for (const storageRoot of storageRoots) {
        candidates.add(resolve(storageRoot, input.storagePath));
      }
    }

    const normalizedStoragePath = input.storagePath.replace(/\\/g, '/');
    const markerIndex = normalizedStoragePath
      .toLowerCase()
      .lastIndexOf(STORAGE_MARKER);

    if (markerIndex !== -1) {
      const relativePath = normalizedStoragePath
        .slice(markerIndex + STORAGE_MARKER.length)
        .split('/')
        .filter(Boolean);

      if (relativePath.length > 0) {
        for (const storageRoot of storageRoots) {
          candidates.add(resolve(storageRoot, ...relativePath));
        }
      }
    }
  }

  for (const storageRoot of storageRoots) {
    candidates.add(
      resolve(
        storageRoot,
        toStoredImportPath(input.brandCode, input.periodId, input.storedFilename)
      )
    );
  }

  const resolvedCandidates = Array.from(candidates);

  return (
    resolvedCandidates.find((candidate) => existsSync(candidate)) ??
    resolvedCandidates[resolvedCandidates.length - 1]
  );
}
