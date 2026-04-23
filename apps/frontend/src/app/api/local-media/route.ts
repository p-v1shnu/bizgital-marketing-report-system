import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function resolveLocalMediaRoot() {
  const directRoot = resolve(process.cwd(), '.local-media');
  const monorepoRoot = resolve(process.cwd(), 'apps/frontend/.local-media');

  if (existsSync(monorepoRoot)) {
    return monorepoRoot;
  }

  if (existsSync(directRoot)) {
    return directRoot;
  }

  const appFolder = resolve(process.cwd(), 'apps/frontend');
  if (existsSync(appFolder)) {
    return monorepoRoot;
  }

  return directRoot;
}

function sanitizeScope(value: unknown) {
  if (typeof value !== 'string') {
    return 'general';
  }

  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized.length > 0 ? normalized : 'general';
}

function resolveExtension(file: File) {
  const fromName = extname(file.name).toLowerCase();
  if (fromName.length > 0 && fromName.length <= 8) {
    return fromName;
  }

  if (file.type === 'image/png') {
    return '.png';
  }
  if (file.type === 'image/webp') {
    return '.webp';
  }
  if (file.type === 'image/gif') {
    return '.gif';
  }

  return '.jpg';
}

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth.user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Image file is required.' },
        { status: 400 }
      );
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Only image files are supported.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'Image size must be at most 10 MB.' },
        { status: 400 }
      );
    }

    const scope = sanitizeScope(formData.get('scope'));
    const extension = resolveExtension(file);
    const filename = `${Date.now()}-${randomUUID()}${extension}`;
    const localMediaRoot = resolveLocalMediaRoot();
    const targetDirectory = resolve(localMediaRoot, 'uploads', scope);
    const filePath = resolve(targetDirectory, filename);

    await mkdir(targetDirectory, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    return NextResponse.json({
      path: `/uploads/${scope}/${filename}`
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to upload image.' },
      { status: 500 }
    );
  }
}
