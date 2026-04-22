import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { TopContentDataSourcePolicyResponse } from '@/lib/reporting-api';

import { updateTopContentDataSourcePolicyAction } from './actions';

type TopContentPolicyManagerProps = {
  policy: TopContentDataSourcePolicyResponse;
  returnPath: string;
};

function formatUpdatedAt(value: string | null) {
  if (!value) {
    return 'Never updated';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(parsed);
}

export function TopContentPolicyManager({ policy, returnPath }: TopContentPolicyManagerProps) {
  const hasExcludedStyles = policy.excludedContentStyleLabels.length > 0;

  return (
    <div className="space-y-4">
      <div className="rounded-[20px] border border-border/60 bg-background/60 p-4 text-sm text-muted-foreground">
        Set how Top Content ranking sources are interpreted. Default keeps manual rows excluded so
        ranking reflects imported CSV posts only.
      </div>

      <div className="rounded-[20px] border border-border/60 bg-background/60 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant="outline">Current policy</Badge>
          <Badge variant="outline">{policy.label}</Badge>
        </div>
        <div className="space-y-1 text-sm text-muted-foreground">
          <div>Updated at: {formatUpdatedAt(policy.updatedAt)}</div>
          <div>Updated by: {policy.updatedBy ?? 'system default'}</div>
          <div>Last note: {policy.note ?? '-'}</div>
          <div>
            Excluded content styles:{' '}
            {hasExcludedStyles
              ? policy.excludedContentStyleLabels.join(', ')
              : 'None'}
          </div>
        </div>
      </div>

      <form
        action={updateTopContentDataSourcePolicyAction}
        className="space-y-4 rounded-[20px] border border-border/60 bg-background/60 p-4"
      >
        <input name="returnPath" type="hidden" value={returnPath} />

        <div className="space-y-3">
          <label className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/70 px-3 py-3 text-sm">
            <input
              defaultChecked={policy.mode === 'csv_only'}
              name="mode"
              type="radio"
              value="csv_only"
            />
            <div>
              <div className="font-medium text-foreground">CSV only (Exclude manual rows)</div>
              <div className="text-muted-foreground">
                Recommended. Top Content ranks from imported CSV posts only.
              </div>
            </div>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/70 px-3 py-3 text-sm">
            <input
              defaultChecked={policy.mode === 'csv_and_manual'}
              name="mode"
              type="radio"
              value="csv_and_manual"
            />
            <div>
              <div className="font-medium text-foreground">CSV + manual rows</div>
              <div className="text-muted-foreground">
                Allow manual rows to participate in ranking when they have usable values.
              </div>
            </div>
          </label>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="top-content-policy-note">
            Change note
          </label>
          <Textarea
            defaultValue={policy.note ?? ''}
            id="top-content-policy-note"
            name="note"
            placeholder="Reason for change (required when enabling CSV + manual rows)."
          />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium text-foreground">
            Exclude content styles from Top Content ranking
          </div>
          <div className="text-sm text-muted-foreground">
            Posts with selected Content Style values will be skipped when generating Top 3 cards.
          </div>

          {policy.contentStyleOptions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 px-3 py-3 text-sm text-muted-foreground">
              No content style options available yet.
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {policy.contentStyleOptions.map(option => {
                const isExcluded = policy.excludedContentStyleValueKeys.includes(option.valueKey);

                return (
                  <label
                    className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/70 px-3 py-3 text-sm"
                    key={option.valueKey}
                  >
                    <input
                      defaultChecked={isExcluded}
                      name="excludedContentStyleValueKeys"
                      type="checkbox"
                      value={option.valueKey}
                    />
                    <div>
                      <div className="font-medium text-foreground">{option.label}</div>
                      <div className="text-muted-foreground">
                        {option.status === 'active' ? 'Active option' : 'Inactive option'}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button type="submit">Save policy</Button>
        </div>
      </form>
    </div>
  );
}
