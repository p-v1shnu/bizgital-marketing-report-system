import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  BrandDropdownFieldKey,
  BrandDropdownOptionStatus,
  ComputedColumnKey,
  MappingTargetField,
  Prisma,
  ReportWorkflowState
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import {
  parseManualSourceRowsSettingPayload,
  toManualSourceRowsSettingKey
} from '../dataset/manual-source-rows-setting';
import { readImportJobSnapshot } from '../imports/import-snapshot';
import type {
  ContentCountPolicyMode,
  ContentCountPolicyResponse,
  ComputedFormulaPreviewResponse,
  ComputedFormulaResponse,
  CreateImportColumnMappingDraftFromHeadersInput,
  CreateComputedFormulaInput,
  CreateGlobalCompanyFormatOptionInput,
  EngagementFormulaResponse,
  GlobalCompanyFormatOptionsResponse,
  ImportColumnMappingConfigResponse,
  ImportColumnMappingDraft,
  ImportColumnMappingRule,
  ImportColumnMappingVersion,
  ImportTableLayoutResponse,
  MetaColumnCatalogResponse,
  PublishImportColumnMappingInput,
  PreviewComputedFormulaInput,
  ReorderGlobalCompanyFormatOptionsInput,
  RollbackImportColumnMappingInput,
  TopContentDataSourcePolicyMode,
  TopContentDataSourcePolicyResponse,
  UpdateImportColumnMappingDraftInput,
  UpdateImportTableLayoutInput,
  UpdateComputedFormulaInput,
  UpdateContentCountPolicyInput,
  UpdateEngagementFormulaInput,
  UpdateGlobalCompanyFormatOptionInput,
  UpdateTopContentDataSourcePolicyInput
} from './column-config.types';
import { previewFormulaExpression } from './formula-engine';

const CONTENT_STYLE_DEFAULT_OPTIONS = [
  'Tips',
  'Memes',
  'Trending',
  'Special Day',
  'Tie-In',
  'Position',
  'Call-To-Engage',
  'Details',
  'Reviews',
  'Promotion',
  'Event',
  'Call-to-Action',
  'CRM'
];

const FIELD_DEFINITIONS: Array<{
  key: BrandDropdownFieldKey;
  label: string;
  defaultOptions: string[];
}> = [
  {
    key: BrandDropdownFieldKey.content_style,
    label: 'Content Style',
    defaultOptions: CONTENT_STYLE_DEFAULT_OPTIONS
  },
  {
    key: BrandDropdownFieldKey.media_format,
    label: 'Media Format',
    defaultOptions: ['Static', 'Album', 'Motion', 'Short Video', 'Long Video', 'Reels']
  },
  {
    key: BrandDropdownFieldKey.content_objective,
    label: 'Content Objective',
    defaultOptions: ['AWR', 'CON', 'ACT']
  }
];

const defaultEngagementFormula = {
  label: 'Engagement',
  sourceLabelA: 'Reactions, comments and shares',
  sourceLabelB: 'Total clicks'
};

const IMPORT_COLUMN_MAPPING_PUBLISHED_SETTING_KEY = 'import_column_mapping_published_v1';
const IMPORT_COLUMN_MAPPING_DRAFT_SETTING_KEY = 'import_column_mapping_draft_v1';
const IMPORT_COLUMN_MAPPING_HISTORY_SETTING_KEY = 'import_column_mapping_history_v1';
const IMPORT_COLUMN_MAPPING_HISTORY_LIMIT = 30;
const CONTENT_COUNT_POLICY_SETTING_KEY = 'content_count_policy_v1';
const TOP_CONTENT_DATA_SOURCE_POLICY_SETTING_KEY = 'top_content_data_source_policy_v1';
const DEFAULT_CONTENT_COUNT_POLICY_MODE: ContentCountPolicyMode = 'csv_only';
const DEFAULT_TOP_CONTENT_DATA_SOURCE_POLICY_MODE: TopContentDataSourcePolicyMode = 'csv_only';
const DEFAULT_POLICY_UPDATED_BY = 'system default';
const DEFAULT_TOP_CONTENT_EXCLUDED_CONTENT_STYLE_VALUE_KEYS = ['call-to-engage'];
const DEFAULT_IMPORT_TABLE_VISIBLE_SOURCE_COLUMN_LABELS = [
  '3-second video views',
  'Total clicks',
  'Reactions, comments and shares',
  'Reach',
  'Views',
  'Post type',
  'Permalink',
  'Publish time'
];

const IMPORT_MAPPING_TARGET_CATALOG: Array<{
  key: MappingTargetField;
  label: string;
  description: string;
}> = [
  {
    key: MappingTargetField.views,
    label: 'Views',
    description: 'System metric used in KPI, ranking, and report calculations.'
  },
  {
    key: MappingTargetField.video_views_3s,
    label: '3-second video views',
    description: 'Optional metric for short watch behavior.'
  }
];

const DEFAULT_IMPORT_MAPPING_RULES: ImportColumnMappingRule[] = [
  {
    targetField: MappingTargetField.views,
    baselineHeader: 'Views',
    displayLabel: 'Views',
    aliases: ['View count', 'Total views', 'Video views'],
    required: true
  },
  {
    targetField: MappingTargetField.video_views_3s,
    baselineHeader: '3-second video views',
    displayLabel: '3-second video views',
    aliases: ['3 second video views', '3s video views', 'Video views 3s'],
    required: false
  }
];

const EXTERNAL_IMPORT_MAPPING_TARGET_PREFIX = 'header:';

type RawComputedFormulaRow = {
  id: string;
  column_label: string;
  expression: string;
  is_active: number | boolean;
  created_at: Date;
  updated_at: Date;
};

type RawComputedFormulaLockRow = {
  formula_id: string;
  locked_by_report_version_id: string | null;
  locked_reason: string | null;
  locked_at: Date;
};

type TopContentDataSourcePolicySettingPayload = {
  mode?: unknown;
  updatedBy?: unknown;
  note?: unknown;
  excludedContentStyleValueKeys?: unknown;
};

type ContentCountPolicySettingPayload = {
  mode?: unknown;
  updatedBy?: unknown;
  note?: unknown;
};

