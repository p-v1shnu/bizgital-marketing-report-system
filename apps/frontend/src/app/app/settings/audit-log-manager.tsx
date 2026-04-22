import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AdminAuditLogListResponse } from '@/lib/reporting-api';

type AuditLogManagerProps = {
  data: AdminAuditLogListResponse;
  q: string;
  limit: number;
};

const ALLOWED_LIMITS = [20, 50, 100] as const;
const SETTINGS_TAB = 'audit-log';

function buildAuditLogHref(input: { q: string; page: number; limit: number }) {
  const searchParams = new URLSearchParams({
    tab: SETTINGS_TAB,
    page: String(input.page),
    limit: String(input.limit)
  });

  const keyword = input.q.trim();
  if (keyword) {
    searchParams.set('q', keyword);
  }

  return `/app/settings?${searchParams.toString()}`;
}

function formatAuditTime(isoTime: string) {
  const parsed = new Date(isoTime);
  if (Number.isNaN(parsed.getTime())) {
    return isoTime;
  }

  return parsed.toLocaleString('en-US', {
    timeZone: 'Asia/Vientiane',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

export function AuditLogManager({ data, q, limit }: AuditLogManagerProps) {
  const hasSearch = q.trim().length > 0;
  const page = data.pagination.page;
  const totalPages = data.pagination.totalPages;
  const canGoPrev = page > 1;
  const canGoNext = page < totalPages;

  return (
    <div className="space-y-3">
      <form action="/app/settings" className="rounded-[20px] border border-border/60 bg-background/60 px-4 py-4" method="get">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="audit-log-search-input">
            Search audit logs
          </label>
          <input name="tab" type="hidden" value={SETTINGS_TAB} />
          <input name="page" type="hidden" value="1" />
          <input name="limit" type="hidden" value={String(limit)} />
          <div className="flex flex-wrap gap-2">
            <div className="min-w-[260px] flex-1">
              <Input
                defaultValue={q}
                id="audit-log-search-input"
                name="q"
                placeholder="Search by actor, action, entity, or summary..."
              />
            </div>
            <Button type="submit">Search</Button>
            {hasSearch ? (
              <Button asChild type="button" variant="outline">
                <Link href={buildAuditLogHref({ q: '', page: 1, limit })}>Clear</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </form>

      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {data.pagination.total} results
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Rows per page</span>
          <div className="flex gap-1">
            {ALLOWED_LIMITS.map(option => (
              <Link
                className={`rounded-lg border px-2 py-1 ${
                  limit === option
                    ? 'border-primary/25 bg-primary/10 text-foreground'
                    : 'border-border/60 bg-background/60 hover:text-foreground'
                }`}
                href={buildAuditLogHref({ q, page: 1, limit: option })}
                key={option}
              >
                {option}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[22px] border border-border/60 bg-background/60">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border/60 bg-background/70 text-xs uppercase tracking-[0.15em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Actor</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Entity</th>
              <th className="px-4 py-3 font-medium">Summary</th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-muted-foreground" colSpan={5}>
                  {hasSearch
                    ? 'No logs match this search.'
                    : 'No audit logs found yet.'}
                </td>
              </tr>
            ) : (
              data.items.map(item => (
                <tr className="border-b border-border/50 last:border-b-0" key={item.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {formatAuditTime(item.time)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">
                      {item.actor.name ?? '-'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {item.actor.email ?? '-'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{item.action.label}</div>
                    <div className="text-xs text-muted-foreground">{item.action.key}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{item.entity.type}</div>
                    <div className="max-w-[260px] truncate text-xs text-muted-foreground">
                      {item.entity.label ?? '-'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-foreground">{item.summary}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          Page {page} of {totalPages}
        </div>
        <div className="flex gap-2">
          <Button asChild disabled={!canGoPrev} size="sm" variant="outline">
            <Link href={buildAuditLogHref({ q, page: Math.max(1, page - 1), limit })}>
              Previous
            </Link>
          </Button>
          <Button asChild disabled={!canGoNext} size="sm" variant="outline">
            <Link href={buildAuditLogHref({ q, page: Math.min(totalPages, page + 1), limit })}>
              Next
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

