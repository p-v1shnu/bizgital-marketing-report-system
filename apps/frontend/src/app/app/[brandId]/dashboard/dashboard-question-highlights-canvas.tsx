'use client';

import { useMemo } from 'react';

import { cn } from '@/lib/utils';
import { DashboardChartCopyButton } from './dashboard-chart-copy-button';
import { getDashboardContentCanvasAspectClass } from './dashboard-content-canvas-ratio';
import { getDashboardContentNoteTypography } from './dashboard-content-note-typography';
import { useDashboardGlobalKpiControls } from './dashboard-global-kpi-controls';

type ScreenshotItem = {
  id: string;
  displayOrder: number;
  screenshotUrl: string;
};

type Props = {
  screenshots: ScreenshotItem[];
  highlightNote?: string | null;
  captureTargetId?: string;
};

function slotClassName(index: number, count: number) {
  if (count <= 1) {
    return 'col-span-6 row-span-8';
  }

  if (count === 2) {
    return 'col-span-6 row-span-8';
  }

  if (count === 3) {
    return index === 0 ? 'col-span-6 row-span-8' : 'col-span-3 row-span-8';
  }

  if (count === 4) {
    return 'col-span-3 row-span-8';
  }

  if (count === 5) {
    if (index < 4) {
      return 'col-span-3 row-span-4';
    }
    return 'col-span-6 row-span-4';
  }

  // 6+ screenshots: balanced tile layout
  return 'col-span-3 row-span-4';
}

export function DashboardQuestionHighlightsCanvas({
  screenshots,
  highlightNote,
  captureTargetId
}: Props) {
  const { contentCanvasRatio, contentNoteScale } = useDashboardGlobalKpiControls();
  const orderedScreenshots = useMemo(
    () => [...screenshots].sort((left, right) => left.displayOrder - right.displayOrder),
    [screenshots]
  );
  const visibleScreenshots = orderedScreenshots.slice(0, 6);
  const hiddenCount = Math.max(0, orderedScreenshots.length - visibleScreenshots.length);
  const normalizedHighlightNote = String(highlightNote ?? '').trim();
  const formattedHighlightNote = useMemo(() => {
    if (!normalizedHighlightNote) {
      return '';
    }

    // Keep user-entered new lines. If bullets were saved inline (" - "),
    // convert them back to per-line bullets for slide readability.
    if (!normalizedHighlightNote.includes('\n') && normalizedHighlightNote.includes(' - ')) {
      return normalizedHighlightNote.replace(/\s-\s+/g, '\n- ');
    }

    return normalizedHighlightNote;
  }, [normalizedHighlightNote]);
  const hasHighlightNote = normalizedHighlightNote.length > 0;
  const shouldShowCanvas = visibleScreenshots.length > 0 || hasHighlightNote;
  const noteTypography = getDashboardContentNoteTypography(contentNoteScale);

  return (
    <article className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Highlight screenshots</h3>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700">
            {orderedScreenshots.length} screenshot(s)
          </span>
          {captureTargetId ? <DashboardChartCopyButton targetId={captureTargetId} /> : null}
        </div>
      </div>

      {!shouldShowCanvas ? (
        <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-sm text-slate-500">
          No highlight screenshot
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <div
            className={cn(
              'w-full rounded-2xl bg-white p-2',
              getDashboardContentCanvasAspectClass(contentCanvasRatio)
            )}
            id={captureTargetId}
          >
            <div className="flex h-full flex-col gap-2">
              <div className="min-h-0 flex-1">
                {visibleScreenshots.length > 0 ? (
                  <div className="grid h-full grid-cols-12 grid-rows-8 gap-1">
                    {visibleScreenshots.map((item, index) => (
                      <div
                        className={cn(
                          'min-h-0 min-w-0 overflow-hidden rounded-[16px] bg-white',
                          slotClassName(index, visibleScreenshots.length)
                        )}
                        key={item.id}
                      >
                        <img
                          alt={`Question highlight screenshot ${item.displayOrder}`}
                          className="h-full w-full object-contain object-top"
                          loading="lazy"
                          src={item.screenshotUrl}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">
                    No highlight screenshot
                  </div>
                )}
              </div>

              {hasHighlightNote ? (
                <div className="shrink-0 self-stretch">
                  <div className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-5 py-4">
                      <div
                      className="font-semibold text-slate-800"
                      style={{
                        fontSize: `${noteTypography.titleSizePx}px`,
                        lineHeight: `${noteTypography.titleLineHeightPx}px`
                      }}
                    >
                      Highlight note
                    </div>
                    <p
                      className="mt-2 whitespace-pre-wrap break-words text-slate-800"
                      style={{
                        fontSize: `${noteTypography.bodySizePx}px`,
                        lineHeight: `${noteTypography.bodyLineHeightPx}px`
                      }}
                    >
                      {formattedHighlightNote}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {hiddenCount > 0 ? (
            <div className="mt-2 text-right text-xs text-slate-500">
              +{hiddenCount} more screenshot(s)
            </div>
          ) : null}
        </div>
      )}
    </article>
  );
}
