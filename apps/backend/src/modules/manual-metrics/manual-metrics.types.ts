export type ManualHeaderMetricValues = {
  viewers: number | null;
  pageFollowers: number | null;
  pageVisit: number | null;
};

export type UpdateManualHeaderMetricInput = {
  viewers?: string | null;
  pageFollowers?: string | null;
  pageVisit?: string | null;
};
