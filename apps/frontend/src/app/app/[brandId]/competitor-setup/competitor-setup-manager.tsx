'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmActionModal } from '@/components/ui/confirm-action-modal';
import { ImageUploadField } from '@/components/ui/image-upload-field';
import { Input } from '@/components/ui/input';
import { ModalShell } from '@/components/ui/modal-shell';
import { Select } from '@/components/ui/select';
import { toProtectedMediaUrl } from '@/lib/media-url';
import type {
  CompetitorCatalogResponse,
  CompetitorStatus,
  CompetitorYearSetupResponse
} from '@/lib/reporting-api';
import { REPORTING_YEAR_LOOKAHEAD } from '@/lib/year-options';

type Props = {
  brandId: string;
  initialYear: number;
  initialSetup: CompetitorYearSetupResponse;
  showYearPicker?: boolean;
  onSetupChanged?: (setup: CompetitorYearSetupResponse) => void;
};

type CatalogDraft = {
  name: string;
  logoImageUrl: string;
  facebookUrl: string;
  status: CompetitorStatus;
};

type CatalogTab = 'active' | 'inactive';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api';

function emptyCatalogDraft(): CatalogDraft {
  return {
    name: '',
    logoImageUrl: '',
    facebookUrl: '',
    status: 'active'
  };
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

function normalizeOptionalText(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function LogoAvatar({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const protectedLogoUrl = toProtectedMediaUrl(logoUrl);

  if (protectedLogoUrl && !imageLoadFailed) {
    return (
      <img
        alt={`${name} logo`}
        className="size-10 rounded-lg border border-border/60 object-cover"
        onError={() => {
          setImageLoadFailed(true);
        }}
        src={protectedLogoUrl}
      />
    );
  }

  return (
    <div className="flex size-10 items-center justify-center rounded-lg border border-border/60 bg-background/70 text-sm font-semibold text-muted-foreground">
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function CompetitorRow({
  item,
  isAssigned,
  pending,
  onAssign,
  onEdit,
  onDelete,
  hideAssign
}: {
  item: CompetitorCatalogResponse['items'][number];
  isAssigned: boolean;
  pending: boolean;
  onAssign?: (item: CompetitorCatalogResponse['items'][number]) => void;
  onEdit: (item: CompetitorCatalogResponse['items'][number]) => void;
  onDelete: (item: CompetitorCatalogResponse['items'][number]) => void;
  hideAssign?: boolean;
}) {
  const isUsedByAnyBrand =
    item.usage.assignedBrandCount > 0 || item.usage.assignedYearCount > 0;
  const isDeleteDisabled = pending || isUsedByAnyBrand;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-background/55 px-4 py-3">
      <LogoAvatar name={item.name} logoUrl={item.websiteUrl} />

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{item.name}</div>
        <a
          className="truncate text-xs text-primary hover:underline"
          href={item.facebookUrl ?? undefined}
          rel="noreferrer"
          target="_blank"
        >
          {item.facebookUrl ?? 'No Facebook URL'}
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isUsedByAnyBrand ? <Badge variant="outline">In use</Badge> : null}

        {!hideAssign ? (
          <Button
            data-testid={`add-assignment-${item.id}`}
            disabled={pending || isAssigned}
            onClick={() => onAssign?.(item)}
            size="sm"
            type="button"
            variant="outline"
          >
            {isAssigned ? 'Assigned' : 'Assign'}
          </Button>
        ) : null}

        <Button
          disabled={pending}
          onClick={() => onEdit(item)}
          size="sm"
          type="button"
          variant="outline"
        >
          <Pencil />
          Edit
        </Button>

        <Button
          disabled={isDeleteDisabled}
          onClick={() => onDelete(item)}
          size="sm"
          type="button"
          variant="outline"
        >
          <Trash2 />
          Delete
        </Button>
      </div>
    </div>
  );
}

export function CompetitorSetupManager({
  brandId,
  initialYear,
  initialSetup,
  showYearPicker = true,
  onSetupChanged
}: Props) {
  const router = useRouter();
  const currentYear = new Date().getUTCFullYear();

  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [maxVisitedYear, setMaxVisitedYear] = useState(
    Math.max(currentYear, initialYear)
  );
  const [setup, setSetup] = useState(initialSetup);
  const [query, setQuery] = useState('');
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [catalogTab, setCatalogTab] = useState<CatalogTab>('active');
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingCompetitorId, setEditingCompetitorId] = useState<string | null>(null);
  const [catalogDraft, setCatalogDraft] = useState<CatalogDraft>(emptyCatalogDraft);
  const [deleteTargetCatalogItem, setDeleteTargetCatalogItem] =
    useState<CompetitorCatalogResponse['items'][number] | null>(null);

  const assignmentIds = useMemo(
    () => setup.assignments.map((item) => item.competitor.id),
    [setup.assignments]
  );

  const catalogById = useMemo(() => {
    return new Map(setup.availableCompetitors.map((item) => [item.id, item]));
  }, [setup.availableCompetitors]);

  const filteredCatalog = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return setup.availableCompetitors
      .filter((item) => {
        if (!keyword) {
          return true;
        }

        return (
          item.name.toLowerCase().includes(keyword) ||
          (item.facebookUrl ?? '').toLowerCase().includes(keyword)
        );
      })
      .filter((item) => item.status === catalogTab);
  }, [setup.availableCompetitors, query, catalogTab]);

  const maxSelectableYear = Math.max(
    maxVisitedYear,
    currentYear + REPORTING_YEAR_LOOKAHEAD,
    selectedYear + 1
  );
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let year = maxSelectableYear; year >= 2000; year -= 1) {
      years.push(year);
    }
    return years;
  }, [maxSelectableYear]);

  function setStatus(options: { message?: string | null; error?: string | null }) {
    setStatusMessage(options.message ?? null);
    setStatusError(options.error ?? null);
  }

  async function fetchYearSetup(year: number) {
    const response = await fetch(`${apiBase}/brands/${brandId}/competitor-setup/${year}`, {
      cache: 'no-store'
    });
    const payload = (await response
      .json()
      .catch(() => null)) as CompetitorYearSetupResponse | { message?: string | string[] } | null;

    if (!response.ok) {
      throw new Error(
        parseErrorMessage(payload, `Failed to load competitor setup for year ${year}.`)
      );
    }

    return payload as CompetitorYearSetupResponse;
  }

  async function loadYear(year: number) {
    if (year < 2000 || year > 3000) {
      setStatus({ error: 'Year must be between 2000 and 3000.' });
      return;
    }

    setPendingKey('load-year');
    setStatus({ message: null, error: null });

    try {
      const data = await fetchYearSetup(year);
      setSelectedYear(year);
      setMaxVisitedYear((currentMax) => Math.max(currentMax, year));
      setSetup(data);
      onSetupChanged?.(data);
      router.replace(`/app/brands/${brandId}?tab=competitors&year=${year}`);
    } catch (error) {
      setStatus({
        error:
          error instanceof Error
            ? error.message
            : `Failed to load competitor setup for year ${year}.`
      });
    } finally {
      setPendingKey(null);
    }
  }

  async function saveAssignments(competitorIds: string[], successMessage: string) {
    setPendingKey('save-assignments');
    setStatus({ message: null, error: null });

    try {
      const response = await fetch(
        `${apiBase}/brands/${brandId}/competitor-setup/${selectedYear}/assignments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            competitorIds
          })
        }
      );
      const payload = (await response
        .json()
        .catch(() => null)) as CompetitorYearSetupResponse | { message?: string | string[] } | null;

      if (!response.ok) {
        setStatus({
          error: parseErrorMessage(payload, 'Failed to update assignments.')
        });
        return;
      }

      const savedSetup = payload as CompetitorYearSetupResponse;

      setSetup(savedSetup);
      onSetupChanged?.(savedSetup);
      setStatus({ message: successMessage });
    } catch {
      setStatus({ error: 'Failed to update assignments.' });
    } finally {
      setPendingKey(null);
    }
  }

  async function assignCompetitor(item: CompetitorCatalogResponse['items'][number]) {
    if (assignmentIds.includes(item.id)) {
      return;
    }

    await saveAssignments(
      [...assignmentIds, item.id],
      `Assigned "${item.name}" to ${selectedYear}.`
    );
  }

  async function unassignCompetitor(item: CompetitorCatalogResponse['items'][number]) {
    if (!assignmentIds.includes(item.id)) {
      return;
    }

    await saveAssignments(
      assignmentIds.filter((id) => id !== item.id),
      `Removed "${item.name}" from ${selectedYear}.`
    );
  }

  async function updateAssignmentStatus(
    competitorId: string,
    status: CompetitorStatus
  ) {
    setPendingKey('assignment-status');
    setStatus({ message: null, error: null });

    try {
      const response = await fetch(
        `${apiBase}/brands/${brandId}/competitor-setup/${selectedYear}/assignments/${competitorId}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ status })
        }
      );
      const payload = (await response
        .json()
        .catch(() => null)) as CompetitorYearSetupResponse | { message?: string | string[] } | null;

      if (!response.ok) {
        setStatus({
          error: parseErrorMessage(payload, 'Failed to update assignment status.')
        });
        return;
      }

      const refreshedSetup = payload as CompetitorYearSetupResponse;
      setSetup(refreshedSetup);
      onSetupChanged?.(refreshedSetup);
      setStatus({
        message:
          status === 'inactive'
            ? 'Assignment set to inactive. It will be optional in reporting.'
            : 'Assignment set to active and required in reporting.'
      });
    } catch {
      setStatus({ error: 'Failed to update assignment status.' });
    } finally {
      setPendingKey(null);
    }
  }

  function openCreateModal() {
    setModalMode('create');
    setEditingCompetitorId(null);
    setCatalogDraft(emptyCatalogDraft());
    setStatus({ error: null });
  }

  function openEditModal(competitor: CompetitorCatalogResponse['items'][number]) {
    setModalMode('edit');
    setEditingCompetitorId(competitor.id);
    setCatalogDraft({
      name: competitor.name,
      logoImageUrl: competitor.websiteUrl ?? '',
      facebookUrl: competitor.facebookUrl ?? '',
      status: competitor.status
    });
    setStatus({ error: null });
  }

  function closeModal() {
    setModalMode(null);
    setEditingCompetitorId(null);
  }

  async function saveCatalogItem() {
    const name = catalogDraft.name.trim();
    const facebookUrl = catalogDraft.facebookUrl.trim();

    if (!name) {
      setStatus({ error: 'Competitor name is required.' });
      return;
    }

    if (!facebookUrl) {
      setStatus({ error: 'Facebook URL is required.' });
      return;
    }

    setPendingKey('save-catalog');
    setStatus({ message: null, error: null });

    const payload = {
      name,
      primaryPlatform: 'Facebook',
      status: catalogDraft.status,
      websiteUrl: normalizeOptionalText(catalogDraft.logoImageUrl),
      facebookUrl: normalizeOptionalText(catalogDraft.facebookUrl),
      instagramUrl: null,
      tiktokUrl: null,
      youtubeUrl: null
    };

    try {
      const endpoint =
        modalMode === 'create' || !editingCompetitorId
          ? `${apiBase}/brands/${brandId}/competitor-setup/catalog`
          : `${apiBase}/brands/${brandId}/competitor-setup/catalog/${editingCompetitorId}`;
      const method = modalMode === 'create' || !editingCompetitorId ? 'POST' : 'PATCH';
      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const responsePayload = (await response
        .json()
        .catch(() => null)) as { message?: string | string[] } | null;

      if (!response.ok) {
        setStatus({
          error: parseErrorMessage(responsePayload, 'Failed to save competitor.')
        });
        return;
      }

      const refreshed = await fetchYearSetup(selectedYear);
      setSetup(refreshed);
      onSetupChanged?.(refreshed);
      closeModal();
      setStatus({
        message:
          method === 'POST'
            ? `Created "${name}".`
            : `Updated "${name}".`
      });
    } catch {
      setStatus({ error: 'Failed to save competitor.' });
    } finally {
      setPendingKey(null);
    }
  }

  async function deleteCatalogItem(item: CompetitorCatalogResponse['items'][number]) {
    const canDelete = item.usage.assignedBrandCount === 0 && item.usage.assignedYearCount === 0;

    if (!canDelete) {
      setDeleteTargetCatalogItem(null);
      setStatus({ error: 'Cannot delete competitor that is assigned to a brand.' });
      return;
    }

    setPendingKey('delete-catalog');
    setStatus({ message: null, error: null });

    try {
      const response = await fetch(
        `${apiBase}/brands/${brandId}/competitor-setup/catalog/${item.id}`,
        {
          method: 'DELETE'
        }
      );
      const payload = (await response
        .json()
        .catch(() => null)) as { message?: string | string[] } | null;

      if (!response.ok) {
        setStatus({
          error: parseErrorMessage(payload, 'Failed to delete competitor.')
        });
        return;
      }

      const refreshed = await fetchYearSetup(selectedYear);
      setSetup(refreshed);
      onSetupChanged?.(refreshed);
      setDeleteTargetCatalogItem(null);
      closeModal();
      setStatus({ message: `Deleted "${item.name}".` });
    } catch {
      setStatus({ error: 'Failed to delete competitor.' });
    } finally {
      setPendingKey(null);
    }
  }

  function requestDeleteCatalogItem(item: CompetitorCatalogResponse['items'][number]) {
    const canDelete = item.usage.assignedBrandCount === 0 && item.usage.assignedYearCount === 0;

    if (!canDelete) {
      setStatus({ error: 'Cannot delete competitor that is assigned to a brand.' });
      return;
    }

    setDeleteTargetCatalogItem(item);
    setStatus({ message: null, error: null });
  }

  return (
    <div className="space-y-5" data-testid="competitor-setup-manager">
      {statusError ? (
        <Card className="border-rose-500/25 bg-rose-500/8">
          <CardContent
            className="pt-6 text-sm text-rose-700 dark:text-rose-300"
            data-testid="setup-status-error"
          >
            {statusError}
          </CardContent>
        </Card>
      ) : null}

      {statusMessage ? (
        <Card className="border-emerald-500/25 bg-emerald-500/8">
          <CardContent
            className="pt-6 text-sm text-emerald-700 dark:text-emerald-300"
            data-testid="setup-status-message"
          >
            {statusMessage}
          </CardContent>
        </Card>
      ) : null}

      {showYearPicker ? (
        <Card>
          <CardHeader className="gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Year setup</CardTitle>
              <Badge variant="outline">
                {setup.summary.totalAssigned} assigned in {selectedYear}
              </Badge>
            </div>

            <div className="max-w-[220px] space-y-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="competitor-setup-year-select">
                  Report year
                </label>
                <Select
                  data-testid="setup-year-select"
                  disabled={pendingKey !== null}
                  id="competitor-setup-year-select"
                  onChange={(event) => void loadYear(Number(event.currentTarget.value))}
                  value={String(selectedYear)}
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </CardHeader>
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Assigned in {selectedYear}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {setup.assignments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/60 px-4 py-4 text-sm text-muted-foreground">
                No assigned competitor in this year.
              </div>
            ) : (
              setup.assignments.map((assignment) => {
                const catalogItem = catalogById.get(assignment.competitor.id);
                if (!catalogItem) {
                  return null;
                }

                return (
                  <div
                    className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-background/60 px-4 py-3"
                    key={assignment.id}
                    data-testid={`assigned-competitor-${assignment.competitor.id}`}
                  >
                    <LogoAvatar
                      logoUrl={assignment.competitor.websiteUrl}
                      name={assignment.competitor.name}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">
                        {assignment.competitor.name}
                      </div>
                      <a
                        className="truncate text-xs text-primary hover:underline"
                        href={assignment.competitor.facebookUrl ?? undefined}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {assignment.competitor.facebookUrl ?? 'No Facebook URL'}
                      </a>
                      {!assignment.canRemove && assignment.removeBlockedReason ? (
                        <div className="mt-1 text-xs text-amber-600 dark:text-amber-300">
                          {assignment.removeBlockedReason}
                        </div>
                      ) : null}
                    </div>

                    <Badge variant="outline">
                      {assignment.status === 'active' ? 'Active' : 'Inactive'}
                    </Badge>

                    <Button
                      disabled={pendingKey !== null}
                      onClick={() =>
                        void updateAssignmentStatus(
                          assignment.competitor.id,
                          assignment.status === 'active' ? 'inactive' : 'active'
                        )
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {assignment.status === 'active' ? 'Set inactive' : 'Set active'}
                    </Button>

                    <Button
                      disabled={pendingKey !== null || !assignment.canRemove}
                      onClick={() => void unassignCompetitor(catalogItem)}
                      size="sm"
                      type="button"
                      variant="outline"
                      title={assignment.removeBlockedReason ?? undefined}
                    >
                      <Trash2 />
                      Remove
                    </Button>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Catalog</CardTitle>
              <Button
                data-testid="add-competitor-button"
                onClick={openCreateModal}
                size="sm"
                type="button"
              >
                <Plus />
                Add competitor
              </Button>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="competitor-catalog-search-input">
                Search competitor catalog
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-10"
                  data-testid="catalog-search-input"
                  id="competitor-catalog-search-input"
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder="Search name or Facebook URL"
                  value={query}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                disabled={pendingKey !== null}
                onClick={() => setCatalogTab('active')}
                type="button"
                variant={catalogTab === 'active' ? 'default' : 'outline'}
              >
                Active
              </Button>
              <Button
                disabled={pendingKey !== null}
                onClick={() => setCatalogTab('inactive')}
                type="button"
                variant={catalogTab === 'inactive' ? 'default' : 'outline'}
              >
                Inactive
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {filteredCatalog.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/60 px-4 py-4 text-sm text-muted-foreground">
                No competitor in this tab.
              </div>
            ) : (
              filteredCatalog.map((item) => (
                <CompetitorRow
                  hideAssign={catalogTab === 'inactive'}
                  isAssigned={assignmentIds.includes(item.id)}
                  item={item}
                  key={item.id}
                  onAssign={(nextItem) => void assignCompetitor(nextItem)}
                  onDelete={(nextItem) => requestDeleteCatalogItem(nextItem)}
                  onEdit={openEditModal}
                  pending={pendingKey !== null}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {modalMode ? (
        <ModalShell
          description="Manage competitor profile for yearly assignment."
          onClose={closeModal}
          title={modalMode === 'create' ? 'Create competitor' : 'Edit competitor'}
          widthClassName="max-w-2xl"
        >
          <div className="grid gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="competitor-catalog-name-input">
                Competitor name
              </label>
              <Input
                data-testid="catalog-name-input"
                id="competitor-catalog-name-input"
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setCatalogDraft((current) => ({ ...current, name: value }));
                }}
                placeholder="Competitor name"
                value={catalogDraft.name}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Logo image (optional)</label>
              <ImageUploadField
                className="max-w-sm"
                data-testid="catalog-logo-upload"
                onChange={(value) => {
                  setCatalogDraft((current) => ({ ...current, logoImageUrl: value }));
                }}
                placeholderLabel="Competitor logo"
                previewAlt="Competitor logo preview"
                previewAspectRatio="1/1"
                previewFit="contain"
                scope="competitors"
                value={catalogDraft.logoImageUrl}
                variant="logo"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="competitor-catalog-facebook-url-input">
                Facebook page URL
              </label>
              <Input
                data-testid="catalog-facebook-url-input"
                id="competitor-catalog-facebook-url-input"
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setCatalogDraft((current) => ({ ...current, facebookUrl: value }));
                }}
                placeholder="Facebook page URL"
                value={catalogDraft.facebookUrl}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="competitor-catalog-status-input">
                Status
              </label>
              <Select
                id="competitor-catalog-status-input"
                onChange={(event) => {
                  const value = event.currentTarget.value as CompetitorStatus;
                  setCatalogDraft((current) => ({ ...current, status: value }));
                }}
                value={catalogDraft.status}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              data-testid="save-competitor-button"
              disabled={pendingKey !== null}
              onClick={() => void saveCatalogItem()}
              type="button"
            >
              {modalMode === 'create' ? 'Create competitor' : 'Save competitor'}
            </Button>

            {modalMode === 'edit' && editingCompetitorId ? (
              <Button
                disabled={pendingKey !== null}
                onClick={() => {
                  const item = setup.availableCompetitors.find(
                    (candidate) => candidate.id === editingCompetitorId
                  );

                  if (item) {
                    requestDeleteCatalogItem(item);
                    closeModal();
                  }
                }}
                type="button"
                variant="outline"
              >
                <Trash2 />
                Delete competitor
              </Button>
            ) : null}
          </div>
        </ModalShell>
      ) : null}

      <ConfirmActionModal
        cancelLabel="Keep competitor"
        confirmLabel="Delete competitor"
        description={
          deleteTargetCatalogItem
            ? `This will permanently delete "${deleteTargetCatalogItem.name}". This action cannot be undone.`
            : ''
        }
        onCancel={() => setDeleteTargetCatalogItem(null)}
        onConfirm={() => {
          if (deleteTargetCatalogItem) {
            void deleteCatalogItem(deleteTargetCatalogItem);
          }
        }}
        open={!!deleteTargetCatalogItem}
        pending={pendingKey === 'delete-catalog'}
        title={
          deleteTargetCatalogItem
            ? `Delete "${deleteTargetCatalogItem.name}"?`
            : 'Delete competitor?'
        }
      />
    </div>
  );
}

