import type { DashboardContentNoteScale } from './dashboard-global-kpi-controls';

type NoteTypography = {
  titleSizePx: number;
  titleLineHeightPx: number;
  bodySizePx: number;
  bodyLineHeightPx: number;
};

const NOTE_TYPOGRAPHY_BY_SCALE: Record<DashboardContentNoteScale, NoteTypography> = {
  100: {
    titleSizePx: 14,
    titleLineHeightPx: 18,
    bodySizePx: 12,
    bodyLineHeightPx: 17
  },
  200: {
    titleSizePx: 18,
    titleLineHeightPx: 23,
    bodySizePx: 16,
    bodyLineHeightPx: 22
  },
  300: {
    titleSizePx: 24,
    titleLineHeightPx: 30,
    bodySizePx: 20,
    bodyLineHeightPx: 27
  },
  500: {
    titleSizePx: 32,
    titleLineHeightPx: 40,
    bodySizePx: 26,
    bodyLineHeightPx: 35
  },
  800: {
    titleSizePx: 42,
    titleLineHeightPx: 52,
    bodySizePx: 34,
    bodyLineHeightPx: 46
  },
  1000: {
    titleSizePx: 52,
    titleLineHeightPx: 64,
    bodySizePx: 42,
    bodyLineHeightPx: 57
  }
};

export function getDashboardContentNoteTypography(scale: DashboardContentNoteScale): NoteTypography {
  return NOTE_TYPOGRAPHY_BY_SCALE[scale];
}

