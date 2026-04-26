import { randomUUID } from 'node:crypto';

import { ForbiddenException, Injectable } from '@nestjs/common';
import { BrandRole, Prisma, UserStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import type {
  AdminAuditEntityType,
  AdminAuditLogListResponse,
  AppendAdminAuditLogInput,
  ListAdminAuditLogsInput
} from './audit-log.types';

type AuditLogClient = PrismaService | Prisma.TransactionClient;

type RawAuditLogRow = {
  id: string;
  created_at: Date | string;
  actor_user_id: string | null;
  actor_name_snapshot: string | null;
  actor_email_snapshot: string | null;
  action_key: string;
  action_label: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  summary: string;
  metadata_json: string | null;
};

type RawTotalRow = {
  total: bigint | number | string;
};

type RawUserIdRow = {
  user_id: string;
};

@Injectable()
export class AuditLogService {
  private readonly allowedLimits = new Set([20, 50, 100]);
  private readonly defaultLimit = 50;
  private readonly retentionDays = 180;

  constructor(private readonly prisma: PrismaService) {}

  async append(input: AppendAdminAuditLogInput) {
    await this.appendWithClient(this.prisma, input);
  }

  async appendWithClient(client: AuditLogClient, input: AppendAdminAuditLogInput) {
    await this.ensureStorageWithClient(client);
    await this.cleanupExpiredWithClient(client);

    const summary = this.normalizeText(input.summary);
    const actionKey = this.normalizeActionKey(input.actionKey);
    const actionLabel =
      this.normalizeText(input.actionLabel) ?? this.labelFromActionKey(actionKey);
    const entityType = this.normalizeEntityType(input.entityType);

    if (!summary || !actionKey) {
      return;
    }

    const actorSnapshot = await this.resolveActorSnapshotWithClient(client, input);
    const metadataJson = this.stringifyMetadata(input.metadata);

    await client.$executeRawUnsafe(
      `
      INSERT INTO admin_audit_logs (
        id,
        actor_user_id,
        actor_name_snapshot,
        actor_email_snapshot,
        action_key,
        action_label,
        entity_type,
        entity_id,
        entity_label,
        summary,
        metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      randomUUID(),
      actorSnapshot.userId,
      actorSnapshot.name,
      actorSnapshot.email,
      actionKey,
      actionLabel,
      entityType,
      this.normalizeText(input.entityId),
      this.normalizeText(input.entityLabel),
      summary,
      metadataJson
    );
  }

  async listForAdmin(input: ListAdminAuditLogsInput): Promise<AdminAuditLogListResponse> {
    await this.ensureStorageWithClient(this.prisma);
    await this.cleanupExpiredWithClient(this.prisma);
    await this.assertAdminAccessByEmail(input.actorEmail);

    const page = this.resolvePage(input.page);
    const limit = this.resolveLimit(input.limit);
    const q = this.normalizeText(input.q);
    const searchToken = q ?? null;
    const likeToken = q ? `%${q}%` : null;
    const offset = (page - 1) * limit;

    const totalRows = await this.prisma.$queryRawUnsafe<RawTotalRow[]>(
      `
      SELECT COUNT(*) AS total
      FROM admin_audit_logs
      WHERE (
        ? IS NULL
        OR actor_name_snapshot LIKE ?
        OR actor_email_snapshot LIKE ?
        OR action_key LIKE ?
        OR action_label LIKE ?
        OR entity_type LIKE ?
        OR entity_label LIKE ?
        OR summary LIKE ?
      )
      `,
      searchToken,
      likeToken,
      likeToken,
      likeToken,
      likeToken,
      likeToken,
      likeToken,
      likeToken
    );
    const total = this.toSafeNumber(totalRows[0]?.total);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const rows = await this.prisma.$queryRawUnsafe<RawAuditLogRow[]>(
      `
      SELECT
        id,
        created_at,
        actor_user_id,
        actor_name_snapshot,
        actor_email_snapshot,
        action_key,
        action_label,
        entity_type,
        entity_id,
        entity_label,
        summary,
        metadata_json
      FROM admin_audit_logs
      WHERE (
        ? IS NULL
        OR actor_name_snapshot LIKE ?
        OR actor_email_snapshot LIKE ?
        OR action_key LIKE ?
        OR action_label LIKE ?
        OR entity_type LIKE ?
        OR entity_label LIKE ?
        OR summary LIKE ?
      )
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
      `,
      searchToken,
      likeToken,
      likeToken,
      likeToken,
      likeToken,
      likeToken,
      likeToken,
      likeToken,
      limit,
      offset
    );

    return {
      items: rows.map((row) => ({
        id: row.id,
        time: new Date(row.created_at).toISOString(),
        actor: {
          userId: this.normalizeText(row.actor_user_id),
          name: this.normalizeText(row.actor_name_snapshot),
          email: this.normalizeEmail(row.actor_email_snapshot)
        },
        action: {
          key: this.normalizeActionKey(row.action_key),
          label: this.normalizeText(row.action_label) ?? this.labelFromActionKey(row.action_key)
        },
        entity: {
          type: this.normalizeEntityType(row.entity_type),
          id: this.normalizeText(row.entity_id),
          label: this.normalizeText(row.entity_label)
        },
        summary: this.normalizeText(row.summary) ?? '',
        metadata: this.parseMetadataJson(row.metadata_json)
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    };
  }

  private async assertAdminAccessByEmail(actorEmail: string | null | undefined) {
    const email = this.normalizeEmail(actorEmail);
    if (!email) {
      throw new ForbiddenException('Admin access is required.');
    }

    const actorUser = await this.prisma.user.findUnique({
      where: {
        email
      },
      select: {
        id: true,
        status: true
      }
    });

    if (!actorUser || actorUser.status !== UserStatus.active) {
      throw new ForbiddenException('Admin access is required.');
    }

    const adminMembership = await this.prisma.brandMembership.findFirst({
      where: {
        userId: actorUser.id,
        role: BrandRole.admin,
      },
      select: {
        id: true
      }
    });

    if (adminMembership) {
      return;
    }

    const [isGlobalAdmin, isBootstrapSuperAdmin] = await Promise.all([
      this.isGlobalAdminUser(actorUser.id),
      this.isBootstrapSuperAdminUser(actorUser.id)
    ]);

    if (!isGlobalAdmin && !isBootstrapSuperAdmin) {
      throw new ForbiddenException('Admin access is required.');
    }
  }

  private async isGlobalAdminUser(userId: string) {
    try {
      const rows = await this.prisma.$queryRawUnsafe<RawUserIdRow[]>(
        `
        SELECT user_id
        FROM system_global_admin_users
        WHERE user_id = ?
        LIMIT 1
        `,
        userId
      );

      return rows.length > 0;
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (
        message.includes("doesn't exist") ||
        message.includes('no such table') ||
        message.includes('unknown table')
      ) {
        return false;
      }

      throw error;
    }
  }

  private async isBootstrapSuperAdminUser(userId: string) {
    try {
      const rows = await this.prisma.$queryRawUnsafe<RawUserIdRow[]>(
        `
        SELECT user_id
        FROM system_bootstrap_super_admin
        WHERE id = 1 AND user_id = ?
        LIMIT 1
        `,
        userId
      );

      return rows.length > 0;
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (
        message.includes("doesn't exist") ||
        message.includes('no such table') ||
        message.includes('unknown table')
      ) {
        return false;
      }

      throw error;
    }
  }

  private async resolveActorSnapshotWithClient(
    client: AuditLogClient,
    input: AppendAdminAuditLogInput
  ) {
    const providedUserId = this.normalizeText(input.actor?.userId);
    const providedName = this.normalizeText(input.actor?.actorName);
    const providedEmail = this.normalizeEmail(input.actor?.actorEmail);

    if (!providedUserId && !providedName && !providedEmail) {
      return {
        userId: null,
        name: null,
        email: null
      };
    }

    if (!providedEmail) {
      return {
        userId: providedUserId,
        name: providedName,
        email: null
      };
    }

    const actorUser = await client.user.findUnique({
      where: {
        email: providedEmail
      },
      select: {
        id: true,
        displayName: true,
        email: true
      }
    });

    if (!actorUser) {
      return {
        userId: providedUserId,
        name: providedName,
        email: providedEmail
      };
    }

    return {
      userId: providedUserId ?? actorUser.id,
      name: providedName ?? this.normalizeText(actorUser.displayName),
      email: providedEmail ?? this.normalizeEmail(actorUser.email)
    };
  }

  private async ensureStorageWithClient(client: AuditLogClient) {
    await client.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id VARCHAR(191) NOT NULL,
        actor_user_id VARCHAR(191) NULL,
        actor_name_snapshot VARCHAR(191) NULL,
        actor_email_snapshot VARCHAR(191) NULL,
        action_key VARCHAR(120) NOT NULL,
        action_label VARCHAR(191) NOT NULL,
        entity_type VARCHAR(40) NOT NULL,
        entity_id VARCHAR(191) NULL,
        entity_label VARCHAR(191) NULL,
        summary TEXT NOT NULL,
        metadata_json LONGTEXT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);

    await this.ensureIndexWithClient(
      client,
      'admin_audit_logs_created_at_idx',
      'CREATE INDEX admin_audit_logs_created_at_idx ON admin_audit_logs (created_at)'
    );
    await this.ensureIndexWithClient(
      client,
      'admin_audit_logs_entity_created_at_idx',
      'CREATE INDEX admin_audit_logs_entity_created_at_idx ON admin_audit_logs (entity_type, created_at)'
    );
    await this.ensureIndexWithClient(
      client,
      'admin_audit_logs_actor_created_at_idx',
      'CREATE INDEX admin_audit_logs_actor_created_at_idx ON admin_audit_logs (actor_user_id, created_at)'
    );
    await this.ensureIndexWithClient(
      client,
      'admin_audit_logs_action_created_at_idx',
      'CREATE INDEX admin_audit_logs_action_created_at_idx ON admin_audit_logs (action_key, created_at)'
    );
  }

  private async ensureIndexWithClient(
    client: AuditLogClient,
    indexName: string,
    createIndexSql: string
  ) {
    try {
      await client.$executeRawUnsafe(createIndexSql);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (message.includes('duplicate key name') || message.includes('already exists')) {
        return;
      }
      throw error;
    }
  }

  private async cleanupExpiredWithClient(client: AuditLogClient) {
    await client.$executeRawUnsafe(`
      DELETE FROM admin_audit_logs
      WHERE created_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ${this.retentionDays} DAY)
    `);
  }

  private normalizeText(value: string | null | undefined) {
    const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeEmail(value: string | null | undefined) {
    const normalized = this.normalizeText(value);
    return normalized ? normalized.toLowerCase() : null;
  }

  private normalizeActionKey(value: string | null | undefined) {
    const normalized = this.normalizeText(value);
    if (!normalized) {
      return '';
    }

    return normalized.toUpperCase().replace(/\s+/g, '_');
  }

  private normalizeEntityType(value: string | null | undefined): AdminAuditEntityType {
    const normalized = this.normalizeActionKey(value) as AdminAuditEntityType;
    if (
      normalized === 'USER' ||
      normalized === 'BRAND' ||
      normalized === 'REPORT' ||
      normalized === 'CONTENT'
    ) {
      return normalized;
    }

    return 'CONTENT';
  }

  private labelFromActionKey(actionKey: string) {
    return actionKey
      .toLowerCase()
      .split('_')
      .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
      .join(' ');
  }

  private stringifyMetadata(metadata: Record<string, unknown> | null | undefined) {
    if (!metadata || Object.keys(metadata).length === 0) {
      return null;
    }

    try {
      return JSON.stringify(metadata);
    } catch {
      return null;
    }
  }

  private parseMetadataJson(raw: string | null) {
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  private resolvePage(page: number | null | undefined) {
    if (!Number.isFinite(page) || Number(page) < 1) {
      return 1;
    }

    return Math.floor(Number(page));
  }

  private resolveLimit(limit: number | null | undefined) {
    if (!Number.isFinite(limit)) {
      return this.defaultLimit;
    }

    const candidate = Math.floor(Number(limit));
    if (!this.allowedLimits.has(candidate)) {
      return this.defaultLimit;
    }

    return candidate;
  }

  private toSafeNumber(value: bigint | number | string | null | undefined) {
    if (typeof value === 'bigint') {
      return Number(value);
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
  }
}
