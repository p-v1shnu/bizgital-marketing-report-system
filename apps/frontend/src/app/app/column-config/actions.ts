'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireAnyAdmin } from '@/lib/auth';
import {
  createComputedFormula,
  createGlobalCompanyFormatOption,
  getGlobalCompanyFormatOptions,
  reorderGlobalCompanyFormatOptions,
  updateComputedFormula,
  updateEngagementFormula,
  updateGlobalCompanyFormatOption,
  type CompanyFormatFieldKey
} from '@/lib/reporting-api';

const fieldKeys = new Set<CompanyFormatFieldKey>([
  'content_style',
  'media_format',
  'content_objective'
]);

const defaultReturnPath = '/app/settings';

function normalizeReturnPath(value: FormDataEntryValue | null) {
  const candidate = String(value ?? '').trim();

  if (!candidate || !candidate.startsWith('/app') || candidate.startsWith('//')) {
    return defaultReturnPath;
  }

  return candidate;
}

function toPage(params: Record<string, string>, returnPath = defaultReturnPath) {
  const targetUrl = new URL(returnPath, 'http://localhost');
  const search = new URLSearchParams(targetUrl.search);

  for (const [key, value] of Object.entries(params)) {
    search.set(key, value);
  }

  const nextPath = `${targetUrl.pathname}${search.toString() ? `?${search.toString()}` : ''}${targetUrl.hash}`;
  redirect(nextPath);
}

function normalizeText(value: FormDataEntryValue | null) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function parseFieldKey(value: FormDataEntryValue | null) {
  const key = String(value ?? '') as CompanyFormatFieldKey;

  if (!fieldKeys.has(key)) {
    throw new Error('Invalid field key.');
  }

  return key;
}

