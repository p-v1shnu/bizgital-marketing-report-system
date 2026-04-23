import type {
  ContentCountPolicyResponse,
  TopContentDataSourcePolicyResponse
} from '@/lib/reporting-api';

import { ContentCountPolicyManager } from './content-count-policy-manager';
import { TopContentPolicyManager } from './top-content-policy-manager';

type ContentPolicyManagerProps = {
  contentCountPolicy: ContentCountPolicyResponse | null;
  topContentPolicy: TopContentDataSourcePolicyResponse | null;
  contentCountPolicyError: string | null;
  topContentPolicyError: string | null;
  returnPath: string;
};

export function ContentPolicyManager({
  contentCountPolicy,
  topContentPolicy,
  contentCountPolicyError,
  topContentPolicyError,
  returnPath
}: ContentPolicyManagerProps) {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="text-sm font-medium text-foreground">Count policy</div>
        {contentCountPolicyError ? (
          <div className="rounded-[24px] border border-rose-500/25 bg-rose-500/8 px-4 py-4 text-sm text-rose-700 dark:text-rose-300">
            {contentCountPolicyError}
          </div>
        ) : contentCountPolicy ? (
          <ContentCountPolicyManager policy={contentCountPolicy} returnPath={returnPath} />
        ) : (
          <div className="rounded-[24px] border border-dashed border-border/60 px-4 py-4 text-sm text-muted-foreground">
            Content count policy is unavailable right now.
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="text-sm font-medium text-foreground">Top content policy</div>
        {topContentPolicyError ? (
          <div className="rounded-[24px] border border-rose-500/25 bg-rose-500/8 px-4 py-4 text-sm text-rose-700 dark:text-rose-300">
            {topContentPolicyError}
          </div>
        ) : topContentPolicy ? (
          <TopContentPolicyManager policy={topContentPolicy} returnPath={returnPath} />
        ) : (
          <div className="rounded-[24px] border border-dashed border-border/60 px-4 py-4 text-sm text-muted-foreground">
            Top Content policy is unavailable right now.
          </div>
        )}
      </section>
    </div>
  );
}
