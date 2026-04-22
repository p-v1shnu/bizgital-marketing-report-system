'use client';

import type { CSSProperties, ReactNode } from 'react';

import { useDashboardGlobalKpiControls } from './dashboard-global-kpi-controls';

type DashboardContentPreviewScaleProps = {
  enabled?: boolean;
  children: ReactNode;
};

export function DashboardContentPreviewScale({
  enabled = false,
  children
}: DashboardContentPreviewScaleProps) {
  const { presentationMode } = useDashboardGlobalKpiControls();

  if (!enabled || presentationMode) {
    return <>{children}</>;
  }

  const compactScale = 0.8;
  const compactStyle: CSSProperties = {
    zoom: compactScale
  };

  return (
    <div className="min-w-0 overflow-x-hidden">
      <div style={compactStyle}>{children}</div>
    </div>
  );
}
