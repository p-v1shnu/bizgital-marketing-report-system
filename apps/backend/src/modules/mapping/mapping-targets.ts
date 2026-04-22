import type { MappingTargetField } from '@prisma/client';

import type { MappingOverviewResponse } from './mapping.types';

export type CanonicalFieldDataType = 'string' | 'number' | 'date' | 'url';
export type CanonicalFieldInputType = 'text' | 'number' | 'date' | 'url';

export const CANONICAL_TARGETS: Array<{
  key: MappingTargetField;
  label: string;
  description: string;
  dataType: CanonicalFieldDataType;
  inputType: CanonicalFieldInputType;
  isMetric: boolean;
}> = [
  {
    key: 'views',
    label: 'Views',
    description: 'Canonical Views metric.',
    dataType: 'number',
    inputType: 'number',
    isMetric: true
  },
  {
    key: 'viewers',
    label: 'Viewers',
    description: 'Canonical Viewers metric.',
    dataType: 'number',
    inputType: 'number',
    isMetric: true
  },
  {
    key: 'engagement',
    label: 'Engagement',
    description: 'Canonical Engagement metric.',
    dataType: 'number',
    inputType: 'number',
    isMetric: true
  },
  {
    key: 'video_views_3s',
    label: '3-second video views',
    description: 'Video view metric at 3 seconds.',
    dataType: 'number',
    inputType: 'number',
    isMetric: true
  }
];

export const AVAILABLE_TARGETS: MappingOverviewResponse['availableTargets'] =
  CANONICAL_TARGETS.map(({ key, label, description }) => ({
    key,
    label,
    description
  }));

export const AVAILABLE_TARGETS_BY_KEY = new Map(
  CANONICAL_TARGETS.map((target) => [target.key, target])
);

export const METRIC_TARGET_FIELDS = CANONICAL_TARGETS.filter((target) => target.isMetric).map(
  (target) => target.key
);
