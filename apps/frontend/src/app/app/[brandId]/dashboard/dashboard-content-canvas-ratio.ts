import type { DashboardContentCanvasRatio } from './dashboard-global-kpi-controls';

export function getDashboardContentCanvasAspectClass(ratio: DashboardContentCanvasRatio) {
  if (ratio === '13_9') {
    return 'aspect-[13/9]';
  }

  if (ratio === '4_3') {
    return 'aspect-[4/3]';
  }

  return 'aspect-video';
}

