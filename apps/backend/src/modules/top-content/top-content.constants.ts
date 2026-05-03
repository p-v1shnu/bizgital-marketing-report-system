import { MappingTargetField } from '@prisma/client';

export type TopContentSlotKey = 'top_views' | 'top_engagement' | 'top_reach';

export const TOP_CONTENT_SLOTS: Array<{
  slotKey: TopContentSlotKey;
  slotLabel: string;
  metricKey: MappingTargetField;
  rankPosition: number;
  displayOrder: number;
  metricLabelOverride?: string;
}> = [
  {
    slotKey: 'top_views',
    slotLabel: 'Top 3 Views',
    metricKey: 'views',
    rankPosition: 1,
    displayOrder: 1
  },
  {
    slotKey: 'top_views',
    slotLabel: 'Top 3 Views',
    metricKey: 'views',
    rankPosition: 2,
    displayOrder: 2
  },
  {
    slotKey: 'top_views',
    slotLabel: 'Top 3 Views',
    metricKey: 'views',
    rankPosition: 3,
    displayOrder: 3
  },
  {
    slotKey: 'top_engagement',
    slotLabel: 'Top 3 Engagement',
    metricKey: 'engagement',
    rankPosition: 1,
    displayOrder: 4
  },
  {
    slotKey: 'top_engagement',
    slotLabel: 'Top 3 Engagement',
    metricKey: 'engagement',
    rankPosition: 2,
    displayOrder: 5
  },
  {
    slotKey: 'top_engagement',
    slotLabel: 'Top 3 Engagement',
    metricKey: 'engagement',
    rankPosition: 3,
    displayOrder: 6
  },
  {
    slotKey: 'top_reach',
    slotLabel: 'Top 3 Viewers (Post)',
    metricKey: 'viewers',
    metricLabelOverride: 'Viewers (Post)',
    rankPosition: 1,
    displayOrder: 7
  },
  {
    slotKey: 'top_reach',
    slotLabel: 'Top 3 Viewers (Post)',
    metricKey: 'viewers',
    metricLabelOverride: 'Viewers (Post)',
    rankPosition: 2,
    displayOrder: 8
  },
  {
    slotKey: 'top_reach',
    slotLabel: 'Top 3 Viewers (Post)',
    metricKey: 'viewers',
    metricLabelOverride: 'Viewers (Post)',
    rankPosition: 3,
    displayOrder: 9
  }
];
