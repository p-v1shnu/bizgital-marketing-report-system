'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { ConfirmActionModal } from '@/components/ui/confirm-action-modal';
import { ImageUploadField } from '@/components/ui/image-upload-field';
import { Input } from '@/components/ui/input';
import { ModalShell } from '@/components/ui/modal-shell';
import { Select } from '@/components/ui/select';
import { toProtectedMediaUrl } from '@/lib/media-url';
import type { BrandSummary, UserSummary } from '@/lib/reporting-api';

type Props = {
  brands: BrandSummary[];
  users: UserSummary[];
  actorName?: string;
  actorEmail?: string;
};

type BrandDraft = {
  name: string;
  status: 'active' | 'inactive';
  logoUrl: string;
  responsibleUserIds: string[];
};

type BrandStatusTab = 'active' | 'inactive';

function createEmptyDraft(): BrandDraft {
  return {
    name: '',
    status: 'active',
    logoUrl: '',
    responsibleUserIds: []
  };
}

function uniqueIds(values: string[]) {
  return Array.from(
    new Set(
      values
        .map(value => value.trim())
        .filter(value => !!value)
    )
  );
}

function countNonAdminMembers(brand: BrandSummary) {
  return new Set(
    brand.memberships
      .filter(membership => membership.role !== 'admin')
      .map(membership => membership.user.id)
  ).size;
}

function parseErrorMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === 'object' &&
    'message' in payload &&
    Array.isArray((payload as { message?: unknown }).message)
  ) {
    return ((payload as { message: string[] }).message).join(', ');
  }

  if (
    payload &&
    typeof payload === 'object' &&
    'message' in payload &&
    typeof (payload as { message?: unknown }).message === 'string'
  ) {
    return (payload as { message: string }).message;
  }

  return fallback;
}

