'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ModalShell } from '@/components/ui/modal-shell';
import { badgeToneForState, labelForState } from '@/lib/reporting-ui';
import type { ReportingListItem } from '@/lib/reporting-api';

type ReportActivityLogButtonProps = {
  periodLabel: string;
  versions: ReportingListItem['versions'];
  activityLog: ReportingListItem['activityLog'];
  compact?: boolean;
};

function formatTimestamp(value: string | null) {
  if (!value) {
    return null;
  }

  return new Date(value).toLocaleString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function ReportActivityLogButton({
  periodLabel,
  versions,
  activityLog,
  compact = false
}: ReportActivityLogButtonProps) {
  const [open, setOpen] = useState(false);
  const versionById = useMemo(
    () => new Map(versions.map(version => [version.id, version])),
    [versions]
  );
  const fallbackLegacyEvents = useMemo(
    () =>
      versions.flatMap(version => {
        const events: Array<{
          id: string;
          label: string;
          at: string;
          actorName: string | null;
          actorEmail: string | null;
          reportVersionId: string | null;
          note: string | null;
        }> = [];
        const createdAt = formatTimestamp(version.createdAt);
        const submittedAt = formatTimestamp(version.submittedAt);
        const approvedAt = formatTimestamp(version.approvedAt);
        const rejectedAt = formatTimestamp(version.rejectedAt);
        const updatedAt = formatTimestamp(version.updatedAt);

        if (createdAt) {
          events.push({
            id: `${version.id}-legacy-created`,
            label: `Draft v${version.versionNo} created`,
            at: createdAt,
            actorName: null,
            actorEmail: null,
            reportVersionId: version.id,
            note: null
          });
        }
        if (submittedAt) {
          events.push({
            id: `${version.id}-legacy-submitted`,
            label: `Version v${version.versionNo} submitted`,
            at: submittedAt,
            actorName: null,
            actorEmail: null,
            reportVersionId: version.id,
            note: null
          });
        }
        if (approvedAt) {
          events.push({
            id: `${version.id}-legacy-approved`,
            label: `Version v${version.versionNo} approved`,
            at: approvedAt,
            actorName: null,
            actorEmail: null,
            reportVersionId: version.id,
            note: null
          });
        }
        if (rejectedAt) {
          events.push({
            id: `${version.id}-legacy-rejected`,
            label: `Changes requested on v${version.versionNo}`,
            at: rejectedAt,
            actorName: null,
            actorEmail: null,
            reportVersionId: version.id,
            note: version.rejectionReason ?? null
          });
        }
        if (updatedAt) {
          events.push({
            id: `${version.id}-legacy-updated`,
            label: `Version v${version.versionNo} updated`,
            at: updatedAt,
            actorName: null,
            actorEmail: null,
            reportVersionId: version.id,
            note: null
          });
        }

        return events;
      }),
    [versions]
  );
  const events =
    activityLog.length > 0
      ? activityLog
          .map(event => ({
            ...event,
            atLabel: formatTimestamp(event.at) ?? event.at
          }))
          .sort(
            (left, right) =>
              new Date(right.at).getTime() - new Date(left.at).getTime()
          )
      : fallbackLegacyEvents
          .map(event => ({
            ...event,
            atLabel: event.at
          }))
          .sort(
            (left, right) =>
              new Date(right.at).getTime() - new Date(left.at).getTime()
          );

  return (
    <>
      {compact ? (
        <button
          className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-muted/60"
          onClick={() => setOpen(true)}
          type="button"
        >
          View activity log
        </button>
      ) : (
        <Button onClick={() => setOpen(true)} size="sm" type="button" variant="outline">
          Activity log
        </Button>
      )}

      {open ? (
        <ModalShell
          closeOnBackdropClick
          description="Timeline with actor information when captured by the system."
          onClose={() => setOpen(false)}
          showCloseButton={false}
          title={`Activity log - ${periodLabel}`}
          widthClassName="max-w-3xl"
        >
          <div className="space-y-2">
            {events.length === 0 ? (
              <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3 text-sm text-muted-foreground">
                No activity yet.
              </div>
            ) : (
              events.map(event => {
                const version = event.reportVersionId
                  ? (versionById.get(event.reportVersionId) ?? null)
                  : null;
                const actorLabel =
                  event.actorName || event.actorEmail
                    ? [event.actorName, event.actorEmail]
                        .filter(Boolean)
                        .join(' - ')
                    : 'Unknown user';

                return (
                  <div
                    className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3"
                    key={event.id}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium text-foreground">{event.label}</div>
                        {version ? (
                          <Badge
                            className={badgeToneForState(version.workflowState)}
                            variant="outline"
                          >
                            v{version.versionNo} {labelForState(version.workflowState)}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground">{event.atLabel}</div>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{actorLabel}</div>
                    {event.note ? (
                      <div className="mt-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                        {event.note}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </ModalShell>
      ) : null}
    </>
  );
}

