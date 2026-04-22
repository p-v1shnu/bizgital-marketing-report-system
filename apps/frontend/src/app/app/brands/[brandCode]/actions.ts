'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireBrandAdminAccess } from '@/lib/auth';
import {
  createBrandCompanyFormatOption,
  getBrandCompanyFormatOptions,
  reorderBrandCompanyFormatOptions,
  updateBrandCompanyFormatOption
} from '@/lib/reporting-api';

const defaultReturnPath = '/app/brands';

function normalizeReturnPath(value: FormDataEntryValue | null) {
  const candidate = String(value ?? '').trim();

  if (!candidate || !candidate.startsWith('/app/brands/') || candidate.startsWith('//')) {
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

function revalidateBrandAdmin(brandCode: string) {
  revalidatePath(`/app/brands/${brandCode}`);
}

async function findActiveRelatedProductOrder(brandCode: string) {
  const options = await getBrandCompanyFormatOptions(brandCode, {
    includeDeprecated: true
  });
  const field = options.fields.find(item => item.key === 'related_product');

  if (!field) {
    return [];
  }

  return field.options
    .filter(option => option.status === 'active')
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

export async function createRelatedProductOptionAction(formData: FormData) {
  const brandCode = normalizeText(formData.get('brandCode'));
  const returnPath = normalizeReturnPath(formData.get('returnPath'));
  await requireBrandAdminAccess(brandCode, returnPath);

  const label = normalizeText(formData.get('label'));

  if (!label) {
    toPage({ error: 'Type related product name before adding.' }, returnPath);
  }

  try {
    await createBrandCompanyFormatOption(brandCode, {
      fieldKey: 'related_product',
      label
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add related product.';
    toPage({ error: message }, returnPath);
  }

  revalidateBrandAdmin(brandCode);
  toPage({ message: `Added "${label}".` }, returnPath);
}

export async function updateRelatedProductOptionStatusAction(formData: FormData) {
  const brandCode = normalizeText(formData.get('brandCode'));
  const returnPath = normalizeReturnPath(formData.get('returnPath'));
  await requireBrandAdminAccess(brandCode, returnPath);

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
    await updateBrandCompanyFormatOption(brandCode, optionId, {
      status: nextStatus
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update related product.';
    toPage({ error: message }, returnPath);
  }

  revalidateBrandAdmin(brandCode);
  toPage(
    {
      message:
        nextStatus === 'deprecated'
          ? `Disabled "${label || 'related product'}".`
          : `Restored "${label || 'related product'}".`
    },
    returnPath
  );
}

export async function moveRelatedProductOptionAction(formData: FormData) {
  const brandCode = normalizeText(formData.get('brandCode'));
  const returnPath = normalizeReturnPath(formData.get('returnPath'));
  await requireBrandAdminAccess(brandCode, returnPath);

  const optionId = normalizeText(formData.get('optionId'));
  const direction = normalizeText(formData.get('direction'));

  if (!optionId || (direction !== 'up' && direction !== 'down')) {
    toPage({ error: 'Invalid move request.' }, returnPath);
  }

  const active = await findActiveRelatedProductOrder(brandCode);
  const currentIndex = active.findIndex(option => option.id === optionId);
  const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

  if (currentIndex < 0 || swapIndex < 0 || swapIndex >= active.length) {
    toPage({ error: 'Option cannot move further.' }, returnPath);
  }

  const reordered = [...active];
  const [picked] = reordered.splice(currentIndex, 1);
  reordered.splice(swapIndex, 0, picked);

  try {
    await reorderBrandCompanyFormatOptions(brandCode, {
      fieldKey: 'related_product',
      optionIds: reordered.map(option => option.id)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to reorder related products.';
    toPage({ error: message }, returnPath);
  }

  revalidateBrandAdmin(brandCode);
  toPage({ message: 'Updated related product order.' }, returnPath);
}
