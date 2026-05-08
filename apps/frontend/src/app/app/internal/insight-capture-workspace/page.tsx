import { requireAuth } from '@/lib/auth';

import { InsightCaptureWorkspaceClient } from './insight-capture-workspace-client';

export default async function InsightCaptureWorkspacePage() {
  await requireAuth('/app/internal/insight-capture-workspace');

  return <InsightCaptureWorkspaceClient />;
}