function normalizeLabel(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function toValueKey(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'option';
}

@Injectable()
export class ColumnConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getGlobalCompanyFormatOptions(
    includeDeprecated = false
  ): Promise<GlobalCompanyFormatOptionsResponse> {
    await this.ensureGlobalCompanyFormatDefaults();

    const options = await this.prisma.globalCompanyFormatOption.findMany({
      where: includeDeprecated ? undefined : { status: BrandDropdownOptionStatus.active },
      orderBy: [{ fieldKey: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }]
    });

    return {
      fields: FIELD_DEFINITIONS.map(field => ({
        key: field.key,
        label: field.label,
        options: options
          .filter(option => option.fieldKey === field.key)
          .map(option => ({
            id: option.id,
            fieldKey: option.fieldKey,
            valueKey: option.valueKey,
            label: option.label,
            status: option.status,
            sortOrder: option.sortOrder
          }))
      }))
    };
  }

  async createGlobalCompanyFormatOption(input: CreateGlobalCompanyFormatOptionInput) {
    const fieldKey = this.resolveFieldKey(input.fieldKey);
    const label = normalizeLabel(input.label);

    if (!label) {
      throw new BadRequestException('Option label is required.');
    }

    await this.ensureGlobalCompanyFormatDefaults();

    const existing = await this.prisma.globalCompanyFormatOption.findMany({
      where: { fieldKey },
      orderBy: [{ sortOrder: 'desc' }]
    });
    const existingKeys = new Set(existing.map(item => item.valueKey));
    const baseValueKey = toValueKey(label);
    let valueKey = baseValueKey;
    let suffix = 2;

    while (existingKeys.has(valueKey)) {
      valueKey = `${baseValueKey}-${suffix}`;
      suffix += 1;
    }

    const created = await this.prisma.globalCompanyFormatOption.create({
      data: {
        fieldKey,
        valueKey,
        label,
        sortOrder: (existing[0]?.sortOrder ?? 0) + 1,
        status: BrandDropdownOptionStatus.active
      }
    });

    return {
      option: {
        id: created.id,
        fieldKey: created.fieldKey,
        valueKey: created.valueKey,
        label: created.label,
        status: created.status,
        sortOrder: created.sortOrder
      }
    };
  }

  async updateGlobalCompanyFormatOption(
    optionId: string,
    input: UpdateGlobalCompanyFormatOptionInput
  ) {
    const option = await this.prisma.globalCompanyFormatOption.findUnique({
      where: { id: optionId }
    });

    if (!option) {
      throw new BadRequestException('Global internal option was not found.');
    }

    const nextLabel =
      input.label !== undefined ? normalizeLabel(input.label) : undefined;
    const nextStatus =
      input.status !== undefined ? this.resolveStatus(input.status) : undefined;

    if (nextLabel !== undefined && !nextLabel) {
      throw new BadRequestException('Option label cannot be empty.');
    }

    if (nextLabel === undefined && nextStatus === undefined) {
      throw new BadRequestException('Provide label or status to update this option.');
    }

    const updated = await this.prisma.globalCompanyFormatOption.update({
      where: { id: option.id },
      data: {
        ...(nextLabel !== undefined ? { label: nextLabel } : {}),
        ...(nextStatus !== undefined ? { status: nextStatus } : {})
      }
    });

    return {
      option: {
        id: updated.id,
        fieldKey: updated.fieldKey,
        valueKey: updated.valueKey,
        label: updated.label,
        status: updated.status,
        sortOrder: updated.sortOrder
      }
    };
  }

  async reorderGlobalCompanyFormatOptions(input: ReorderGlobalCompanyFormatOptionsInput) {
    const fieldKey = this.resolveFieldKey(input.fieldKey);
    const requestedIds = Array.from(new Set(input.optionIds));

    if (requestedIds.length === 0) {
      throw new BadRequestException('Option order is required.');
    }

    const activeOptions = await this.prisma.globalCompanyFormatOption.findMany({
      where: {
        fieldKey,
        status: BrandDropdownOptionStatus.active
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    });

    if (activeOptions.length !== requestedIds.length) {
      throw new BadRequestException(
        'Reorder payload must include every active option in this field exactly once.'
      );
    }

    const activeIds = new Set(activeOptions.map(option => option.id));

    if (requestedIds.some(optionId => !activeIds.has(optionId))) {
      throw new BadRequestException('One or more options cannot be reordered for this field.');
    }

    await this.prisma.$transaction(
      requestedIds.map((optionId, index) =>
        this.prisma.globalCompanyFormatOption.update({
          where: { id: optionId },
          data: { sortOrder: index + 1 }
        })
      )
    );

    return this.getGlobalCompanyFormatOptions(true);
  }

  async deleteGlobalCompanyFormatOption(optionId: string) {
    const option = await this.prisma.globalCompanyFormatOption.findUnique({
      where: { id: optionId }
    });

    if (!option) {
      throw new NotFoundException('Global internal option was not found.');
    }

    const usedInApprovedReport = await this.isGlobalDropdownOptionUsedInApprovedReports(
      option.fieldKey,
      option.valueKey,
      option.label
    );

    if (usedInApprovedReport) {
      throw new ConflictException(
        `Cannot delete "${option.label}" because it is used in at least one approved report.`
      );
    }

    await this.prisma.$transaction(async tx => {
      await tx.globalCompanyFormatOption.delete({
        where: {
          id: option.id
        }
      });

      const remainingOptions = await tx.globalCompanyFormatOption.findMany({
        where: {
          fieldKey: option.fieldKey
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true
        }
      });

      for (const [index, remainingOption] of remainingOptions.entries()) {
        await tx.globalCompanyFormatOption.update({
          where: {
            id: remainingOption.id
          },
          data: {
            sortOrder: index + 1
          }
        });
      }
    });

    return {
      deleted: true
    };
  }

  async getEngagementFormula(): Promise<EngagementFormulaResponse> {
    const setting = await this.ensureEngagementFormulaSetting();

    return {
      key: 'engagement',
      label: setting.label,
      operation: setting.operation,
      sourceLabelA: setting.sourceLabelA,
      sourceLabelB: setting.sourceLabelB
    };
  }

  async updateEngagementFormula(input: UpdateEngagementFormulaInput) {
    const label =
      input.label !== undefined ? normalizeLabel(input.label) : defaultEngagementFormula.label;
    const sourceLabelA = normalizeLabel(input.sourceLabelA);
    const sourceLabelB = normalizeLabel(input.sourceLabelB);

    if (!label || !sourceLabelA || !sourceLabelB) {
      throw new BadRequestException('Label and both source labels are required.');
    }

    const updated = await this.prisma.globalComputedColumnSetting.upsert({
      where: { key: ComputedColumnKey.engagement },
      update: {
        label,
        sourceLabelA,
        sourceLabelB
      },
      create: {
        key: ComputedColumnKey.engagement,
        label,
        operation: 'sum',
        sourceLabelA,
        sourceLabelB
      }
    });
    await this.ensureSystemEngagementFormulaRecord(updated);

    return {
      key: 'engagement' as const,
      label: updated.label,
      operation: updated.operation,
      sourceLabelA: updated.sourceLabelA,
      sourceLabelB: updated.sourceLabelB
    };
  }

  async getMetaColumnCatalog(limit = 120): Promise<MetaColumnCatalogResponse> {
    const latestProfiles = await this.readLatestImportColumnProfiles();

    await this.ensureUiSettingsStorage();
    const [draftMapping, publishedMapping] = await Promise.all([
      this.readImportColumnMappingDraft(),
      this.readImportColumnMappingPublished()
    ]);

    const deduped = new Map<
      string,
      {
        label: string;
        sampleValue: string | null;
        lastSeenAt: string;
      }
    >();
    const upsertCandidate = (
      labelCandidate: string | null | undefined,
      sampleValue: string | null,
      lastSeenAt: string
    ) => {
      const normalizedLabel = normalizeLabel(String(labelCandidate ?? ''));
      if (!normalizedLabel || deduped.has(normalizedLabel)) {
        return;
      }

      deduped.set(normalizedLabel, {
        label: String(labelCandidate ?? ''),
        sampleValue,
        lastSeenAt
      });
    };

    for (const profile of latestProfiles) {
      upsertCandidate(
        profile.sourceColumnName,
        profile.sampleValue,
        profile.updatedAt.toISOString()
      );
    }

    const appendRuleHeaders = (
      rules: ImportColumnMappingRule[],
      lastSeenAt: string
    ) => {
      for (const rule of this.sanitizeImportColumnMappingRules(rules)) {
        upsertCandidate(rule.baselineHeader, null, lastSeenAt);
      }
    };

    if (draftMapping) {
      for (const header of draftMapping.uploadedHeaders) {
        upsertCandidate(header, null, draftMapping.updatedAt);
      }

      appendRuleHeaders(draftMapping.rules, draftMapping.updatedAt);
    }

    if (publishedMapping) {
      appendRuleHeaders(publishedMapping.rules, publishedMapping.publishedAt);
    }

    return {
      columns: Array.from(deduped.values()).slice(0, limit)
    };
  }

  async listComputedFormulas(activeOnly = false): Promise<{ items: ComputedFormulaResponse[] }> {
    await this.ensureFormulaStorage();
    await this.ensureFormulaLockStorage();

    const rows = await this.prisma.$queryRawUnsafe<RawComputedFormulaRow[]>(
      `
      SELECT
        id,
        column_label,
        expression,
        is_active,
        created_at,
        updated_at
      FROM global_computed_formulas
      ${activeOnly ? 'WHERE is_active = 1' : ''}
      ORDER BY created_at DESC
      `
    );

    const catalog = await this.getMetaColumnCatalog();
    const sampleRow = Object.fromEntries(
      catalog.columns.map(column => [column.label, column.sampleValue])
    );
    const availableColumns = catalog.columns.map(column => column.label);
    const deleteGuards = await this.resolveFormulaDeleteGuards(rows);

    return {
      items: rows.map(row => {
        const preview = previewFormulaExpression({
          expression: row.expression,
          row: sampleRow,
          availableColumns
        });

        return this.toComputedFormulaResponse(
          row,
          preview,
          deleteGuards.get(row.id) ?? {
            canDelete: true,
            reason: null,
            lockedByReportVersionId: null,
            lockedAt: null
          }
        );
      })
    };
  }

  async createComputedFormula(input: CreateComputedFormulaInput) {
    await this.ensureFormulaStorage();

    const columnLabel = normalizeLabel(input.columnLabel);
    const expression = String(input.expression ?? '').trim();
    const isActive = !!input.isActive;

    if (!columnLabel || !expression) {
      throw new BadRequestException('Column label and expression are required.');
    }

    const preview = await this.previewComputedFormula({ expression });
    if (isActive && !preview.isValid) {
      throw new BadRequestException(
        `Formula cannot be activated: ${preview.issues.map(issue => issue.message).join(' ')}`
      );
    }

    const id = randomUUID();
    await this.prisma.$executeRawUnsafe(
      `
      INSERT INTO global_computed_formulas (
        id,
        column_label,
        expression,
        is_active
      ) VALUES (?, ?, ?, ?)
      `,
      id,
      columnLabel,
      expression,
      isActive ? 1 : 0
    );

    return this.getComputedFormulaById(id);
  }

  async updateComputedFormula(formulaId: string, input: UpdateComputedFormulaInput) {
    await this.ensureFormulaStorage();
    const existing = await this.getRawComputedFormulaById(formulaId);

    if (!existing) {
      throw new BadRequestException('Computed formula was not found.');
    }

    const nextLabel =
      input.columnLabel !== undefined
        ? normalizeLabel(input.columnLabel)
        : existing.column_label;
    const nextExpression =
      input.expression !== undefined
        ? String(input.expression).trim()
        : existing.expression;
    const nextActive =
      input.isActive !== undefined ? input.isActive : !!existing.is_active;

    if (!nextLabel || !nextExpression) {
      throw new BadRequestException('Column label and expression cannot be empty.');
    }

    const preview = await this.previewComputedFormula({
      expression: nextExpression
    });

    if (nextActive && !preview.isValid) {
      throw new BadRequestException(
        `Formula cannot be activated: ${preview.issues.map(issue => issue.message).join(' ')}`
      );
    }

    await this.prisma.$executeRawUnsafe(
      `
      UPDATE global_computed_formulas
      SET
        column_label = ?,
        expression = ?,
        is_active = ?,
        updated_at = CURRENT_TIMESTAMP(3)
      WHERE id = ?
      `,
      nextLabel,
      nextExpression,
      nextActive ? 1 : 0,
      formulaId
    );

    return this.getComputedFormulaById(formulaId);
  }

  async deleteComputedFormula(formulaId: string) {
    await this.ensureFormulaStorage();
    await this.ensureFormulaLockStorage();
    const existing = await this.getRawComputedFormulaById(formulaId);

    if (!existing) {
      throw new BadRequestException('Computed formula was not found.');
    }
    if (await this.isSystemEngagementFormula(existing)) {
      throw new BadRequestException(
        'System Engagement formula cannot be deleted. Update source labels from Engagement settings instead.'
      );
    }

    const guard = await this.resolveDeleteGuardForFormula(existing);
    if (!guard.canDelete) {
      throw new BadRequestException(guard.reason ?? 'This formula cannot be deleted.');
    }

    await this.prisma.$executeRawUnsafe(
      `
      DELETE FROM global_computed_formula_locks
      WHERE formula_id = ?
      `,
      formulaId
    );

    await this.prisma.$executeRawUnsafe(
      `
      DELETE FROM global_computed_formulas
      WHERE id = ?
      `,
      formulaId
    );

    return {
      deleted: true
    };
  }

  async previewComputedFormula(input: PreviewComputedFormulaInput) {
    await this.ensureFormulaStorage();
    const catalog = await this.getMetaColumnCatalog();

    const sampleRow = input.sample
      ? {
          ...Object.fromEntries(catalog.columns.map(column => [column.label, column.sampleValue])),
          ...input.sample
        }
      : Object.fromEntries(
          catalog.columns.map(column => [column.label, column.sampleValue])
        );

    const availableColumns = Array.from(
      new Set([
        ...catalog.columns.map(column => column.label),
        ...Object.keys(sampleRow)
      ])
    );

    return previewFormulaExpression({
      expression: input.expression,
      row: sampleRow,
      availableColumns
    });
  }

  async getImportTableLayout(): Promise<ImportTableLayoutResponse> {
    await this.ensureUiSettingsStorage();
    const rows = await this.prisma.$queryRawUnsafe<Array<{ value_json: string }>>(
      `
      SELECT value_json
      FROM global_ui_settings
      WHERE setting_key = 'import_table_layout'
      LIMIT 1
      `
    );
    const raw = rows[0]?.value_json ?? null;

    if (!raw) {
      return {
        visibleSourceColumnLabels: [...DEFAULT_IMPORT_TABLE_VISIBLE_SOURCE_COLUMN_LABELS]
      };
    }

    try {
      const parsed = JSON.parse(raw) as { visibleSourceColumnLabels?: unknown };
      const labels = Array.isArray(parsed.visibleSourceColumnLabels)
        ? parsed.visibleSourceColumnLabels
            .map(item => normalizeLabel(String(item)))
            .filter(label => !!label)
        : [];

      return {
        visibleSourceColumnLabels: Array.from(new Set(labels))
      };
    } catch {
      return {
        visibleSourceColumnLabels: [...DEFAULT_IMPORT_TABLE_VISIBLE_SOURCE_COLUMN_LABELS]
      };
    }
  }

  async updateImportTableLayout(input: UpdateImportTableLayoutInput) {
    await this.ensureUiSettingsStorage();
    const normalizedLabels = Array.from(
      new Set(
        (input.visibleSourceColumnLabels ?? [])
          .map(label => normalizeLabel(String(label)))
          .filter(label => !!label)
      )
    );
    const payload = JSON.stringify({
      visibleSourceColumnLabels: normalizedLabels
    });

    await this.prisma.$executeRawUnsafe(
      `
      INSERT INTO global_ui_settings (
        setting_key,
        value_json
      ) VALUES ('import_table_layout', ?)
      ON DUPLICATE KEY UPDATE
        value_json = VALUES(value_json),
        updated_at = CURRENT_TIMESTAMP(3)
      `,
      payload
    );

    return {
      visibleSourceColumnLabels: normalizedLabels
    };
  }

  async getContentCountPolicy(): Promise<ContentCountPolicyResponse> {
    await this.ensureUiSettingsStorage();
    const setting = await this.prisma.globalUiSetting.findUnique({
      where: {
        settingKey: CONTENT_COUNT_POLICY_SETTING_KEY
      }
    });
    const parsed = this.parseContentCountPolicyPayload(setting?.valueJson ?? null);
    const mode = this.resolveContentCountPolicyMode(parsed?.mode);

    return {
      mode,
      label: this.toContentCountPolicyLabel(mode),
      excludeManualRows: mode === 'csv_only',
      updatedAt: setting?.updatedAt ? setting.updatedAt.toISOString() : null,
      updatedBy: parsed?.updatedBy ?? DEFAULT_POLICY_UPDATED_BY,
      note: parsed?.note ?? null
    };
  }

  async updateContentCountPolicy(input: UpdateContentCountPolicyInput) {
    await this.ensureUiSettingsStorage();
    if (input.mode !== 'csv_only' && input.mode !== 'csv_and_manual') {
      throw new BadRequestException('Content count policy mode is invalid.');
    }

    const mode = input.mode;
    const note = normalizeLabel(String(input.note ?? '')) || null;
    const updatedBy = normalizeLabel(String(input.actorEmail ?? '')) || null;
    const currentPolicy = await this.getContentCountPolicy();

    if (
      mode === 'csv_and_manual' &&
      currentPolicy.mode !== 'csv_and_manual' &&
      !note
    ) {
      throw new BadRequestException(
        'Change note is required when enabling manual rows in Content count policy.'
      );
    }

    await this.writeUiSettingJson(CONTENT_COUNT_POLICY_SETTING_KEY, {
      mode,
      updatedBy,
      note
    });

    return this.getContentCountPolicy();
  }

  async getTopContentDataSourcePolicy(): Promise<TopContentDataSourcePolicyResponse> {
    await this.ensureGlobalCompanyFormatDefaults();
    await this.ensureUiSettingsStorage();
    const contentStyleOptions = await this.prisma.globalCompanyFormatOption.findMany({
      where: {
        fieldKey: BrandDropdownFieldKey.content_style
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    });
    const setting = await this.prisma.globalUiSetting.findUnique({
      where: {
        settingKey: TOP_CONTENT_DATA_SOURCE_POLICY_SETTING_KEY
      }
    });
    const parsed = this.parseTopContentPolicyPayload(setting?.valueJson ?? null);
    const mode = this.resolveTopContentDataSourcePolicyMode(parsed?.mode);
    const optionMap = new Map(
      contentStyleOptions.map(option => [
        option.valueKey,
        {
          label: option.label,
          status: option.status
        }
      ])
    );
    const excludedContentStyleValueKeys = this.resolveExcludedContentStyleValueKeys(
      parsed
        ? parsed.excludedContentStyleValueKeys
        : DEFAULT_TOP_CONTENT_EXCLUDED_CONTENT_STYLE_VALUE_KEYS,
      optionMap
    );
    const excludedContentStyleLabels = excludedContentStyleValueKeys.map(
      valueKey => optionMap.get(valueKey)?.label ?? valueKey
    );

    return {
      mode,
      label: this.toTopContentDataSourcePolicyLabel(mode),
      excludeManualRows: mode === 'csv_only',
      excludedContentStyleValueKeys,
      excludedContentStyleLabels,
      contentStyleOptions: contentStyleOptions.map(option => ({
        valueKey: option.valueKey,
        label: option.label,
        status: option.status
      })),
      updatedAt: setting?.updatedAt ? setting.updatedAt.toISOString() : null,
      updatedBy: parsed?.updatedBy ?? DEFAULT_POLICY_UPDATED_BY,
      note: parsed?.note ?? null
    };
  }

  async updateTopContentDataSourcePolicy(input: UpdateTopContentDataSourcePolicyInput) {
    await this.ensureGlobalCompanyFormatDefaults();
    await this.ensureUiSettingsStorage();
    if (input.mode !== 'csv_only' && input.mode !== 'csv_and_manual') {
      throw new BadRequestException('Top Content data source mode is invalid.');
    }

    const mode = input.mode;
    const note = normalizeLabel(String(input.note ?? '')) || null;
    const updatedBy = normalizeLabel(String(input.actorEmail ?? '')) || null;
    const currentPolicy = await this.getTopContentDataSourcePolicy();

    if (
      mode === 'csv_and_manual' &&
      currentPolicy.mode !== 'csv_and_manual' &&
      !note
    ) {
      throw new BadRequestException(
        'Change note is required when enabling manual rows in Top Content policy.'
      );
    }

    const contentStyleOptions = await this.prisma.globalCompanyFormatOption.findMany({
      where: {
        fieldKey: BrandDropdownFieldKey.content_style
      },
      select: {
        valueKey: true,
        label: true,
        status: true
      }
    });
    const contentStyleOptionMap = new Map(
      contentStyleOptions.map(option => [option.valueKey, option])
    );
    const excludedContentStyleValueKeys = this.resolveExcludedContentStyleValueKeys(
      input.excludedContentStyleValueKeys ?? [],
      contentStyleOptionMap
    );

    await this.writeUiSettingJson(TOP_CONTENT_DATA_SOURCE_POLICY_SETTING_KEY, {
      mode,
      updatedBy,
      note,
      excludedContentStyleValueKeys
    });

    return this.getTopContentDataSourcePolicy();
  }

  async getImportColumnMappingConfig(): Promise<ImportColumnMappingConfigResponse> {
    await this.ensureUiSettingsStorage();
    const published = await this.readImportColumnMappingPublished();
    const draft = await this.readImportColumnMappingDraft();
    const history = await this.readImportColumnMappingHistory();

    return {
      targetCatalog: IMPORT_MAPPING_TARGET_CATALOG,
      published: published
        ? {
            ...published,
            rules: this.sanitizeImportColumnMappingRules(published.rules)
          }
        : null,
      draft,
      history
    };
  }

  async createImportColumnMappingDraftFromHeaders(
    input: CreateImportColumnMappingDraftFromHeadersInput
  ) {
    await this.ensureUiSettingsStorage();
    const normalizedHeaders = (input.headers ?? [])
      .map((header) => normalizeLabel(String(header)))
      .filter((header) => !!header);
    const headers = Array.from(
      new Set(normalizedHeaders)
    );

    if (headers.length === 0) {
      throw new BadRequestException('CSV header row is required to create mapping draft.');
    }

    const published = await this.readImportColumnMappingPublished();
    const sanitizedPublishedRules = this.sanitizeImportColumnMappingRules(
      published?.rules ?? []
    );
    const publishedRuleByTarget = new Map(
      sanitizedPublishedRules.map((rule) => [rule.targetField, rule])
    );
    const publishedRuleByHeaderKey = new Map<string, ImportColumnMappingRule>();

    for (const rule of sanitizedPublishedRules) {
      const candidates = [rule.baselineHeader, ...rule.aliases]
        .map((value) => this.normalizeHeaderKey(value))
        .filter((value) => !!value);

      for (const candidate of candidates) {
        if (!publishedRuleByHeaderKey.has(candidate)) {
          publishedRuleByHeaderKey.set(candidate, rule);
        }
      }
    }

    const rules: ImportColumnMappingRule[] = [];
    const usedTargetFields = new Set<string>();
    const includeRule = (rule: ImportColumnMappingRule) => {
      if (usedTargetFields.has(rule.targetField)) {
        return;
      }

      usedTargetFields.add(rule.targetField);
      rules.push(rule);
    };
    const alignRuleToMatchedHeader = (
      baseRule: ImportColumnMappingRule,
      matchedHeader: string | null
    ): ImportColumnMappingRule => {
      if (!matchedHeader) {
        return baseRule;
      }

      if (
        this.normalizeHeaderKey(baseRule.baselineHeader) === this.normalizeHeaderKey(matchedHeader)
      ) {
        return baseRule;
      }

      return {
        ...baseRule,
        baselineHeader: matchedHeader,
        displayLabel:
          this.normalizeHeaderKey(baseRule.displayLabel) ===
          this.normalizeHeaderKey(baseRule.baselineHeader)
            ? matchedHeader
            : baseRule.displayLabel,
        aliases: Array.from(
          new Set(
            [baseRule.baselineHeader, ...baseRule.aliases].filter(
              (alias) =>
                this.normalizeHeaderKey(alias) !== this.normalizeHeaderKey(matchedHeader)
            )
          )
        )
      };
    };

    for (const target of IMPORT_MAPPING_TARGET_CATALOG) {
      const baseRule =
        publishedRuleByTarget.get(target.key) ??
        DEFAULT_IMPORT_MAPPING_RULES.find((rule) => rule.targetField === target.key)!;
      const matchedHeader =
        headers.find((header) =>
          [baseRule.baselineHeader, ...baseRule.aliases].some(
            (candidate) =>
              this.normalizeHeaderKey(candidate) === this.normalizeHeaderKey(header)
          )
        ) ?? null;

      includeRule(alignRuleToMatchedHeader(baseRule, matchedHeader));
    }

    for (const header of headers) {
      const normalizedHeader = this.normalizeHeaderKey(header);
      const matchedRule = publishedRuleByHeaderKey.get(normalizedHeader) ?? null;

      if (matchedRule) {
        includeRule(alignRuleToMatchedHeader(matchedRule, header));
        continue;
      }

      let targetField = `${EXTERNAL_IMPORT_MAPPING_TARGET_PREFIX}${toValueKey(header)}`;
      let suffix = 2;
      while (usedTargetFields.has(targetField)) {
        targetField = `${EXTERNAL_IMPORT_MAPPING_TARGET_PREFIX}${toValueKey(header)}-${suffix}`;
        suffix += 1;
      }

      includeRule({
        targetField,
        baselineHeader: header,
        displayLabel: header,
        aliases: [],
        required: false
      });
    }

    for (const rule of sanitizedPublishedRules) {
      if (!this.isCanonicalImportMappingTargetField(rule.targetField)) {
        includeRule(rule);
      }
    }

    const draft: ImportColumnMappingDraft = {
      sourceFilename:
        input.sourceFilename !== undefined ? normalizeLabel(String(input.sourceFilename)) : null,
      uploadedHeaderCount: normalizedHeaders.length,
      uploadedHeaders: headers,
      updatedAt: new Date().toISOString(),
      updatedBy:
        input.actorEmail !== undefined ? normalizeLabel(String(input.actorEmail)) : null,
      rules: this.sanitizeImportColumnMappingRules(rules)
    };

    await this.writeUiSettingJson(IMPORT_COLUMN_MAPPING_DRAFT_SETTING_KEY, draft);

    return this.getImportColumnMappingConfig();
  }

  async updateImportColumnMappingDraft(input: UpdateImportColumnMappingDraftInput) {
    await this.ensureUiSettingsStorage();
    if (!Array.isArray(input.rules) || input.rules.length === 0) {
      throw new BadRequestException('At least one import mapping rule is required.');
    }

    const currentDraft = await this.readImportColumnMappingDraft();
    const uploadedHeaders = Array.from(
      new Set(
        (input.uploadedHeaders ?? currentDraft?.uploadedHeaders ?? [])
          .map((header) => normalizeLabel(String(header)))
          .filter((header) => !!header)
      )
    );
    const uploadedHeaderCount =
      currentDraft?.uploadedHeaderCount && currentDraft.uploadedHeaderCount > 0
        ? currentDraft.uploadedHeaderCount
        : uploadedHeaders.length;

    const draft: ImportColumnMappingDraft = {
      sourceFilename:
        input.sourceFilename !== undefined
          ? normalizeLabel(String(input.sourceFilename))
          : currentDraft?.sourceFilename ?? null,
      uploadedHeaderCount,
      uploadedHeaders,
      updatedAt: new Date().toISOString(),
      updatedBy:
        input.actorEmail !== undefined
          ? normalizeLabel(String(input.actorEmail))
          : currentDraft?.updatedBy ?? null,
      rules: this.sanitizeImportColumnMappingRules(input.rules)
    };

    await this.writeUiSettingJson(IMPORT_COLUMN_MAPPING_DRAFT_SETTING_KEY, draft);

    return this.getImportColumnMappingConfig();
  }

  async discardImportColumnMappingDraft() {
    await this.ensureUiSettingsStorage();
    await this.deleteUiSetting(IMPORT_COLUMN_MAPPING_DRAFT_SETTING_KEY);
    return this.getImportColumnMappingConfig();
  }

  async publishImportColumnMapping(input: PublishImportColumnMappingInput) {
    await this.ensureUiSettingsStorage();
    const draft = await this.readImportColumnMappingDraft();

    if (!draft) {
      throw new BadRequestException('Draft mapping was not found.');
    }

    const version: ImportColumnMappingVersion = {
      versionId: randomUUID(),
      sourceFilename: draft.sourceFilename,
      publishedAt: new Date().toISOString(),
      publishedBy:
        input.actorEmail !== undefined ? normalizeLabel(String(input.actorEmail)) : null,
      note: input.note !== undefined ? normalizeLabel(String(input.note)) : null,
      rules: this.sanitizeImportColumnMappingRules(draft.rules)
    };

    await this.writeUiSettingJson(IMPORT_COLUMN_MAPPING_PUBLISHED_SETTING_KEY, version);

    const nextHistory = [
      version,
      ...(await this.readImportColumnMappingHistory())
    ].slice(0, IMPORT_COLUMN_MAPPING_HISTORY_LIMIT);
    await this.writeUiSettingJson(IMPORT_COLUMN_MAPPING_HISTORY_SETTING_KEY, nextHistory);
    await this.deleteUiSetting(IMPORT_COLUMN_MAPPING_DRAFT_SETTING_KEY);

    return this.getImportColumnMappingConfig();
  }

  async rollbackImportColumnMapping(input: RollbackImportColumnMappingInput) {
    await this.ensureUiSettingsStorage();
    const history = await this.readImportColumnMappingHistory();
    const versionToRollback =
      history.find((item) => item.versionId === input.versionId) ?? null;

    if (!versionToRollback) {
      throw new BadRequestException('Requested mapping version was not found.');
    }

    const rollbackVersion: ImportColumnMappingVersion = {
      versionId: randomUUID(),
      sourceFilename: versionToRollback.sourceFilename,
      publishedAt: new Date().toISOString(),
      publishedBy:
        input.actorEmail !== undefined ? normalizeLabel(String(input.actorEmail)) : null,
      note:
        input.note !== undefined
          ? normalizeLabel(String(input.note))
          : `Rollback from ${versionToRollback.versionId}`,
      rules: this.sanitizeImportColumnMappingRules(versionToRollback.rules)
    };

    await this.writeUiSettingJson(
      IMPORT_COLUMN_MAPPING_PUBLISHED_SETTING_KEY,
      rollbackVersion
    );

    const nextHistory = [rollbackVersion, ...history].slice(
      0,
      IMPORT_COLUMN_MAPPING_HISTORY_LIMIT
    );
    await this.writeUiSettingJson(IMPORT_COLUMN_MAPPING_HISTORY_SETTING_KEY, nextHistory);
    await this.deleteUiSetting(IMPORT_COLUMN_MAPPING_DRAFT_SETTING_KEY);

    return this.getImportColumnMappingConfig();
  }

  async getPublishedImportColumnMappingRules(): Promise<ImportColumnMappingRule[]> {
    const published = await this.readImportColumnMappingPublished();
    if (!published) {
      return [];
    }

    return this.sanitizeImportColumnMappingRules(published.rules).filter((rule) =>
      this.isCanonicalImportMappingTargetField(rule.targetField)
    );
  }

  async getPublishedImportColumnHeaderRules(): Promise<ImportColumnMappingRule[]> {
    const published = await this.readImportColumnMappingPublished();
    if (!published) {
      return [];
    }

    return this.sanitizeImportColumnMappingRules(published.rules);
  }

  async getPublishedImportColumnDisplayLabelLookup() {
    const rules = await this.getPublishedImportColumnHeaderRules();
    const lookup = new Map<string, string>();

    for (const rule of rules) {
      const displayLabel = normalizeLabel(rule.displayLabel || rule.baselineHeader);
      if (!displayLabel) {
        continue;
      }

      const candidates = Array.from(
        new Set(
          [rule.baselineHeader, rule.displayLabel, ...rule.aliases]
            .map((candidate) => normalizeLabel(String(candidate ?? '')))
            .filter((candidate) => !!candidate)
        )
      );

      for (const candidate of candidates) {
        const key = this.normalizeHeaderKey(candidate);
        if (!key || lookup.has(key)) {
          continue;
        }
        lookup.set(key, displayLabel);
      }
    }

    return lookup;
  }

  resolveImportColumnDisplayLabel(
    sourceLabel: string | null | undefined,
    lookup: Map<string, string> | null | undefined
  ) {
    const normalizedLabel = normalizeLabel(String(sourceLabel ?? ''));
    if (!normalizedLabel) {
      return '';
    }

    const key = this.normalizeHeaderKey(normalizedLabel);
    return lookup?.get(key) ?? normalizedLabel;
  }

  async lockActiveFormulasForApprovedVersion(reportVersionId: string) {
    await this.ensureFormulaStorage();
    await this.ensureFormulaLockStorage();

    await this.prisma.$executeRawUnsafe(
      `
      INSERT INTO global_computed_formula_locks (
        formula_id,
        locked_by_report_version_id,
        locked_reason
      )
      SELECT
        id AS formula_id,
        ? AS locked_by_report_version_id,
        'Formula was active when a report version was approved.' AS locked_reason
      FROM global_computed_formulas
      WHERE is_active = 1
      ON DUPLICATE KEY UPDATE
        formula_id = formula_id
      `,
      reportVersionId
    );
  }

  private async getComputedFormulaById(formulaId: string) {
    const row = await this.getRawComputedFormulaById(formulaId);

    if (!row) {
      throw new BadRequestException('Computed formula was not found.');
    }

    const preview = await this.previewComputedFormula({
      expression: row.expression
    });
    const guard = await this.resolveDeleteGuardForFormula(row);

    return this.toComputedFormulaResponse(row, preview, guard);
  }

  private async getRawComputedFormulaById(formulaId: string) {
    const rows = await this.prisma.$queryRawUnsafe<RawComputedFormulaRow[]>(
      `
      SELECT
        id,
        column_label,
        expression,
        is_active,
        created_at,
        updated_at
      FROM global_computed_formulas
      WHERE id = ?
      LIMIT 1
      `,
      formulaId
    );

    return rows[0] ?? null;
  }

  private toComputedFormulaResponse(
    row: RawComputedFormulaRow,
    preview: ComputedFormulaPreviewResponse,
    guard: {
      canDelete: boolean;
      reason: string | null;
      lockedByReportVersionId: string | null;
      lockedAt: string | null;
    }
  ): ComputedFormulaResponse {
    return {
      id: row.id,
      columnLabel: row.column_label,
      expression: row.expression,
      isActive: !!row.is_active,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      deleteGuard: guard,
      preview
    };
  }

  private async ensureFormulaStorage() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS global_computed_formulas (
        id VARCHAR(191) NOT NULL,
        column_label VARCHAR(255) NOT NULL,
        expression TEXT NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        INDEX global_computed_formulas_is_active_created_at_idx (is_active, created_at)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
    await this.ensureFormulaStorageColumn(
      'is_active',
      'TINYINT(1) NOT NULL DEFAULT 0',
      'expression'
    );
    await this.ensureFormulaStorageColumn(
      'created_at',
      'DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)',
      'is_active'
    );
    await this.ensureFormulaStorageColumn(
      'updated_at',
      'DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)',
      'created_at'
    );
    const setting = await this.ensureEngagementFormulaSetting();
    await this.ensureSystemEngagementFormulaRecord(setting);
  }

  private async ensureComputedColumnSettingsStorage() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS global_computed_column_settings (
        id VARCHAR(191) NOT NULL,
        \`key\` VARCHAR(191) NOT NULL,
        label VARCHAR(255) NOT NULL,
        operation VARCHAR(32) NOT NULL DEFAULT 'sum',
        source_label_a VARCHAR(255) NOT NULL,
        source_label_b VARCHAR(255) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY global_computed_column_settings_key_unique (\`key\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
    await this.ensureComputedColumnSettingsStorageColumn(
      'operation',
      "VARCHAR(32) NOT NULL DEFAULT 'sum'",
      'label'
    );
    await this.ensureComputedColumnSettingsStorageColumn(
      'source_label_a',
      'VARCHAR(255) NOT NULL',
      'operation'
    );
    await this.ensureComputedColumnSettingsStorageColumn(
      'source_label_b',
      'VARCHAR(255) NOT NULL',
      'source_label_a'
    );
  }

  private async ensureFormulaLockStorage() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS global_computed_formula_locks (
        formula_id VARCHAR(191) NOT NULL,
        locked_by_report_version_id VARCHAR(191) NULL,
        locked_reason TEXT NULL,
        locked_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (formula_id),
        INDEX global_computed_formula_locks_locked_by_report_version_id_idx (locked_by_report_version_id)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
  }

  private async ensureUiSettingsStorage() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS global_ui_settings (
        setting_key VARCHAR(191) NOT NULL,
        value_json LONGTEXT NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (setting_key)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
  }

  private async resolveFormulaDeleteGuards(rows: RawComputedFormulaRow[]) {
    if (rows.length === 0) {
      return new Map<
        string,
        {
          canDelete: boolean;
          reason: string | null;
          lockedByReportVersionId: string | null;
          lockedAt: string | null;
        }
      >();
    }

    const guards = await Promise.all(
      rows.map(async row => [row.id, await this.resolveDeleteGuardForFormula(row)] as const)
    );

    return new Map(guards);
  }

  private async resolveDeleteGuardForFormula(row: RawComputedFormulaRow) {
    await this.ensureFormulaLockStorage();

    const lockRows = await this.prisma.$queryRawUnsafe<RawComputedFormulaLockRow[]>(
      `
      SELECT
        formula_id,
        locked_by_report_version_id,
        locked_reason,
        locked_at
      FROM global_computed_formula_locks
      WHERE formula_id = ?
      LIMIT 1
      `,
      row.id
    );
    const lock = lockRows[0] ?? null;

    if (lock) {
      return {
        canDelete: false,
        reason:
          lock.locked_reason ??
          'This formula is locked because it is tied to an approved report.',
        lockedByReportVersionId: lock.locked_by_report_version_id,
        lockedAt: lock.locked_at.toISOString()
      };
    }

    const approvedRows = await this.prisma.reportVersion
      .findFirst({
        where: {
          workflowState: ReportWorkflowState.approved,
          approvedAt: {
            not: null
          }
        },
        orderBy: {
          approvedAt: 'desc'
        },
        select: {
          id: true,
          approvedAt: true
        }
      })
      .catch((error) => {
        if (this.isMissingTableError(error)) {
          // Fresh install fallback before full schema sync.
          return null;
        }

        throw error;
      });

    if (
      approvedRows?.approvedAt &&
      new Date(row.updated_at).getTime() <= approvedRows.approvedAt.getTime()
    ) {
      return {
        canDelete: false,
        reason:
          'This formula cannot be deleted because approved reports already exist while this formula definition was in use.',
        lockedByReportVersionId: approvedRows.id,
        lockedAt: approvedRows.approvedAt.toISOString()
      };
    }

    return {
      canDelete: true,
      reason: null,
      lockedByReportVersionId: null,
      lockedAt: null
    };
  }

  private async ensureGlobalCompanyFormatDefaults() {
    const existing = await this.prisma.globalCompanyFormatOption.groupBy({
      by: ['fieldKey']
    });

    const existingFieldKeys = new Set(existing.map(item => item.fieldKey));
    const createPayload = FIELD_DEFINITIONS.flatMap(field => {
      if (existingFieldKeys.has(field.key)) {
        return [];
      }

      return field.defaultOptions.map((label, index) => ({
        fieldKey: field.key,
        valueKey: toValueKey(label),
        label,
        sortOrder: index + 1,
        status: BrandDropdownOptionStatus.active
      }));
    });

    if (createPayload.length > 0) {
      await this.prisma.globalCompanyFormatOption.createMany({
        data: createPayload
      });
    }
  }

  private async isGlobalDropdownOptionUsedInApprovedReports(
    fieldKey: BrandDropdownFieldKey,
    optionValueKey: string,
    optionLabel: string
  ) {
    const approvedVersions = await this.prisma.reportVersion.findMany({
      where: {
        workflowState: ReportWorkflowState.approved
      },
      select: {
        id: true,
        importJobs: {
          select: {
            snapshotSourceType: true,
            snapshotSheetName: true,
            snapshotHeaderRow: true,
            snapshotDataRows: true
          }
        }
      }
    });

    if (approvedVersions.length === 0) {
      return false;
    }

    const importJobs = approvedVersions.flatMap(version => version.importJobs);
    if (
      this.isOptionUsedInImportSnapshots(importJobs, fieldKey, optionValueKey, optionLabel)
    ) {
      return true;
    }

    const settingKeys = approvedVersions.map(version =>
      toManualSourceRowsSettingKey(version.id)
    );
    const settings = await this.prisma.globalUiSetting.findMany({
      where: {
        settingKey: {
          in: settingKeys
        }
      },
      select: {
        valueJson: true
      }
    });

    return this.isOptionUsedInManualSourceRows(settings, fieldKey, optionValueKey, optionLabel);
  }

  private isOptionUsedInImportSnapshots(
    importJobs: Array<{
      snapshotSourceType: string | null;
      snapshotSheetName: string | null;
      snapshotHeaderRow: Prisma.JsonValue | null;
      snapshotDataRows: Prisma.JsonValue | null;
    }>,
    fieldKey: BrandDropdownFieldKey,
    optionValueKey: string,
    optionLabel: string
  ) {
    const headerAliasSet = new Set(
      this.getCompanyFormatFieldAliases(fieldKey).map(alias =>
        normalizeLabel(alias).toLowerCase()
      )
    );

    if (headerAliasSet.size === 0) {
      return false;
    }

    for (const importJob of importJobs) {
      const snapshot = readImportJobSnapshot(importJob);
      if (!snapshot) {
        continue;
      }

      const matchingIndexes = snapshot.headerRow
        .map((header, index) => ({
          index,
          normalizedHeader: normalizeLabel(header).toLowerCase()
        }))
        .filter(item => headerAliasSet.has(item.normalizedHeader))
        .map(item => item.index);

      if (matchingIndexes.length === 0) {
        continue;
      }

      for (const row of snapshot.dataRows) {
        for (const columnIndex of matchingIndexes) {
          if (
            this.isDropdownOptionValueMatch(
              row[columnIndex] ?? '',
              optionValueKey,
              optionLabel
            )
          ) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private isOptionUsedInManualSourceRows(
    settings: Array<{ valueJson: string | null }>,
    fieldKey: BrandDropdownFieldKey,
    optionValueKey: string,
    optionLabel: string
  ) {
    const headerAliasSet = new Set(
      this.getCompanyFormatFieldAliases(fieldKey).map(alias =>
        normalizeLabel(alias).toLowerCase()
      )
    );

    if (headerAliasSet.size === 0) {
      return false;
    }

    for (const setting of settings) {
      const rowsByRowNumber = parseManualSourceRowsSettingPayload(setting.valueJson);

      for (const rowColumns of Object.values(rowsByRowNumber)) {
        for (const [rawLabel, rawValue] of Object.entries(rowColumns)) {
          const normalizedLabel = normalizeLabel(rawLabel).toLowerCase();
          if (!headerAliasSet.has(normalizedLabel)) {
            continue;
          }

          if (
            this.isDropdownOptionValueMatch(rawValue, optionValueKey, optionLabel)
          ) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private isDropdownOptionValueMatch(
    rawValue: string,
    optionValueKey: string,
    optionLabel: string
  ) {
    const normalizedValue = normalizeLabel(rawValue).toLowerCase();
    const normalizedOptionLabel = normalizeLabel(optionLabel).toLowerCase();

    if (!normalizedValue) {
      return false;
    }

    return (
      normalizedValue === normalizedOptionLabel ||
      toValueKey(normalizedValue) === optionValueKey
    );
  }

  private getCompanyFormatFieldAliases(fieldKey: BrandDropdownFieldKey) {
    const field = FIELD_DEFINITIONS.find(item => item.key === fieldKey);
    if (field) {
      return [field.label];
    }

    if (fieldKey === BrandDropdownFieldKey.related_product) {
      return ['Related Product'];
    }

    if (fieldKey === BrandDropdownFieldKey.campaign_base) {
      return ['Campaign Base', 'Is campaign content'];
    }

    return [fieldKey.replace(/_/g, ' ')];
  }

  private async ensureEngagementFormulaSetting() {
    await this.ensureComputedColumnSettingsStorage();

    return this.prisma.globalComputedColumnSetting.upsert({
      where: {
        key: ComputedColumnKey.engagement
      },
      update: {},
      create: {
        key: ComputedColumnKey.engagement,
        label: defaultEngagementFormula.label,
        operation: 'sum',
        sourceLabelA: defaultEngagementFormula.sourceLabelA,
        sourceLabelB: defaultEngagementFormula.sourceLabelB
      }
    });
  }

  private async readLatestImportColumnProfiles() {
    try {
      return await this.prisma.importColumnProfile.findMany({
        select: {
          sourceColumnName: true,
          sampleValue: true,
          updatedAt: true
        },
        orderBy: [{ updatedAt: 'desc' }],
        take: 500
      });
    } catch (error) {
      if (!this.isMissingTableError(error)) {
        throw error;
      }

      // Fresh install fallback when schema sync has not created this table yet.
      return [];
    }
  }

  private isMissingTableError(error: unknown) {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const code =
      'code' in error && typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : '';
    const message =
      'message' in error && typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message.toLowerCase()
        : '';

    return (
      code === 'P2021' ||
      code === 'P2022' ||
      message.includes("doesn't exist") ||
      message.includes('no such table') ||
      message.includes('unknown table') ||
      message.includes('unknown column') ||
      message.includes('column does not exist')
    );
  }

  private async ensureFormulaStorageColumn(
    columnName: string,
    definition: string,
    afterColumn: string
  ) {
    try {
      await this.prisma.$executeRawUnsafe(
        `
        ALTER TABLE global_computed_formulas
        ADD COLUMN ${columnName} ${definition} AFTER ${afterColumn}
        `
      );
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (message.includes('duplicate column name')) {
        return;
      }
      throw error;
    }
  }

  private async ensureComputedColumnSettingsStorageColumn(
    columnName: string,
    definition: string,
    afterColumn: string
  ) {
    try {
      await this.prisma.$executeRawUnsafe(
        `
        ALTER TABLE global_computed_column_settings
        ADD COLUMN ${columnName} ${definition} AFTER ${afterColumn}
        `
      );
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (message.includes('duplicate column name')) {
        return;
      }
      throw error;
    }
  }

  private async ensureSystemEngagementFormulaRecord(setting: {
    label: string;
    sourceLabelA: string;
    sourceLabelB: string;
  }) {
    const expression = `{{${setting.sourceLabelA}}} + {{${setting.sourceLabelB}}}`;
    const existingRows = await this.prisma.$queryRawUnsafe<RawComputedFormulaRow[]>(
      `
      SELECT
        id,
        column_label,
        expression,
        is_active,
        created_at,
        updated_at
      FROM global_computed_formulas
      WHERE column_label = ?
      ORDER BY created_at ASC
      LIMIT 1
      `,
      setting.label
    );
    const existing = existingRows[0] ?? null;

    if (!existing) {
      await this.prisma.$executeRawUnsafe(
        `
        INSERT INTO global_computed_formulas (
          id,
          column_label,
          expression,
          is_active
        ) VALUES (?, ?, ?, 1)
        `,
        randomUUID(),
        setting.label,
        expression
      );
      return;
    }

    await this.prisma.$executeRawUnsafe(
      `
      UPDATE global_computed_formulas
      SET
        expression = ?,
        is_active = 1,
        updated_at = CURRENT_TIMESTAMP(3)
      WHERE id = ?
      `,
      expression,
      existing.id
    );
  }

  private async isSystemEngagementFormula(row: RawComputedFormulaRow) {
    const setting = await this.ensureEngagementFormulaSetting();
    const expectedExpression = `{{${setting.sourceLabelA}}} + {{${setting.sourceLabelB}}}`;

    return row.column_label === setting.label && row.expression === expectedExpression;
  }

  private normalizeHeaderKey(value: string | null | undefined) {
    return String(value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private sanitizeImportColumnMappingRules(
    rules: ImportColumnMappingRule[]
  ): ImportColumnMappingRule[] {
    const targetFieldSet = new Set<string>(
      IMPORT_MAPPING_TARGET_CATALOG.map((target) => target.key)
    );
    const ruleByTarget = new Map(
      (rules ?? [])
        .map((rule) => ({
          targetField: normalizeLabel(rule.targetField || ''),
          baselineHeader: normalizeLabel(rule.baselineHeader || ''),
          displayLabel: normalizeLabel(rule.displayLabel || ''),
          aliases: Array.isArray(rule.aliases) ? rule.aliases : [],
          required: !!rule.required
        }))
        .filter((rule) => !!rule.targetField && !!rule.baselineHeader)
        .map((rule) => [rule.targetField, rule])
    );
    const canonicalRules = IMPORT_MAPPING_TARGET_CATALOG.map((target) => {
      const defaultRule =
        DEFAULT_IMPORT_MAPPING_RULES.find((rule) => rule.targetField === target.key)!;
      const source = ruleByTarget.get(target.key) ?? defaultRule;
      const baselineHeader = normalizeLabel(source.baselineHeader || defaultRule.baselineHeader);
      const displayLabel = normalizeLabel(
        source.displayLabel || source.baselineHeader || defaultRule.displayLabel
      );
      const aliases = Array.from(
        new Set(
          (source.aliases ?? [])
            .map((alias) => normalizeLabel(alias))
            .filter(
              (alias) =>
                !!alias &&
                this.normalizeHeaderKey(alias) !== this.normalizeHeaderKey(baselineHeader)
            )
        )
      );

      return {
        targetField: target.key,
        baselineHeader,
        displayLabel,
        aliases,
        required: !!source.required
      };
    });

    const usedTargetFields = new Set<string>(
      canonicalRules.map((rule) => rule.targetField)
    );
    const extraRules = Array.from(ruleByTarget.values())
      .filter((rule) => !targetFieldSet.has(rule.targetField))
      .map((rule) => {
        let targetField = rule.targetField;
        if (!targetField) {
          targetField = `${EXTERNAL_IMPORT_MAPPING_TARGET_PREFIX}${toValueKey(
            rule.baselineHeader
          )}`;
        }

        if (!targetField.startsWith(EXTERNAL_IMPORT_MAPPING_TARGET_PREFIX)) {
          targetField = `${EXTERNAL_IMPORT_MAPPING_TARGET_PREFIX}${toValueKey(
            rule.baselineHeader
          )}`;
        }

        let dedupedTargetField = targetField;
        let suffix = 2;
        while (usedTargetFields.has(dedupedTargetField)) {
          dedupedTargetField = `${targetField}-${suffix}`;
          suffix += 1;
        }
        usedTargetFields.add(dedupedTargetField);

        const baselineHeader = normalizeLabel(rule.baselineHeader);
        const displayLabel = normalizeLabel(rule.displayLabel || rule.baselineHeader);
        const aliases = Array.from(
          new Set(
            (rule.aliases ?? [])
              .map((alias) => normalizeLabel(alias))
              .filter(
                (alias) =>
                  !!alias &&
                  this.normalizeHeaderKey(alias) !== this.normalizeHeaderKey(baselineHeader)
              )
          )
        );

        return {
          targetField: dedupedTargetField,
          baselineHeader,
          displayLabel,
          aliases,
          required: false
        };
      })
      .sort((left, right) => left.baselineHeader.localeCompare(right.baselineHeader));

    return [...canonicalRules, ...extraRules];
  }

  private ensureImportMappingRulesCoverHeaders(
    rules: ImportColumnMappingRule[],
    uploadedHeaders: string[]
  ) {
    if (!uploadedHeaders.length) {
      return rules;
    }

    const normalizedHeadersCovered = new Set(
      rules.flatMap((rule) =>
        [rule.baselineHeader, ...rule.aliases]
          .map((candidate) => this.normalizeHeaderKey(candidate))
          .filter((candidate) => !!candidate)
      )
    );
    const usedTargetFields = new Set(rules.map((rule) => rule.targetField));
    const additionalRules: ImportColumnMappingRule[] = [];

    for (const header of uploadedHeaders) {
      const normalizedHeader = this.normalizeHeaderKey(header);
      if (!normalizedHeader || normalizedHeadersCovered.has(normalizedHeader)) {
        continue;
      }

      let targetField = `${EXTERNAL_IMPORT_MAPPING_TARGET_PREFIX}${toValueKey(header)}`;
      let suffix = 2;
      while (usedTargetFields.has(targetField)) {
        targetField = `${EXTERNAL_IMPORT_MAPPING_TARGET_PREFIX}${toValueKey(header)}-${suffix}`;
        suffix += 1;
      }

      usedTargetFields.add(targetField);
      normalizedHeadersCovered.add(normalizedHeader);
      additionalRules.push({
        targetField,
        baselineHeader: header,
        displayLabel: header,
        aliases: [],
        required: false
      });
    }

    if (additionalRules.length === 0) {
      return rules;
    }

    return this.sanitizeImportColumnMappingRules([...rules, ...additionalRules]);
  }

  private isCanonicalImportMappingTargetField(value: string): value is MappingTargetField {
    return IMPORT_MAPPING_TARGET_CATALOG.some((target) => target.key === value);
  }

  private async readImportColumnMappingPublished() {
    const parsed = await this.readUiSettingJson<ImportColumnMappingVersion>(
      IMPORT_COLUMN_MAPPING_PUBLISHED_SETTING_KEY
    );

    if (!parsed || !Array.isArray(parsed.rules)) {
      return null;
    }

    const version: ImportColumnMappingVersion = {
      ...parsed,
      sourceFilename: parsed.sourceFilename ?? null,
      publishedBy: parsed.publishedBy ?? null,
      note: parsed.note ?? null
    };

    if (this.isLegacyInitialBaselineMapping(version)) {
      return null;
    }

    return version;
  }

  private async readImportColumnMappingDraft() {
    const parsed = await this.readUiSettingJson<ImportColumnMappingDraft>(
      IMPORT_COLUMN_MAPPING_DRAFT_SETTING_KEY
    );

    if (!parsed || !Array.isArray(parsed.rules)) {
      return null;
    }

    const uploadedHeaders = Array.isArray(parsed.uploadedHeaders)
      ? parsed.uploadedHeaders
          .map((header) => normalizeLabel(String(header)))
          .filter((header) => !!header)
      : [];
    const uploadedHeaderCount =
      typeof parsed.uploadedHeaderCount === 'number' &&
      Number.isFinite(parsed.uploadedHeaderCount) &&
      parsed.uploadedHeaderCount > 0
        ? Math.trunc(parsed.uploadedHeaderCount)
        : uploadedHeaders.length;
    const rules = this.ensureImportMappingRulesCoverHeaders(
      this.sanitizeImportColumnMappingRules(parsed.rules),
      uploadedHeaders
    );

    return {
      ...parsed,
      sourceFilename: parsed.sourceFilename ?? null,
      updatedBy: parsed.updatedBy ?? null,
      uploadedHeaderCount,
      uploadedHeaders,
      rules
    };
  }

  private async readImportColumnMappingHistory() {
    const parsed = await this.readUiSettingJson<ImportColumnMappingVersion[]>(
      IMPORT_COLUMN_MAPPING_HISTORY_SETTING_KEY
    );

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item) => item && Array.isArray(item.rules))
      .map((item) => ({
        ...item,
        sourceFilename: item.sourceFilename ?? null,
        publishedBy: item.publishedBy ?? null,
        note: item.note ?? null,
        rules: this.sanitizeImportColumnMappingRules(item.rules)
      }))
      .filter((item) => !this.isLegacyInitialBaselineMapping(item))
      .sort(
        (left, right) =>
          new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime()
      );
  }

  private isLegacyInitialBaselineMapping(version: ImportColumnMappingVersion) {
    if (
      version.sourceFilename !== null ||
      version.publishedBy !== 'system' ||
      version.note !== 'Initial baseline seed'
    ) {
      return false;
    }

    const comparableVersionRules = this.toComparableImportMappingRules(version.rules);
    const comparableDefaultRules = this.toComparableImportMappingRules(
      DEFAULT_IMPORT_MAPPING_RULES
    );

    return JSON.stringify(comparableVersionRules) === JSON.stringify(comparableDefaultRules);
  }

  private toComparableImportMappingRules(rules: ImportColumnMappingRule[]) {
    return this.sanitizeImportColumnMappingRules(rules).map((rule) => ({
      targetField: rule.targetField,
      baselineHeader: this.normalizeHeaderKey(rule.baselineHeader),
      displayLabel: this.normalizeHeaderKey(rule.displayLabel),
      aliases: rule.aliases
        .map((alias) => this.normalizeHeaderKey(alias))
        .filter((alias) => !!alias)
        .sort(),
      required: !!rule.required
    }));
  }

  private async readUiSettingJson<T>(settingKey: string): Promise<T | null> {
    await this.ensureUiSettingsStorage();
    const setting = await this.prisma.globalUiSetting.findUnique({
      where: {
        settingKey
      }
    });

    if (!setting) {
      return null;
    }

    try {
      return JSON.parse(setting.valueJson) as T;
    } catch {
      return null;
    }
  }

  private async writeUiSettingJson(settingKey: string, value: unknown) {
    await this.ensureUiSettingsStorage();
    await this.prisma.globalUiSetting.upsert({
      where: {
        settingKey
      },
      update: {
        valueJson: JSON.stringify(value)
      },
      create: {
        settingKey,
        valueJson: JSON.stringify(value)
      }
    });
  }

  private async deleteUiSetting(settingKey: string) {
    await this.ensureUiSettingsStorage();
    await this.prisma.globalUiSetting.deleteMany({
      where: {
        settingKey
      }
    });
  }

  private parseContentCountPolicyPayload(rawValueJson: string | null) {
    if (!rawValueJson) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawValueJson) as ContentCountPolicySettingPayload;
      return {
        mode: this.resolveContentCountPolicyMode(parsed.mode),
        updatedBy: normalizeLabel(String(parsed.updatedBy ?? '')) || null,
        note: normalizeLabel(String(parsed.note ?? '')) || null
      };
    } catch {
      return null;
    }
  }

  private parseTopContentPolicyPayload(rawValueJson: string | null) {
    if (!rawValueJson) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawValueJson) as TopContentDataSourcePolicySettingPayload;
      return {
        mode: this.resolveTopContentDataSourcePolicyMode(parsed.mode),
        updatedBy: normalizeLabel(String(parsed.updatedBy ?? '')) || null,
        note: normalizeLabel(String(parsed.note ?? '')) || null,
        excludedContentStyleValueKeys: this.parseStringArray(
          parsed.excludedContentStyleValueKeys
        )
      };
    } catch {
      return null;
    }
  }

  private parseStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as string[];
    }

    return value
      .map(item => String(item ?? '').trim())
      .filter(item => !!item);
  }

  private resolveExcludedContentStyleValueKeys(
    valueKeys: string[],
    optionsByValueKey: Map<
      string,
      {
        label: string;
        status: BrandDropdownOptionStatus;
      }
    >
  ) {
    return Array.from(
      new Set(
        valueKeys
          .map(valueKey => String(valueKey ?? '').trim())
          .filter(valueKey => !!valueKey && optionsByValueKey.has(valueKey))
      )
    );
  }

  private toContentCountPolicyLabel(mode: ContentCountPolicyMode) {
    return mode === 'csv_only'
      ? 'CSV only (manual rows excluded)'
      : 'CSV + manual rows';
  }

  private resolveContentCountPolicyMode(value: unknown): ContentCountPolicyMode {
    if (value === 'csv_only' || value === 'csv_and_manual') {
      return value;
    }

    return DEFAULT_CONTENT_COUNT_POLICY_MODE;
  }

  private toTopContentDataSourcePolicyLabel(mode: TopContentDataSourcePolicyMode) {
    return mode === 'csv_only'
      ? 'CSV only (manual rows excluded)'
      : 'CSV + manual rows';
  }

  private resolveTopContentDataSourcePolicyMode(value: unknown): TopContentDataSourcePolicyMode {
    if (value === 'csv_only' || value === 'csv_and_manual') {
      return value;
    }

    return DEFAULT_TOP_CONTENT_DATA_SOURCE_POLICY_MODE;
  }

  private resolveFieldKey(value: string) {
    const allowedKeys = new Set(FIELD_DEFINITIONS.map(field => field.key));

    if (!allowedKeys.has(value as BrandDropdownFieldKey)) {
      throw new BadRequestException('Unknown internal field key.');
    }

    return value as BrandDropdownFieldKey;
  }

  private resolveStatus(value: string) {
    if (
      !Object.values(BrandDropdownOptionStatus).includes(
        value as BrandDropdownOptionStatus
      )
    ) {
      throw new BadRequestException('Invalid option status.');
    }

    return value as BrandDropdownOptionStatus;
  }
}
