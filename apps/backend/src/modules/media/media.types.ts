export type CreateMediaPresignUploadInput = {
  scope?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
};

export type CreateMediaPresignUploadResponse = {
  method: 'PUT';
  uploadUrl: string;
  publicUrl: string;
  objectKey: string;
  headers: Record<string, string>;
  expiresInSeconds: number;
  maxBytes: number;
};

export type DeleteMediaObjectInput = {
  publicUrl?: string | null;
  objectKey?: string | null;
};

export type DeleteMediaObjectResponse = {
  deleted: boolean;
  skipped: boolean;
  objectKey: string | null;
  reason?: string;
};

export type CleanupMediaOrphansInput = {
  dryRun?: boolean;
  maxDelete?: number | null;
  minAgeHours?: number | null;
};

export type CleanupMediaOrphansResponse = {
  dryRun: boolean;
  listedObjectCount: number;
  referencedObjectCount: number;
  orphanObjectCount: number;
  eligibleOrphanObjectCount: number;
  deletedObjectCount: number;
  scannedAt: string;
  maxDeleteApplied: number | null;
  minAgeHoursApplied: number;
};
