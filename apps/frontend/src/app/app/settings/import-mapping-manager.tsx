import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ImportColumnMappingConfigResponse } from '@/lib/reporting-api';

import {
  createImportMappingDraftFromPublishedAction,
  createImportMappingDraftFromCsvAction,
  discardImportMappingDraftAction,
  publishImportMappingAction,
  rollbackImportMappingAction,
  saveImportMappingDraftAction
} from './actions';

type ImportMappingManagerProps = {
  config: ImportColumnMappingConfigResponse;
  returnPath: string;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

export function ImportMappingManager({ config, returnPath }: ImportMappingManagerProps) {
  const publishedVersionId = config.published?.versionId ?? null;
  const canCreateDraftFromPublished = !!config.published;
  const draftCsvColumnCount = config.draft?.uploadedHeaderCount ?? 0;
  const draftUniqueHeaderCount = config.draft?.uploadedHeaders.length ?? 0;
  const draftRuleCount = config.draft?.rules.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="rounded-[20px] border border-border/60 bg-background/60 p-4 text-sm text-muted-foreground">
        Import mapping is admin-only. Use this page to tell the system which CSV header names
        should map into each system field, then publish once for all users.
      </div>

      <div className="rounded-[20px] border border-border/60 bg-background/60 p-4 text-sm text-muted-foreground">
        <div className="font-medium text-foreground">How to read this page</div>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <span className="text-foreground">System field</span>: core field used directly by app
            logic.
          </li>
          <li>
            <span className="text-foreground">Primary CSV header</span>: the main expected column
            name from CSV.
          </li>
          <li>
            <span className="text-foreground">Display name in system</span>: label shown across
            import, mapping, metrics, and report surfaces.
          </li>
          <li>
            <span className="text-foreground">Accepted header names</span>: alternate names
            separated by comma (<code>,</code>) for future Meta header changes.
          </li>
          <li>
            <span className="text-foreground">Block import if missing</span>: if checked, import
            cannot continue until this field is found.
          </li>
        </ul>
        <div className="mt-2">
          This screen now includes all discovered CSV headers so you can define alias coverage in
          one place.
        </div>
      </div>

      <div className="rounded-[20px] border border-border/60 bg-background/60 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant="outline">Current published</Badge>
          {config.published ? (
            <Badge variant="outline">{config.published.versionId.slice(0, 8)}</Badge>
          ) : (
            <Badge variant="outline">none</Badge>
          )}
        </div>
        {config.published ? (
          <div className="space-y-1 text-sm text-muted-foreground">
            <div>Published at: {formatDate(config.published.publishedAt)}</div>
            <div>Published by: {config.published.publishedBy ?? 'unknown'}</div>
            <div>Source file: {config.published.sourceFilename ?? 'n/a'}</div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No published mapping yet.</div>
        )}
      </div>

      <form action={createImportMappingDraftFromCsvAction} className="rounded-[20px] border border-border/60 bg-background/60 p-4">
        <input name="returnPath" type="hidden" value={returnPath} />
        <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_220px_260px] md:items-end">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="import-mapping-csv-file-input">
              CSV source file
            </label>
            <Input accept=".csv,text/csv" id="import-mapping-csv-file-input" name="file" type="file" />
          </div>
          <Button className="w-full md:w-auto" type="submit">
            Create draft from CSV
          </Button>
          <Button
            className="w-full md:w-auto"
            disabled={!canCreateDraftFromPublished}
            formAction={createImportMappingDraftFromPublishedAction}
            type="submit"
            variant="outline"
          >
            Create draft from current published
          </Button>
        </div>
      </form>

      {config.draft ? (
        <form action={saveImportMappingDraftAction} className="space-y-4 rounded-[20px] border border-border/60 bg-background/60 p-4">
          <input name="returnPath" type="hidden" value={returnPath} />
          <input name="sourceFilename" type="hidden" value={config.draft.sourceFilename ?? ''} />
          {config.draft.uploadedHeaders.map((header) => (
            <input key={header} name="uploadedHeader" type="hidden" value={header} />
          ))}

          <div className="space-y-1">
            <div className="text-sm font-medium text-foreground">Draft from: {config.draft.sourceFilename ?? 'manual'}</div>
            <div className="text-xs text-muted-foreground">
              Updated {formatDate(config.draft.updatedAt)} by {config.draft.updatedBy ?? 'unknown'}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline">CSV columns: {draftCsvColumnCount}</Badge>
              <Badge variant="outline">Unique headers: {draftUniqueHeaderCount}</Badge>
              <Badge variant="outline">Mapping rows: {draftRuleCount}</Badge>
            </div>
          </div>

          <div className="space-y-3">
            {config.draft.rules.map((rule) => {
              const targetMeta =
                config.targetCatalog.find((target) => target.key === rule.targetField) ?? null;
              const isCanonicalTarget = !!targetMeta;
              return (
                <div
                  className="grid gap-3 rounded-xl border border-border/60 bg-background/70 p-3 md:grid-cols-[220px_minmax(180px,1fr)_minmax(180px,1fr)_minmax(220px,1.1fr)_120px]"
                  key={rule.targetField}
                >
                  <div>
                    <input name="targetField" type="hidden" value={rule.targetField} />
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      {isCanonicalTarget ? 'System field' : 'CSV column'}
                    </div>
                    <div className="text-sm font-medium text-foreground">
                      {targetMeta?.label ?? rule.baselineHeader}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {targetMeta?.description ??
                        'Header alias mapping for imported CSV column.'}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Primary CSV header</div>
                    <Input defaultValue={rule.baselineHeader} name="baselineHeader" placeholder="Example: Views" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Display name in system</div>
                    <Input
                      defaultValue={rule.displayLabel}
                      name="displayLabel"
                      placeholder="Example: Reach"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Accepted header names (comma-separated)</div>
                    <Input defaultValue={rule.aliases.join(', ')} name="aliases" placeholder="Example: View count, Total views" />
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm text-foreground">
                    <input
                      defaultChecked={rule.required}
                      disabled={!isCanonicalTarget}
                      name="requiredTarget"
                      type="checkbox"
                      value={rule.targetField}
                    />
                    Block import if missing
                  </label>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit">Save draft</Button>
            <Button formAction={discardImportMappingDraftAction} type="submit" variant="outline">
              Discard draft
            </Button>
          </div>
        </form>
      ) : null}

      <form action={publishImportMappingAction} className="rounded-[20px] border border-border/60 bg-background/60 p-4">
        <input name="returnPath" type="hidden" value={returnPath} />
        <div className="grid gap-3 md:grid-cols-[minmax(200px,1fr)_220px] md:items-end">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="import-mapping-publish-note-input">
              Publish note (optional)
            </label>
            <Input id="import-mapping-publish-note-input" name="note" placeholder="Publish note (optional)" />
          </div>
          <Button className="w-full md:w-auto" disabled={!config.draft} type="submit">
            Publish mapping
          </Button>
        </div>
      </form>

      <div className="rounded-[20px] border border-border/60 bg-background/60 p-4">
        <div className="mb-3 text-sm font-medium text-foreground">History / rollback</div>
        <div className="space-y-2">
          {config.history.length === 0 ? (
            <div className="text-sm text-muted-foreground">No history yet.</div>
          ) : (
            config.history.map((version) => (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/70 px-3 py-2" key={version.versionId}>
                <div className="space-y-1 text-sm">
                  <div className="font-medium text-foreground">{version.versionId}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(version.publishedAt)} • {version.publishedBy ?? 'unknown'} • {version.sourceFilename ?? 'n/a'}
                  </div>
                </div>
                <form action={rollbackImportMappingAction}>
                  <input name="returnPath" type="hidden" value={returnPath} />
                  <input name="versionId" type="hidden" value={version.versionId} />
                  <Button disabled={publishedVersionId === version.versionId} size="sm" type="submit" variant="outline">
                    Rollback
                  </Button>
                </form>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
