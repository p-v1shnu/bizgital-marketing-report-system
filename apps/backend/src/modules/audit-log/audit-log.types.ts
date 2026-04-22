export type AdminAuditEntityType = 'USER' | 'BRAND' | 'REPORT' | 'CONTENT';

export type AdminAuditActorInput = {
  userId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
};

export type AppendAdminAuditLogInput = {
  actionKey: string;
  actionLabel?: string | null;
  entityType: AdminAuditEntityType;
  entityId?: string | null;
  entityLabel?: string | null;
  summary: string;
  metadata?: Record<string, unknown> | null;
  actor?: AdminAuditActorInput;
};

export type ListAdminAuditLogsInput = {
  actorEmail: string | null | undefined;
  q?: string | null;
  page?: number | null;
  limit?: number | null;
};

export type AdminAuditLogListItem = {
  id: string;
  time: string;
  actor: {
    userId: string | null;
    name: string | null;
    email: string | null;
  };
  action: {
    key: string;
    label: string;
  };
  entity: {
    type: AdminAuditEntityType;
    id: string | null;
    label: string | null;
  };
  summary: string;
  metadata: Record<string, unknown> | null;
};

export type AdminAuditLogListResponse = {
  items: AdminAuditLogListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

