'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmActionModal } from '@/components/ui/confirm-action-modal';
import { Input } from '@/components/ui/input';
import { ModalShell } from '@/components/ui/modal-shell';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  createBrandCampaign,
  deleteBrandCampaign,
  getBrandCampaigns,
  type BrandCampaignItem,
  type BrandCampaignListResponse,
  type BrandCampaignObjective,
  type BrandCampaignStatus,
  updateBrandCampaign
} from '@/lib/reporting-api';
import { buildRollingYearValues } from '@/lib/year-options';

type Props = {
  brandCode: string;
  initialCampaigns: BrandCampaignListResponse;
};

type CampaignEditorMode = 'create' | 'edit' | null;

type CampaignFormValues = {
  name: string;
  status: BrandCampaignStatus;
  objective: BrandCampaignObjective | '';
  startDate: string;
  endDate: string;
  notes: string;
};

const campaignStatusOptions: Array<{
  value: BrandCampaignStatus;
  label: string;
}> = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' }
];

const campaignObjectiveOptions: Array<{
  value: BrandCampaignObjective;
  label: string;
}> = [
  { value: 'awareness', label: 'Awareness' },
  { value: 'engagement', label: 'Engagement' },
  { value: 'conversion', label: 'Conversion' }
];

function defaultCampaignFormValues(): CampaignFormValues {
  return {
    name: '',
    status: 'active',
    objective: '',
    startDate: '',
    endDate: '',
    notes: ''
  };
}

function mapCampaignToFormValues(campaign: BrandCampaignItem): CampaignFormValues {
  return {
    name: campaign.name,
    status: campaign.status,
    objective: campaign.objective ?? '',
    startDate: campaign.startDate ?? '',
    endDate: campaign.endDate ?? '',
    notes: campaign.notes ?? ''
  };
}