function formatLifecycleTimestamp(value: string | null | undefined) {
  if (!value) {
    return 'Never';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }

  return parsed.toLocaleString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function BrandsManager({ brands, users, actorName, actorEmail }: Props) {
  const router = useRouter();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3003/api';
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingBrandCode, setEditingBrandCode] = useState<string | null>(null);
  const [draft, setDraft] = useState<BrandDraft>(createEmptyDraft);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [deleteTargetBrand, setDeleteTargetBrand] = useState<BrandSummary | null>(null);
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const [userSearchText, setUserSearchText] = useState('');
  const [brandSearchText, setBrandSearchText] = useState('');
  const [statusTab, setStatusTab] = useState<BrandStatusTab>('active');

  const brandsByCode = useMemo(
    () => new Map(brands.map(brand => [brand.code, brand])),
    [brands]
  );
  const editingBrand = editingBrandCode ? brandsByCode.get(editingBrandCode) ?? null : null;
  const brandsByStatus = useMemo(
    () => ({
      active: brands.filter(brand => brand.status === 'active'),
      inactive: brands.filter(brand => brand.status === 'inactive')
    }),
    [brands]
  );
  const tabBrands = brandsByStatus[statusTab];
  const filteredBrands = useMemo(() => {
    const keyword = brandSearchText.trim().toLowerCase();
    if (!keyword) {
      return tabBrands;
    }

    return tabBrands.filter(
      brand =>
        brand.name.toLowerCase().includes(keyword) ||
        brand.code.toLowerCase().includes(keyword)
    );
  }, [brandSearchText, tabBrands]);
  const assignableUsers = useMemo(
    () =>
      users.filter(
        user =>
          user.status !== 'inactive' &&
          !user.memberships.some(membership => membership.role === 'admin')
      ),
    [users]
  );
  const assignableUserById = useMemo(
    () => new Map(assignableUsers.map(user => [user.id, user])),
    [assignableUsers]
  );
  const filteredAssignableUsers = useMemo(() => {
    const keyword = userSearchText.trim().toLowerCase();
    if (!keyword) {
      return assignableUsers;
    }

    return assignableUsers.filter(
      user =>
        user.displayName.toLowerCase().includes(keyword) ||
        user.email.toLowerCase().includes(keyword)
    );
  }, [assignableUsers, userSearchText]);
  const selectedResponsibleUserSet = useMemo(
    () => new Set(draft.responsibleUserIds),
    [draft.responsibleUserIds]
  );
  const filteredAssignableUserIds = useMemo(
    () => filteredAssignableUsers.map(user => user.id),
    [filteredAssignableUsers]
  );
  const allFilteredUsersSelected =
    filteredAssignableUserIds.length > 0 &&
    filteredAssignableUserIds.every(userId => selectedResponsibleUserSet.has(userId));
  const selectedResponsibleCount = selectedResponsibleUserSet.size;
  const selectedResponsibleSummary = useMemo(() => {
    if (selectedResponsibleCount === 0) {
      return 'Select users';
    }

    if (selectedResponsibleCount === 1) {
      const userId = draft.responsibleUserIds[0] ?? '';
      return assignableUserById.get(userId)?.displayName ?? '1 user selected';
    }

    return `${selectedResponsibleCount} users selected`;
  }, [assignableUserById, draft.responsibleUserIds, selectedResponsibleCount]);

  function openCreateModal() {
    setModalMode('create');
    setEditingBrandCode(null);
    setDraft(createEmptyDraft());
    setUserSearchText('');
    setBrandSearchText('');
    setUserPickerOpen(false);
    setStatusError(null);
  }

  function openEditModal(brand: BrandSummary) {
    const initialResponsibleUserIds = uniqueIds(
      brand.memberships
        .filter(
          membership =>
            membership.role !== 'admin' &&
            membership.user.status !== 'inactive'
        )
        .map(membership => membership.user.id)
    );

    setModalMode('edit');
    setEditingBrandCode(brand.code);
    setDraft({
      name: brand.name,
      status: (brand.status as 'active' | 'inactive') ?? 'active',
      logoUrl: brand.logoUrl ?? '',
      responsibleUserIds: initialResponsibleUserIds
    });
    setUserSearchText('');
    setBrandSearchText('');
    setUserPickerOpen(false);
    setStatusError(null);
  }

  function closeModal() {
    setModalMode(null);
    setEditingBrandCode(null);
    setDraft(createEmptyDraft());
    setUserSearchText('');
    setBrandSearchText('');
    setUserPickerOpen(false);
    setPendingKey(null);
  }

  async function saveBrand() {
    if (!modalMode) {
      return;
    }

    setPendingKey('save');
    setStatusError(null);
    setStatusMessage(null);
    const resolvedResponsibleUserIds = uniqueIds(
      draft.responsibleUserIds.filter(userId => assignableUserById.has(userId))
    );

    try {
      if (modalMode === 'create') {
        const response = await fetch(`${apiBase}/brands`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: draft.name,
            status: draft.status,
            logoUrl: draft.logoUrl || null,
            responsibleUserIds: resolvedResponsibleUserIds,
            actorName,
            actorEmail
          })
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          setStatusError(parseErrorMessage(payload, 'Failed to create brand.'));
          return;
        }

        setStatusMessage(`Brand "${draft.name}" created.`);
      } else if (editingBrandCode) {
        const response = await fetch(`${apiBase}/brands/${editingBrandCode}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: draft.name,
            logoUrl: draft.logoUrl || null,
            responsibleUserIds: resolvedResponsibleUserIds,
            actorName,
            actorEmail
          })
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          setStatusError(parseErrorMessage(payload, 'Failed to update brand.'));
          return;
        }

        setStatusMessage(`Brand "${draft.name}" updated.`);
      }

      closeModal();
      router.refresh();
    } catch {
      setStatusError(modalMode === 'create' ? 'Failed to create brand.' : 'Failed to update brand.');
    } finally {
      setPendingKey(null);
    }
  }

  async function toggleBrandStatus(brand: BrandSummary) {
    const nextStatus = brand.status === 'active' ? 'inactive' : 'active';
    setPendingKey(`toggle:${brand.code}`);
    setStatusError(null);
    setStatusMessage(null);

    try {
      const response = await fetch(`${apiBase}/brands/${brand.code}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: nextStatus,
          actorName,
          actorEmail
        })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setStatusError(parseErrorMessage(payload, 'Failed to update brand status.'));
        return;
      }

      setStatusMessage(
        nextStatus === 'active'
          ? `Brand "${brand.name}" activated.`
          : `Brand "${brand.name}" deactivated.`
      );
      router.refresh();
    } catch {
      setStatusError('Failed to update brand status.');
    } finally {
      setPendingKey(null);
    }
  }

  async function deleteBrand(brand: BrandSummary) {
    setPendingKey(`delete:${brand.code}`);
    setStatusError(null);
    setStatusMessage(null);

    try {
      const response = await fetch(`${apiBase}/brands/${brand.code}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          actorName,
          actorEmail
        })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setStatusError(parseErrorMessage(payload, 'Failed to delete brand.'));
        return;
      }

      setDeleteTargetBrand(null);
      setStatusMessage(`Brand "${brand.name}" deleted.`);
      router.refresh();
    } catch {
      setStatusError('Failed to delete brand.');
    } finally {
      setPendingKey(null);
    }
  }

  function requestDeleteBrand(brand: BrandSummary) {
    setDeleteTargetBrand(brand);
    setStatusError(null);
    setStatusMessage(null);
  }

  return (
    <div className="space-y-3">
      {statusError ? (
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/8 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {statusError}
        </div>
      ) : null}
      {statusMessage ? (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          {statusMessage}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-[22px] border border-border/60 bg-background/60">
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
          <div>
            <div className="text-lg font-semibold text-foreground">Brands</div>
            <div className="text-sm text-muted-foreground">
              Manage brands from the Actions column.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={openCreateModal} size="sm" type="button">
              + Add Brand
            </Button>
          </div>
        </div>
        <div className="border-b border-border/60 px-4 py-3">
          <div className="inline-flex rounded-xl border border-border/60 bg-background/60 p-1">
            <button
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                statusTab === 'active'
                  ? 'bg-primary/15 text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setStatusTab('active')}
              type="button"
            >
              Active ({brandsByStatus.active.length})
            </button>
            <button
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                statusTab === 'inactive'
                  ? 'bg-primary/15 text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setStatusTab('inactive')}
              type="button"
            >
              Inactive ({brandsByStatus.inactive.length})
            </button>
          </div>
        </div>
        <div className="border-b border-border/60 px-4 py-3">
          <Input
            id="brand-settings-search-input"
            onChange={event => setBrandSearchText(event.currentTarget.value)}
            placeholder="Search brand name"
            value={brandSearchText}
          />
        </div>
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border/60 bg-background/70 text-xs uppercase tracking-[0.15em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Members</th>
              <th className="px-4 py-3 font-medium">Lifecycle</th>
              <th className="px-4 py-3 font-medium">Active</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredBrands.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-muted-foreground" colSpan={5}>
                  {brands.length === 0
                    ? 'No brands found.'
                    : brandSearchText.trim().length > 0
                      ? 'No brands match your search.'
                      : statusTab === 'active'
                        ? 'No active brands.'
                        : 'No inactive brands.'}
                </td>
              </tr>
            ) : (
              filteredBrands.map(brand => {
                const protectedBrandLogoUrl = toProtectedMediaUrl(brand.logoUrl);

                return (
                  <tr className="border-b border-border/50 last:border-b-0" key={brand.id}>
                    <td className="px-4 py-3 font-medium text-foreground">
                      <div className="flex items-center gap-3">
                        {protectedBrandLogoUrl ? (
                          <div className="size-9 overflow-hidden rounded-lg border border-border/60 bg-background/70">
                            <img
                              alt={`${brand.name} logo`}
                              className="h-full w-full object-cover"
                              src={protectedBrandLogoUrl}
                            />
                          </div>
                        ) : (
                          <div className="flex size-9 items-center justify-center rounded-lg border border-border/60 bg-background/70 text-xs font-semibold uppercase text-muted-foreground">
                            {brand.name.slice(0, 2)}
                          </div>
                        )}
                        <span>{brand.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {countNonAdminMembers(brand)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <div className="space-y-1">
                        <div>Created: {formatLifecycleTimestamp(brand.createdAt)}</div>
                        <div>Active: {formatLifecycleTimestamp(brand.activatedAt)}</div>
                        <div>Inactive: {formatLifecycleTimestamp(brand.deactivatedAt)}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        className={`h-7 w-14 rounded-full border transition ${
                          brand.status === 'active'
                            ? 'border-emerald-600/20 bg-emerald-500/40'
                            : 'border-border bg-muted'
                        }`}
                        disabled={pendingKey === `toggle:${brand.code}`}
                        onClick={() => toggleBrandStatus(brand)}
                        type="button"
                      >
                        <span
                          className={`mx-1 block h-5 w-5 rounded-full bg-background transition-transform ${
                            brand.status === 'active' ? 'translate-x-6' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/app/brands/${brand.code}`}>Manage Brand</Link>
                        </Button>
                        <Button
                          onClick={() => openEditModal(brand)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Edit
                        </Button>
                        <Button
                          disabled={pendingKey === `delete:${brand.code}`}
                          onClick={() => requestDeleteBrand(brand)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {modalMode ? (
        <ModalShell
          onClose={closeModal}
          title={modalMode === 'create' ? 'Create Brand' : 'Edit Brand'}
          widthClassName="max-w-2xl"
        >
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="brand-name-input">
                  Brand name
                </label>
                <Input
                  id="brand-name-input"
                  onChange={event => {
                    const value = event.currentTarget.value;
                    setDraft(current => ({ ...current, name: value }));
                  }}
                  placeholder="Brand name"
                  value={draft.name}
                />
              </div>
              {modalMode === 'create' ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="brand-status-input">
                    Status
                  </label>
                  <Select
                    id="brand-status-input"
                    onChange={event => {
                      const value = event.currentTarget.value as BrandDraft['status'];
                      setDraft(current => ({ ...current, status: value }));
                    }}
                    value={draft.status}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </Select>
                </div>
              ) : null}
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Responsible users</label>
                {assignableUsers.length === 0 ? (
                  <div className="rounded-2xl border border-border/60 bg-background/60 px-3 py-3 text-sm text-muted-foreground">
                    No active non-admin user available for assignment.
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button
                      className="flex w-full items-center justify-between rounded-2xl border border-border/60 bg-background/60 px-3 py-2 text-left text-sm"
                      onClick={() => setUserPickerOpen(current => !current)}
                      type="button"
                    >
                      <span className="truncate pr-3 text-foreground">{selectedResponsibleSummary}</span>
                      <span className="text-xs text-muted-foreground">
                        {userPickerOpen ? 'Close' : 'Open'}
                      </span>
                    </button>
                    {userPickerOpen ? (
                      <div className="space-y-2 rounded-2xl border border-border/60 bg-background/60 p-3">
                        <Input
                          id="brand-responsible-user-search-input"
                          onChange={event => setUserSearchText(event.currentTarget.value)}
                          placeholder="Search user name or email"
                          value={userSearchText}
                        />
                        <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                          <label className="inline-flex items-center gap-2">
                            <input
                              checked={allFilteredUsersSelected}
                              disabled={filteredAssignableUserIds.length === 0}
                              onChange={event => {
                                const checked = event.currentTarget.checked;
                                setDraft(current => {
                                  const nextIds = new Set(current.responsibleUserIds);
                                  for (const userId of filteredAssignableUserIds) {
                                    if (checked) {
                                      nextIds.add(userId);
                                    } else {
                                      nextIds.delete(userId);
                                    }
                                  }
                                  return {
                                    ...current,
                                    responsibleUserIds: Array.from(nextIds)
                                  };
                                });
                              }}
                              type="checkbox"
                            />
                            Select all
                          </label>
                          <span>{selectedResponsibleCount} selected</span>
                        </div>
                        <div className="max-h-64 overflow-y-auto rounded-xl border border-border/60 bg-background/70">
                          {filteredAssignableUsers.length > 0 ? (
                            filteredAssignableUsers.map(user => (
                              <label
                                className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-2 text-sm last:border-b-0"
                                key={user.id}
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-foreground">{user.displayName}</span>
                                  <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
                                </span>
                                <input
                                  checked={selectedResponsibleUserSet.has(user.id)}
                                  onChange={event => {
                                    const checked = event.currentTarget.checked;
                                    setDraft(current => {
                                      const nextIds = new Set(current.responsibleUserIds);
                                      if (checked) {
                                        nextIds.add(user.id);
                                      } else {
                                        nextIds.delete(user.id);
                                      }
                                      return {
                                        ...current,
                                        responsibleUserIds: Array.from(nextIds)
                                      };
                                    });
                                  }}
                                  type="checkbox"
                                />
                              </label>
                            ))
                          ) : (
                            <div className="px-3 py-3 text-sm text-muted-foreground">
                              No users match this search.
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                    {selectedResponsibleCount > 0 ? (
                      <div className="text-xs text-muted-foreground">
                        {selectedResponsibleCount} selected
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium">
                  Brand logo
                </label>
                <ImageUploadField
                  className="max-w-xs"
                  onChange={value => {
                    setDraft(current => ({ ...current, logoUrl: value }));
                  }}
                  placeholderLabel="Brand logo placeholder"
                  previewAlt="Brand logo preview"
                  scope="brands"
                  variant="logo"
                  value={draft.logoUrl}
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button disabled={pendingKey === 'save'} onClick={saveBrand} type="button">
                {modalMode === 'create' ? 'Create Brand' : 'Save Changes'}
              </Button>
            </div>

            {modalMode === 'edit' && editingBrand ? (
              <div className="mt-3 text-xs text-muted-foreground">
                Members: {countNonAdminMembers(editingBrand)}
              </div>
            ) : null}
        </ModalShell>
      ) : null}

      <ConfirmActionModal
        cancelLabel="Keep brand"
        confirmLabel="Delete brand"
        description={
          deleteTargetBrand
            ? `This will permanently delete "${deleteTargetBrand.name}". This action cannot be undone.`
            : ''
        }
        onCancel={() => setDeleteTargetBrand(null)}
        onConfirm={() => {
          if (deleteTargetBrand) {
            void deleteBrand(deleteTargetBrand);
          }
        }}
        open={!!deleteTargetBrand}
        pending={
          !!deleteTargetBrand && pendingKey === `delete:${deleteTargetBrand.code}`
        }
        title={
          deleteTargetBrand ? `Delete "${deleteTargetBrand.name}"?` : 'Delete brand?'
        }
      />
    </div>
  );
}
