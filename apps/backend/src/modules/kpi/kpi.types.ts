import type { KpiSourceType, MappingTargetField } from '@prisma/client';

export type KpiCatalogListResponse = {
  items: Array<{
    id: string;
    key: string;
    label: string;
    description: string | null;
    sourceType: KpiSourceType;
    canonicalMetricKey: MappingTargetField | null;
    formulaId: string | null;
    formulaLabel: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    usage: {
      activePlanCount: number;
    };
  }>;
  newBrandDefaultKpiCatalogIds: string[];
};

export type NewBrandDefaultKpiSelectionResponse = {
  kpiCatalogIds: string[];
};

export type UpdateNewBrandDefaultKpiSelectionInput = {
  kpiCatalogIds: string[];
};

export type CreateKpiCatalogInput = {
  label: string;
  description?: string | null;
  sourceType: KpiSourceType;
  canonicalMetricKey?: MappingTargetField | null;
  formulaId?: string | null;
  isActive?: boolean;
};

export type UpdateKpiCatalogInput = Partial<CreateKpiCatalogInput>;

export type BrandKpiPlanResponse = {
  brand: {
    id: string;
    code: string;
    name: string;
  };
  year: number;
  plan: {
    id: string | null;
    itemCount: number;
    updatedAt: string | null;
    approvedReportCount?: number;
    hasLegacyCoverageGap?: boolean;
  };
  items: Array<{
    id: string;
    sortOrder: number;
    targetValue: number | null;
    note: string | null;
    canRemove?: boolean;
    removeBlockedReason?: string | null;
    usage?: {
      approvedReportCount: number;
      blockedByLegacyCoverageGap: boolean;
    };
    kpi: {
      id: string;
      key: string;
      label: string;
      description: string | null;
      sourceType: KpiSourceType;
      canonicalMetricKey: MappingTargetField | null;
      formulaId: string | null;
      formulaLabel: string | null;
      isActive: boolean;
    };
  }>;
};

export type UpdateBrandKpiPlanInput = {
  items: Array<{
    kpiCatalogId: string;
    targetValue?: number | null;
    note?: string | null;
    sortOrder?: number | null;
  }>;
};