function normalizeOptionalDate(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalText(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function BrandCampaignManager({ brandCode, initialCampaigns }: Props) {
  const [campaignState, setCampaignState] = useState(initialCampaigns);
  const [selectedYear, setSelectedYear] = useState(initialCampaigns.year);
  const [editorMode, setEditorMode] = useState<CampaignEditorMode>(null);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [deletingCampaign, setDeletingCampaign] = useState<BrandCampaignItem | null>(null);
  const [formValues, setFormValues] = useState<CampaignFormValues>(() =>
    defaultCampaignFormValues()
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<'load-year' | 'save' | 'delete' | null>(null);

  const yearOptions = useMemo(() => {
    return buildRollingYearValues([
      ...campaignState.yearOptions.map((option) => option.year),
      selectedYear
    ]);
  }, [campaignState.yearOptions, selectedYear]);

  const activeCount = campaignState.items.filter((item) => item.status === 'active').length;
  const inactiveCount = campaignState.items.length - activeCount;

  async function loadYear(year: number) {
    if (!Number.isInteger(year) || year < 2000 || year > 3000) {
      setStatusError('Year must be between 2000 and 3000.');
      return;
    }

    setPendingKey('load-year');
    setStatusError(null);
    setStatusMessage(null);

    try {
      const response = await getBrandCampaigns(brandCode, {
        year,
        includeInactive: true
      });
      setCampaignState(response);
      setSelectedYear(response.year);
    } catch (error) {
      setStatusError(
        error instanceof Error
          ? error.message
          : `Failed to load campaigns for ${year}.`
      );
    } finally {
      setPendingKey(null);
    }
  }

  function openCreateCampaignModal() {
    setEditorMode('create');
    setEditingCampaignId(null);
    setFormValues(defaultCampaignFormValues());
    setStatusError(null);
    setStatusMessage(null);
  }

  function openEditCampaignModal(campaign: BrandCampaignItem) {
    setEditorMode('edit');
    setEditingCampaignId(campaign.id);
    setFormValues(mapCampaignToFormValues(campaign));
    setStatusError(null);
    setStatusMessage(null);
  }

  function closeEditorModal() {
    if (pendingKey === 'save') {
      return;
    }
    setEditorMode(null);
    setEditingCampaignId(null);
    setFormValues(defaultCampaignFormValues());
  }

  async function refreshCurrentYear() {
    const response = await getBrandCampaigns(brandCode, {
      year: selectedYear,
      includeInactive: true
    });
    setCampaignState(response);
    setSelectedYear(response.year);
  }

  async function saveCampaign() {
    const normalizedName = formValues.name.trim();

    if (!normalizedName) {
      setStatusError('Campaign name is required.');
      return;
    }

    const startDate = normalizeOptionalDate(formValues.startDate);
    const endDate = normalizeOptionalDate(formValues.endDate);

    if (startDate && endDate && startDate > endDate) {
      setStatusError('End date must be the same as or after start date.');
      return;
    }

    setPendingKey('save');
    setStatusError(null);
    setStatusMessage(null);

    try {
      if (editorMode === 'create') {
        await createBrandCampaign(brandCode, {
          year: selectedYear,
          name: normalizedName,
          status: formValues.status,
          objective: formValues.objective || null,
          startDate,
          endDate,
          notes: normalizeOptionalText(formValues.notes)
        });
        await refreshCurrentYear();
        setStatusMessage(`Campaign "${normalizedName}" created for ${selectedYear}.`);
      } else if (editorMode === 'edit' && editingCampaignId) {
        await updateBrandCampaign(brandCode, editingCampaignId, {
          name: normalizedName,
          status: formValues.status,
          objective: formValues.objective || null,
          startDate,
          endDate,
          notes: normalizeOptionalText(formValues.notes)
        });
        await refreshCurrentYear();
        setStatusMessage(`Campaign "${normalizedName}" updated.`);
      }

      setEditorMode(null);
      setEditingCampaignId(null);
      setFormValues(defaultCampaignFormValues());
    } catch (error) {
      setStatusError(
        error instanceof Error ? error.message : 'Failed to save campaign.'
      );
    } finally {
      setPendingKey(null);
    }
  }

  async function confirmDeleteCampaign() {
    if (!deletingCampaign) {
      return;
    }

    setPendingKey('delete');
    setStatusError(null);
    setStatusMessage(null);

    try {
      await deleteBrandCampaign(brandCode, deletingCampaign.id);
      await refreshCurrentYear();
      setStatusMessage(`Campaign "${deletingCampaign.name}" deleted.`);
      setDeletingCampaign(null);
    } catch (error) {
      setStatusError(
        error instanceof Error ? error.message : 'Failed to delete campaign.'
      );
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <div className="space-y-4">
      {statusMessage && !editorMode ? (
        <div className="rounded-[18px] border border-emerald-500/25 bg-emerald-500/8 px-3 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          {statusMessage}
        </div>
      ) : null}
      {statusError && !editorMode ? (
        <div className="rounded-[18px] border border-rose-500/25 bg-rose-500/8 px-3 py-3 text-sm text-rose-700 dark:text-rose-300">
          {statusError}
        </div>
      ) : null}

      <div className="rounded-[24px] border border-border/60 bg-background/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-base font-semibold text-foreground">Campaign setup</div>
            <div className="text-sm text-muted-foreground">
              Campaign options in this year will be used in import dropdown.
            </div>
          </div>
          <Badge variant="outline">Year {selectedYear}</Badge>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[220px_auto] md:items-end">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="brand-campaign-year-select">
              Campaign year
            </label>
            <Select
              disabled={pendingKey !== null}
              id="brand-campaign-year-select"
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

          <div className="flex flex-wrap gap-2 md:justify-end">
            <Button
              disabled={pendingKey !== null}
              onClick={openCreateCampaignModal}
              size="sm"
              type="button"
            >
              <Plus />
              Add campaign
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border/60 bg-background/55 px-3 py-3">
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Total
            </div>
            <div className="mt-1 text-xl font-semibold">{campaignState.items.length}</div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/55 px-3 py-3">
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Active
            </div>
            <div className="mt-1 text-xl font-semibold">{activeCount}</div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/55 px-3 py-3">
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Inactive
            </div>
            <div className="mt-1 text-xl font-semibold">{inactiveCount}</div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {campaignState.items.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-border/60 bg-background/45 px-4 py-8 text-center text-sm text-muted-foreground">
            No campaigns configured for {selectedYear}.
          </div>
        ) : (
          campaignState.items.map((campaign) => (
            <div
              className="rounded-[20px] border border-border/60 bg-background/55 px-4 py-4"
              key={campaign.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Megaphone className="size-4 text-primary" />
                    <div className="truncate text-base font-medium text-foreground">
                      {campaign.name}
                    </div>
                    <Badge variant={campaign.status === 'active' ? 'default' : 'outline'}>
                      {campaign.status === 'active' ? 'Active' : 'Inactive'}
                    </Badge>
                    {campaign.objective ? (
                      <Badge variant="outline">{campaign.objective}</Badge>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <CalendarDays className="size-3.5" />
                    {campaign.startDate || campaign.endDate
                      ? `${campaign.startDate ?? '-'} to ${campaign.endDate ?? '-'}`
                      : 'No schedule'}
                  </div>
                  {campaign.notes ? (
                    <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-2 text-sm text-muted-foreground">
                      {campaign.notes}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    disabled={pendingKey !== null}
                    onClick={() => openEditCampaignModal(campaign)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Pencil />
                    Edit
                  </Button>
                  <Button
                    disabled={pendingKey !== null}
                    onClick={() => setDeletingCampaign(campaign)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Trash2 />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {editorMode ? (
        <ModalShell
          description={`Configure campaign details for year ${selectedYear}.`}
          error={statusError}
          message={statusMessage}
          onClose={closeEditorModal}
          title={editorMode === 'create' ? 'Add campaign' : 'Edit campaign'}
        >
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="campaign-name-input">
                Campaign name
              </label>
              <Input
                disabled={pendingKey === 'save'}
                id="campaign-name-input"
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setFormValues((current) => ({
                    ...current,
                    name: value
                  }));
                }}
                placeholder="Campaign name"
                value={formValues.name}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="campaign-status-select">
                  Status
                </label>
                <Select
                  disabled={pendingKey === 'save'}
                  id="campaign-status-select"
                  onChange={(event) => {
                    const value = event.currentTarget.value as BrandCampaignStatus;
                    setFormValues((current) => ({
                      ...current,
                      status: value
                    }));
                  }}
                  value={formValues.status}
                >
                  {campaignStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="campaign-objective-select">
                  Objective
                </label>
                <Select
                  disabled={pendingKey === 'save'}
                  id="campaign-objective-select"
                  onChange={(event) => {
                    const value = event.currentTarget.value as BrandCampaignObjective | '';
                    setFormValues((current) => ({
                      ...current,
                      objective: value
                    }));
                  }}
                  value={formValues.objective}
                >
                  <option value="">Unspecified</option>
                  {campaignObjectiveOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="campaign-start-date-input">
                  Start date
                </label>
                <Input
                  disabled={pendingKey === 'save'}
                  id="campaign-start-date-input"
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setFormValues((current) => ({
                      ...current,
                      startDate: value
                    }));
                  }}
                  type="date"
                  value={formValues.startDate}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="campaign-end-date-input">
                  End date
                </label>
                <Input
                  disabled={pendingKey === 'save'}
                  id="campaign-end-date-input"
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setFormValues((current) => ({
                      ...current,
                      endDate: value
                    }));
                  }}
                  type="date"
                  value={formValues.endDate}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="campaign-notes-input">
                Notes
              </label>
              <Textarea
                className="min-h-24"
                disabled={pendingKey === 'save'}
                id="campaign-notes-input"
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setFormValues((current) => ({
                    ...current,
                    notes: value
                  }));
                }}
                placeholder="Optional campaign note"
                value={formValues.notes}
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                disabled={pendingKey === 'save'}
                onClick={closeEditorModal}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                disabled={pendingKey === 'save'}
                onClick={() => void saveCampaign()}
                type="button"
              >
                {pendingKey === 'save' ? 'Saving...' : editorMode === 'create' ? 'Create campaign' : 'Save changes'}
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      <ConfirmActionModal
        cancelLabel="Cancel"
        confirmLabel="Delete campaign"
        description={
          deletingCampaign
            ? `Delete "${deletingCampaign.name}" from ${deletingCampaign.year}?`
            : ''
        }
        onCancel={() => {
          if (pendingKey !== 'delete') {
            setDeletingCampaign(null);
          }
        }}
        onConfirm={() => void confirmDeleteCampaign()}
        open={!!deletingCampaign}
        pending={pendingKey === 'delete'}
        title="Delete campaign"
      />
    </div>
  );
}