async function findActiveOrder(fieldKey: CompanyFormatFieldKey) {
  const options = await getGlobalCompanyFormatOptions({ includeDeprecated: true });
  const field = options.fields.find((item) => item.key === fieldKey);

  if (!field) {
    return [];
  }

  return field.options
    .filter((option) => option.status === 'active')
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

function revalidateColumnConfig(returnPath: string) {
  revalidatePath('/app/column-config');
  revalidatePath(returnPath.split('?')[0].split('#')[0]);
}

export async function createGlobalCompanyFormatOptionAction(formData: FormData) {
  const returnPath = normalizeReturnPath(formData.get('returnPath'));
  await requireAnyAdmin(returnPath);

  const fieldKey = parseFieldKey(formData.get('fieldKey'));
  const label = normalizeText(formData.get('label'));

  if (!label) {
    toPage({ error: 'Type option name before adding.' }, returnPath);
  }

  try {
    await createGlobalCompanyFormatOption({ fieldKey, label });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add option.';
    toPage({ error: message }, returnPath);
  }

  revalidateColumnConfig(returnPath);
  toPage({ message: `Added "${label}".` }, returnPath);
}

export async function updateGlobalCompanyFormatOptionStatusAction(formData: FormData) {
  const returnPath = normalizeReturnPath(formData.get('returnPath'));
  await requireAnyAdmin(returnPath);

  const optionId = normalizeText(formData.get('optionId'));
  const status = normalizeText(formData.get('status'));
  const label = normalizeText(formData.get('label'));

  if (!optionId || !status) {
    toPage({ error: 'Option update payload is incomplete.' }, returnPath);
  }

  if (status !== 'active' && status !== 'deprecated') {
    toPage({ error: 'Invalid option status.' }, returnPath);
  }
  const nextStatus = status as 'active' | 'deprecated';

  try {
    await updateGlobalCompanyFormatOption(optionId, {
      status: nextStatus
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update option.';
    toPage({ error: message }, returnPath);
  }

  revalidateColumnConfig(returnPath);
  toPage({
    message:
      nextStatus === 'deprecated'
        ? `Deprecated "${label || 'option'}".`
        : `Restored "${label || 'option'}".`
  }, returnPath);
}

export async function moveGlobalCompanyFormatOptionAction(formData: FormData) {
  const returnPath = normalizeReturnPath(formData.get('returnPath'));
  await requireAnyAdmin(returnPath);

  const fieldKey = parseFieldKey(formData.get('fieldKey'));
  const optionId = normalizeText(formData.get('optionId'));
  const direction = normalizeText(formData.get('direction'));

  if (!optionId || (direction !== 'up' && direction !== 'down')) {
    toPage({ error: 'Invalid move request.' }, returnPath);
  }

  const active = await findActiveOrder(fieldKey);
  const currentIndex = active.findIndex((option) => option.id === optionId);
  const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

  if (
    currentIndex < 0 ||
    swapIndex < 0 ||
    swapIndex >= active.length
  ) {
    toPage({ error: 'Option cannot move further.' }, returnPath);
  }

  const reordered = [...active];
  const [picked] = reordered.splice(currentIndex, 1);
  reordered.splice(swapIndex, 0, picked);

  try {
    await reorderGlobalCompanyFormatOptions({
      fieldKey,
      optionIds: reordered.map((option) => option.id)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to reorder options.';
    toPage({ error: message }, returnPath);
  }

  revalidateColumnConfig(returnPath);
  toPage({ message: 'Updated option order.' }, returnPath);
}

export async function updateEngagementFormulaAction(formData: FormData) {
  const returnPath = normalizeReturnPath(formData.get('returnPath'));
  await requireAnyAdmin(returnPath);

  const label = normalizeText(formData.get('label'));
  const sourceLabelA = normalizeText(formData.get('sourceLabelA'));
  const sourceLabelB = normalizeText(formData.get('sourceLabelB'));

  if (!label || !sourceLabelA || !sourceLabelB) {
    toPage(
      { error: 'Fill computed column label and both source columns before saving.' },
      returnPath
    );
  }

  try {
    await updateEngagementFormula({
      label,
      sourceLabelA,
      sourceLabelB
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to update engagement formula.';
    toPage({ error: message }, returnPath);
  }

  revalidateColumnConfig(returnPath);
  toPage({ message: 'Engagement formula updated.' }, returnPath);
}

export async function createComputedFormulaAction(formData: FormData) {
  const returnPath = normalizeReturnPath(formData.get('returnPath'));
  await requireAnyAdmin(returnPath);

  const columnLabel = normalizeText(formData.get('columnLabel'));
  const expression = normalizeText(formData.get('expression'));
  const isActive = normalizeText(formData.get('isActive')) === 'true';

  if (!columnLabel || !expression) {
    toPage({ error: 'Fill column label and expression before saving.' }, returnPath);
  }

  try {
    await createComputedFormula({
      columnLabel,
      expression,
      isActive
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create formula.';
    toPage({ error: message }, returnPath);
  }

  revalidateColumnConfig(returnPath);
  toPage({ message: `Formula "${columnLabel}" created.` }, returnPath);
}

export async function updateComputedFormulaAction(formData: FormData) {
  const returnPath = normalizeReturnPath(formData.get('returnPath'));
  await requireAnyAdmin(returnPath);

  const formulaId = normalizeText(formData.get('formulaId'));
  const columnLabel = normalizeText(formData.get('columnLabel'));
  const expression = normalizeText(formData.get('expression'));
  const isActive = normalizeText(formData.get('isActive')) === 'true';

  if (!formulaId || !columnLabel || !expression) {
    toPage({ error: 'Formula update payload is incomplete.' }, returnPath);
  }

  try {
    await updateComputedFormula(formulaId, {
      columnLabel,
      expression,
      isActive
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update formula.';
    toPage({ error: message }, returnPath);
  }

  revalidateColumnConfig(returnPath);
  toPage({ message: `Formula "${columnLabel}" updated.` }, returnPath);
}
