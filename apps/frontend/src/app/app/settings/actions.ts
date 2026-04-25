'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireAnyAdmin } from '@/lib/auth';
import {
  createImportColumnMappingDraftFromHeaders,
  createBrand,
  createUser,
  discardImportColumnMappingDraft,
  deleteBrand,
  deleteUser,
  getImportColumnMappingConfig,
  publishImportColumnMapping,
  rollbackImportColumnMapping,
  updateContentCountPolicy,
  updateTopContentDataSourcePolicy,
  type ImportColumnMappingRule,
  updateImportColumnMappingDraft,
  updateBrand,
  updateUser
} from '@/lib/reporting-api';

const defaultReturnPath = '/app/settings';

function normalizeReturnPath(value: FormDataEntryValue | null) {
  const candidate = String(value ?? '').trim();

  if (!candidate || !candidate.startsWith('/app') || candidate.startsWith('//')) {
    return defaultReturnPath;
  }

  return candidate;
}

function normalizeText(value: FormDataEntryValue | null) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function toPage(params: Record<string, string>, returnPath = defaultReturnPath): never {
  const targetUrl = new URL(returnPath, 'http://localhost');
  const search = new URLSearchParams(targetUrl.search);

  for (const [key, value] of Object.entries(params)) {
    search.set(key, value);
  }

  const nextPath = `${targetUrl.pathname}${search.toString() ? `?${search.toString()}` : ''}${targetUrl.hash}`;
  redirect(nextPath);
}

function revalidateSettings() {
  revalidatePath('/app/settings');
  revalidatePath('/app/column-config');
  revalidatePath('/app/users');
  revalidatePath('/app/brands');
}

function parseCsvHeadersFromText(csvText: string) {
  const headers: string[] = [];
  let token = '';
  let inQuotes = false;
  let headerRowClosed = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const next = csvText[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        token += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      headers.push(token.trim());
      token = '';
      headerRowClosed = true;
      break;
    }

    if (!inQuotes && char === ',') {
      headers.push(token.trim());
      token = '';
      continue;
    }

    token += char;
  }

  if (!headerRowClosed && (token.trim().length > 0 || headers.length === 0)) {
    headers.push(token.trim());
  }

  return headers
    .map((header) => header.replace(/^\uFEFF/, '').trim())
    .filter((header) => !!header);
}

function parseImportMappingRulesFromFormData(formData: FormData): ImportColumnMappingRule[] {
  const targetFields = formData.getAll('targetField').map((value) => normalizeText(value));
  const baselineHeaders = formData.getAll('baselineHeader').map((value) => normalizeText(value));
  const displayLabels = formData.getAll('displayLabel').map((value) => normalizeText(value));
  const aliases = formData.getAll('aliases').map((value) => normalizeText(value));
  const requiredTargets = new Set(
    formData.getAll('requiredTarget').map((value) => normalizeText(value))
  );

  return targetFields.map((targetField, index) => ({
    targetField,
    baselineHeader: baselineHeaders[index] ?? '',
    displayLabel: displayLabels[index] ?? '',
    aliases: (aliases[index] ?? '')
      .split(',')
      .map((item) => item.replace(/\s+/g, ' ').trim())
      .filter((item) => !!item),
    required: requiredTargets.has(targetField)
  }));
}

