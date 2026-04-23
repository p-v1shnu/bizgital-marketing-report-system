export const NEW_BRAND_DEFAULT_KPI_SETTING_KEY = 'new_brand_default_kpis';

export type NewBrandDefaultKpiSettingPayload = {
  kpiCatalogIds: string[];
};

export const DEFAULT_NEW_BRAND_KPI_CATALOG_KEYS = [
  'views',
  'viewers',
  'engagement',
  'video_views_3s'
] as const;
