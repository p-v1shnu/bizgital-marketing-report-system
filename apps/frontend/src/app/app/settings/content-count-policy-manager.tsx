import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { ContentCountPolicyResponse } from '@/lib/reporting-api';

import { updateContentCountPolicyAction } from './actions';

type ContentCountPolicyManagerProps = {
  policy: ContentCountPolicyResponse;
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

export function ContentCountPolicyManager({
  policy,
  returnPath
}: ContentCountPolicyManagerProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-[20px] border border-border/60 bg-background/60 p-4 text-sm text-muted-foreground">
        Set how Monthly Summary is calculated in dashboard content. This policy controls both
        total content count and all Monthly Summary breakdown sections (Media Format, Content
        Objective, Content Style, Related Product, and Campaign). Approved reports keep snapshot
        values and are not recalculated after policy changes.
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
        </div>
      </div>

      <form
        action={updateContentCountPolicyAction}
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
                Use only CSV-imported rows for Monthly Summary total and all Monthly Summary
                breakdown sections.
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
                Include manually added rows in Monthly Summary total and all Monthly Summary
                breakdown sections.
              </div>
            </div>
          </label>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="content-count-policy-note">
            Change note
          </label>
          <Textarea
            defaultValue={policy.note ?? ''}
            id="content-count-policy-note"
            name="note"
            placeholder="Reason for change (required when enabling CSV + manual rows)."
          />
        </div>

        <div className="flex justify-end">
          <Button type="submit">Save count policy</Button>
        </div>
      </form>
    </div>
  );
}