export async function createUserAction(formData: FormData) {
  const returnPath = normalizeReturnPath(formData.get('returnPath'));
  await requireAnyAdmin(returnPath);

  const email = normalizeText(formData.get('email')).toLowerCase();
  const displayName = normalizeText(formData.get('displayName'));
  const status = normalizeText(formData.get('status')) as 'active' | 'invited' | 'inactive';
  const password = normalizeText(formData.get('password'));
  const brandCode = normalizeText(formData.get('brandCode'));
  const role = normalizeText(formData.get('role')) as
    | 'admin'
    | 'content'
    | 'approver'
    | 'viewer';

  if (!email || !displayName) {
    toPage({ error: 'Email and display name are required.' }, returnPath);
  }

  try {
    await createUser({
      email,
      displayName,
      status,
      ...(role === 'admin' && !brandCode ? { globalAdmin: true } : {}),
      ...(password ? { password } : {}),
      ...(brandCode && role
        ? {
            memberships: [
              {
                brandCode,
                role
              }
            ]
          }
        : {})
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create user.';
    toPage({ error: message }, returnPath);
  }

  revalidateSettings();
  toPage({ message: `User "${displayName}" created.` }, returnPath);
}

export async function updateUserAction(formData: FormData) {
  const returnPath = normalizeReturnPath(formData.get('returnPath'));
  await requireAnyAdmin(returnPath);

  const userId = normalizeText(formData.get('userId'));
  const displayName = normalizeText(formData.get('displayName'));
  const email = normalizeText(formData.get('email')).toLowerCase();
  const status = normalizeText(formData.get('status')) as 'active' | 'invited' | 'inactive';
  const password = normalizeText(formData.get('password'));

  if (!userId || !email || !displayName || !status) {
    toPage({ error: 'User update payload is incomplete.' }, returnPath);
  }

  try {
    await updateUser(userId, {
      displayName,
      email,
      status,
      ...(password ? { password } : {})
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update user.';
    toPage({ error: message }, returnPath);
  }

  revalidateSettings();
  toPage({ message: `User "${displayName}" updated.` }, returnPath);
}

export async function deleteUserAction(formData: FormData) {
  const returnPath = normalizeReturnPath(formData.get('returnPath'));
  await requireAnyAdmin(returnPath);

  const userId = normalizeText(formData.get('userId'));
  const displayName = normalizeText(formData.get('displayName'));

  if (!userId) {
    toPage({ error: 'User delete payload is incomplete.' }, returnPath);
  }

  try {
    await deleteUser(userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete user.';
    toPage({ error: message }, returnPath);
  }

  revalidateSettings();
  toPage({ message: `User "${displayName || 'selected user'}" deleted.` }, returnPath);
}

export async function createBrandAction(formData: FormData) {
  const returnPath = normalizeReturnPath(formData.get('returnPath'));
  await requireAnyAdmin(returnPath);

  const name = normalizeText(formData.get('name'));
  const rawStatus = normalizeText(formData.get('status'));
  const status: 'active' | 'inactive' = rawStatus === 'inactive' ? 'inactive' : 'active';
  const logoUrl = normalizeText(formData.get('logoUrl'));

  if (!name) {
    toPage({ error: 'Brand name is required.' }, returnPath);
  }

  try {
    await createBrand({
      name,
      status,
      logoUrl: logoUrl || null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create brand.';
    toPage({ error: message }, returnPath);
  }

  revalidateSettings();
  toPage({ message: `Brand "${name}" created.` }, returnPath);
}

export async function updateBrandAction(formData: FormData) {
  const returnPath = normalizeReturnPath(formData.get('returnPath'));
  await requireAnyAdmin(returnPath);

  const brandCode = normalizeText(formData.get('brandCode'));
  const name = normalizeText(formData.get('name'));
  const rawStatus = normalizeText(formData.get('status'));
  const status: 'active' | 'inactive' | undefined =
    rawStatus === 'active' || rawStatus === 'inactive' ? rawStatus : undefined;
  const logoUrl = normalizeText(formData.get('logoUrl'));

  if (!brandCode || !name) {
    toPage({ error: 'Brand update payload is incomplete.' }, returnPath);
  }

  try {
    await updateBrand(brandCode, {
      name,
      status,
      logoUrl: logoUrl || null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update brand.';
    toPage({ error: message }, returnPath);
  }

  revalidateSettings();
  toPage({ message: `Brand "${name}" updated.` }, returnPath);
}

export async function deleteBrandAction(formData: FormData) {
  const returnPath = normalizeReturnPath(formData.get('returnPath'));
  await requireAnyAdmin(returnPath);

  const brandCode = normalizeText(formData.get('brandCode'));
  const brandName = normalizeText(formData.get('brandName'));

  if (!brandCode) {
    toPage({ error: 'Brand delete payload is incomplete.' }, returnPath);
  }

  try {
    await deleteBrand(brandCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete brand.';
    toPage({ error: message }, returnPath);
  }

  revalidateSettings();
  toPage({ message: `Brand "${brandName || brandCode}" deleted.` }, returnPath);
}

export async function createImportMappingDraftFromCsvAction(formData: FormData) {
  const returnPath = normalizeReturnPath(formData.get('returnPath'));
  const auth = await requireAnyAdmin(returnPath);
  const file = formData.get('file');
  const sourceFilename = normalizeText(formData.get('sourceFilename'));

  if (!(file instanceof File) || file.size === 0) {
    toPage({ error: 'Select a CSV file first.' }, returnPath);
  }

  const filename = sourceFilename || file.name;
  if (!filename.toLowerCase().endsWith('.csv')) {
    toPage({ error: 'Only CSV is supported for mapping baseline upload.' }, returnPath);
  }

  const csvText = await file.text();
  const headers = parseCsvHeadersFromText(csvText);

  if (headers.length === 0) {
    toPage({ error: 'CSV header row is empty.' }, returnPath);
  }

  try {
    await createImportColumnMappingDraftFromHeaders({
      headers,
      sourceFilename: filename,
      actorEmail: auth.user.email
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create mapping draft.';
    toPage({ error: message }, returnPath);
  }

  revalidateSettings();
  toPage({ message: `Draft created from "${filename}".` }, returnPath);
}

export async function saveImportMappingDraftAction(formData: FormData) {
  const returnPath = normalizeReturnPath(formData.get('returnPath'));
  const auth = await requireAnyAdmin(returnPath);
  const sourceFilename = normalizeText(formData.get('sourceFilename')) || null;
  const uploadedHeaders = formData
    .getAll('uploadedHeader')
    .map((value) => normalizeText(value))
    .filter((header) => !!header);
  const rules = parseImportMappingRulesFromFormData(formData);

  if (rules.some((rule) => !rule.baselineHeader)) {
    toPage({ error: 'Every target must have baseline header before saving draft.' }, returnPath);
  }

  try {
    await updateImportColumnMappingDraft({
      sourceFilename,
      uploadedHeaders,
      actorEmail: auth.user.email,
      rules
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save mapping draft.';
    toPage({ error: message }, returnPath);
  }

  revalidateSettings();
  toPage({ message: 'Import mapping draft saved.' }, returnPath);
}

export async function createImportMappingDraftFromPublishedAction(formData: FormData) {
  const returnPath = normalizeReturnPath(formData.get('returnPath'));
  const auth = await requireAnyAdmin(returnPath);
  const config = await getImportColumnMappingConfig().catch((error) => {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to load current published mapping.';
    toPage({ error: message }, returnPath);
  });
  const baseRules = config.published?.rules ?? null;

  if (!baseRules || baseRules.length === 0) {
    toPage({ error: 'No published mapping exists yet. Create draft from CSV first.' }, returnPath);
  }

  try {
    const uploadedHeaders = Array.from(
      new Set(
        baseRules
          .map((rule) => normalizeText(rule.baselineHeader))
          .filter((value) => !!value)
      )
    );

    await updateImportColumnMappingDraft({
      sourceFilename: config.published?.sourceFilename ?? 'published-mapping',
      uploadedHeaders,
      actorEmail: auth.user.email,
      rules: baseRules
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create mapping draft from current published config.';
    toPage({ error: message }, returnPath);
  }

  revalidateSettings();
  toPage({ message: 'Draft created from current published mapping.' }, returnPath);
}

export async function publishImportMappingAction(formData: FormData) {
  const returnPath = normalizeReturnPath(formData.get('returnPath'));
  const auth = await requireAnyAdmin(returnPath);
  const note = normalizeText(formData.get('note')) || null;

  try {
    await publishImportColumnMapping({
      actorEmail: auth.user.email,
      note
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to publish mapping.';
    toPage({ error: message }, returnPath);
  }

  revalidateSettings();
  toPage({ message: 'Import mapping published.' }, returnPath);
}

export async function discardImportMappingDraftAction(formData: FormData) {
  const returnPath = normalizeReturnPath(formData.get('returnPath'));
  await requireAnyAdmin(returnPath);

  try {
    await discardImportColumnMappingDraft();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to discard mapping draft.';
    toPage({ error: message }, returnPath);
  }

  revalidateSettings();
  toPage({ message: 'Import mapping draft discarded.' }, returnPath);
}

export async function rollbackImportMappingAction(formData: FormData) {
  const returnPath = normalizeReturnPath(formData.get('returnPath'));
  const auth = await requireAnyAdmin(returnPath);
  const versionId = normalizeText(formData.get('versionId'));

  if (!versionId) {
    toPage({ error: 'Version id is required for rollback.' }, returnPath);
  }

  try {
    await rollbackImportColumnMapping({
      versionId,
      actorEmail: auth.user.email
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to rollback mapping.';
    toPage({ error: message }, returnPath);
  }

  revalidateSettings();
  toPage({ message: `Rollback completed from version ${versionId}.` }, returnPath);
}

export async function updateTopContentDataSourcePolicyAction(formData: FormData) {
  const returnPath = normalizeReturnPath(formData.get('returnPath'));
  const auth = await requireAnyAdmin(returnPath);
  const mode = normalizeText(formData.get('mode')) as 'csv_only' | 'csv_and_manual';
  const note = normalizeText(formData.get('note')) || null;
  const excludedContentStyleValueKeys = Array.from(
    new Set(
      formData
        .getAll('excludedContentStyleValueKeys')
        .map(value => normalizeText(value))
        .filter(value => !!value)
    )
  );

  if (mode !== 'csv_only' && mode !== 'csv_and_manual') {
    toPage({ error: 'Top Content policy mode is invalid.' }, returnPath);
  }

  try {
    await updateTopContentDataSourcePolicy({
      mode,
      note,
      actorEmail: auth.user.email,
      excludedContentStyleValueKeys
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update Top Content policy.';
    toPage({ error: message }, returnPath);
  }

  revalidateSettings();
  toPage(
    {
      message:
        mode === 'csv_only'
          ? 'Top Content policy saved: CSV only (manual rows excluded).'
          : 'Top Content policy saved: CSV + manual rows.'
    },
    returnPath
  );
}

export async function updateContentCountPolicyAction(formData: FormData) {
  const returnPath = normalizeReturnPath(formData.get('returnPath'));
  const auth = await requireAnyAdmin(returnPath);
  const mode = normalizeText(formData.get('mode')) as 'csv_only' | 'csv_and_manual';
  const note = normalizeText(formData.get('note')) || null;

  if (mode !== 'csv_only' && mode !== 'csv_and_manual') {
    toPage({ error: 'Content count policy mode is invalid.' }, returnPath);
  }

  try {
    await updateContentCountPolicy({
      mode,
      note,
      actorEmail: auth.user.email
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update Content count policy.';
    toPage({ error: message }, returnPath);
  }

  revalidateSettings();
  toPage(
    {
      message:
        mode === 'csv_only'
          ? 'Content count policy saved: CSV only (manual rows excluded).'
          : 'Content count policy saved: CSV + manual rows.'
    },
    returnPath
  );
}
