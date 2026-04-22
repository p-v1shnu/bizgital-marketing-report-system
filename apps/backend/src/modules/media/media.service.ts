import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';

import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  paginateListObjectsV2,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../prisma/prisma.service';
import type {
  CleanupMediaOrphansInput,
  CleanupMediaOrphansResponse,
  CreateMediaPresignUploadInput,
  CreateMediaPresignUploadResponse,
  DeleteMediaObjectInput,
  DeleteMediaObjectResponse
} from './media.types';

type MediaStorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle: boolean;
  publicBaseUrl: string;
  uploadMaxBytes: number;
  presignExpiresSeconds: number;
};

const DEFAULT_SCOPE = 'general';
const DEFAULT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_PRESIGN_EXPIRES_SECONDS = 900;
const MIN_PRESIGN_EXPIRES_SECONDS = 60;
const MAX_PRESIGN_EXPIRES_SECONDS = 3600;
const DEFAULT_ORPHAN_CLEANUP_ENABLED = false;
const DEFAULT_ORPHAN_CLEANUP_INTERVAL_HOURS = 24;
const DEFAULT_ORPHAN_CLEANUP_INITIAL_DELAY_MINUTES = 5;
const DEFAULT_ORPHAN_CLEANUP_MAX_DELETE_PER_RUN = 500;
const DEFAULT_ORPHAN_CLEANUP_MIN_AGE_HOURS = 168;
const MIN_ORPHAN_CLEANUP_MIN_AGE_HOURS = 1;
const MAX_ORPHAN_CLEANUP_MIN_AGE_HOURS = 24 * 365;
const MAX_DELETE_OBJECTS_PER_BATCH = 1000;
const MANAGED_OBJECT_PREFIX = 'uploads/';
const STANDARD_UPLOAD_MIME_TYPE = 'image/webp';

type ManagedObjectRecord = {
  key: string;
  lastModified: Date | null;
};

@Injectable()
export class MediaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaService.name);
  private clientCache:
    | {
        cacheKey: string;
        client: S3Client;
      }
    | null = null;
  private cleanupIntervalTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupStartupTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  onModuleInit() {
    this.setupCleanupSchedule();
  }

  onModuleDestroy() {
    if (this.cleanupIntervalTimer) {
      clearInterval(this.cleanupIntervalTimer);
      this.cleanupIntervalTimer = null;
    }

    if (this.cleanupStartupTimer) {
      clearTimeout(this.cleanupStartupTimer);
      this.cleanupStartupTimer = null;
    }
  }

  async createPresignedUpload(
    input: CreateMediaPresignUploadInput
  ): Promise<CreateMediaPresignUploadResponse> {
    const config = this.resolveStorageConfig();
    const mimeType = this.normalizeMimeType(input.mimeType);
    this.normalizeSizeBytes(input.sizeBytes, config.uploadMaxBytes);
    const scope = this.normalizeScope(input.scope);
    const extension = this.resolveExtension(input.filename, mimeType);
    const objectKey = this.createObjectKey(scope, extension);
    const client = this.resolveS3Client(config);
    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      ContentType: mimeType,
      CacheControl: 'public, max-age=31536000, immutable'
    });
    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn: config.presignExpiresSeconds
    });

    return {
      method: 'PUT',
      uploadUrl,
      publicUrl: this.resolvePublicUrl(config.publicBaseUrl, objectKey),
      objectKey,
      headers: {
        'Content-Type': mimeType
      },
      expiresInSeconds: config.presignExpiresSeconds,
      maxBytes: config.uploadMaxBytes
    };
  }

  async deleteObject(input: DeleteMediaObjectInput): Promise<DeleteMediaObjectResponse> {
    const config = this.resolveStorageConfig();
    const objectKey = this.resolveDeleteTargetKey(input, config);

    if (!objectKey) {
      return {
        deleted: false,
        skipped: true,
        objectKey: null,
        reason: 'Object URL is not managed by this storage configuration.'
      };
    }

    const client = this.resolveS3Client(config);
    await client.send(
      new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: objectKey
      })
    );

    return {
      deleted: true,
      skipped: false,
      objectKey
    };
  }

  async assertManagedPublicUrlsExist(
    urls: Array<string | null | undefined>,
    label = 'Media file'
  ) {
    const normalizedUrls = Array.from(
      new Set(
        urls
          .map((url) => this.normalizeOptionalString(url))
          .filter((url): url is string => !!url)
      )
    );

    if (normalizedUrls.length === 0) {
      return;
    }

    const config = this.resolveStorageConfig();
    const client = this.resolveS3Client(config);

    for (const publicUrl of normalizedUrls) {
      const objectKey = this.extractObjectKeyFromPublicUrl(publicUrl, config);

      // External URLs are allowed; only managed storage URLs are validated.
      if (!objectKey) {
        continue;
      }

      try {
        await client.send(
          new HeadObjectCommand({
            Bucket: config.bucket,
            Key: objectKey
          })
        );
      } catch (error) {
        if (this.isMissingObjectError(error)) {
          throw new BadRequestException(
            `${label} was not found in storage. Please upload the file again before saving.`
          );
        }

        throw new ServiceUnavailableException(
          `Unable to verify ${label.toLowerCase()} in storage. Please try again.`
        );
      }
    }
  }

  async cleanupOrphans(
    input: CleanupMediaOrphansInput = {}
  ): Promise<CleanupMediaOrphansResponse> {
    const config = this.resolveStorageConfig();
    const client = this.resolveS3Client(config);
    const dryRun = !!input.dryRun;
    const maxDelete = this.normalizeOptionalPositiveInteger(input.maxDelete);
    const minAgeHours = this.resolveOrphanCleanupMinAgeHours(input.minAgeHours);
    const minimumLastModifiedTimestamp = Date.now() - minAgeHours * 60 * 60 * 1000;
    const listedObjects = await this.listManagedObjects(client, config.bucket);
    const referencedObjectKeys = await this.listReferencedObjectKeys(config);
    const referencedSet = new Set(referencedObjectKeys);
    const orphanObjects = listedObjects.filter((item) => !referencedSet.has(item.key));
    const eligibleOrphanObjects = orphanObjects.filter((item) => {
      if (!item.lastModified) {
        return true;
      }

      return item.lastModified.getTime() <= minimumLastModifiedTimestamp;
    });
    const candidateKeys =
      maxDelete !== null
        ? eligibleOrphanObjects.slice(0, maxDelete).map((item) => item.key)
        : eligibleOrphanObjects.map((item) => item.key);

    let deletedObjectCount = 0;

    if (!dryRun && candidateKeys.length > 0) {
      deletedObjectCount = await this.deleteObjectKeys(
        client,
        config.bucket,
        candidateKeys
      );
    }

    return {
      dryRun,
      listedObjectCount: listedObjects.length,
      referencedObjectCount: referencedSet.size,
      orphanObjectCount: orphanObjects.length,
      eligibleOrphanObjectCount: eligibleOrphanObjects.length,
      deletedObjectCount,
      scannedAt: new Date().toISOString(),
      maxDeleteApplied: maxDelete,
      minAgeHoursApplied: minAgeHours
    };
  }

  private setupCleanupSchedule() {
    const enabled = this.parseBoolean(
      this.configService.get<string>('MEDIA_ORPHAN_CLEANUP_ENABLED'),
      DEFAULT_ORPHAN_CLEANUP_ENABLED
    );

    if (!enabled) {
      this.logger.log('Media orphan cleanup schedule is disabled.');
      return;
    }

    const intervalHours = this.clamp(
      this.parsePositiveInteger(
        this.configService.get<string>('MEDIA_ORPHAN_CLEANUP_INTERVAL_HOURS'),
        DEFAULT_ORPHAN_CLEANUP_INTERVAL_HOURS
      ),
      1,
      24 * 30
    );
    const startupDelayMinutes = this.clamp(
      this.parsePositiveInteger(
        this.configService.get<string>('MEDIA_ORPHAN_CLEANUP_INITIAL_DELAY_MINUTES'),
        DEFAULT_ORPHAN_CLEANUP_INITIAL_DELAY_MINUTES
      ),
      1,
      120
    );
    const intervalMs = intervalHours * 60 * 60 * 1000;
    const startupDelayMs = startupDelayMinutes * 60 * 1000;

    this.cleanupStartupTimer = setTimeout(() => {
      void this.runScheduledCleanup();
    }, startupDelayMs);
    this.cleanupIntervalTimer = setInterval(() => {
      void this.runScheduledCleanup();
    }, intervalMs);

    this.logger.log(
      `Media orphan cleanup scheduled every ${intervalHours} hour(s) (initial delay ${startupDelayMinutes} minute(s)).`
    );
  }

  private async runScheduledCleanup() {
    const maxDelete = this.parsePositiveInteger(
      this.configService.get<string>('MEDIA_ORPHAN_CLEANUP_MAX_DELETE_PER_RUN'),
      DEFAULT_ORPHAN_CLEANUP_MAX_DELETE_PER_RUN
    );
    const minAgeHours = this.resolveOrphanCleanupMinAgeHours(null);

    try {
      const result = await this.cleanupOrphans({
        dryRun: false,
        maxDelete,
        minAgeHours
      });
      this.logger.log(
        `Media cleanup done. listed=${result.listedObjectCount}, referenced=${result.referencedObjectCount}, orphan=${result.orphanObjectCount}, eligible=${result.eligibleOrphanObjectCount}, deleted=${result.deletedObjectCount}, minAgeHours=${result.minAgeHoursApplied}.`
      );
    } catch (error) {
      this.logger.warn(
        `Media cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async listManagedObjects(client: S3Client, bucket: string) {
    const records: ManagedObjectRecord[] = [];
    const paginator = paginateListObjectsV2(
      {
        client,
        pageSize: MAX_DELETE_OBJECTS_PER_BATCH
      },
      {
        Bucket: bucket,
        Prefix: MANAGED_OBJECT_PREFIX
      }
    );

    for await (const page of paginator) {
      for (const item of page.Contents ?? []) {
        if (item.Key) {
          records.push({
            key: item.Key,
            lastModified: item.LastModified ?? null
          });
        }
      }
    }

    return records;
  }

  private async listReferencedObjectKeys(config: MediaStorageConfig) {
    const [
      topContentRows,
      competitorNoActivityRows,
      competitorPostRows,
      questionScreenshotRows,
      questionHighlightScreenshotRows,
      brandLogoRows,
      competitorLogoRows
    ] = await Promise.all([
      this.prisma.topContentCard.findMany({
        where: {
          screenshotUrl: {
            not: null
          }
        },
        select: {
          screenshotUrl: true
        }
      }),
      this.prisma.competitorMonitoring.findMany({
        where: {
          noActivityEvidenceImageUrl: {
            not: null
          }
        },
        select: {
          noActivityEvidenceImageUrl: true
        }
      }),
      this.prisma.competitorMonitoringPost.findMany({
        select: {
          screenshotUrl: true
        }
      }),
      this.prisma.questionEvidenceScreenshot.findMany({
        select: {
          screenshotUrl: true
        }
      }),
      this.prisma.questionHighlightScreenshot.findMany({
        select: {
          screenshotUrl: true
        }
      }),
      this.readBrandLogoRows(),
      this.readCompetitorLogoRows()
    ]);

    const urls = [
      ...topContentRows.map((row) => row.screenshotUrl),
      ...competitorNoActivityRows.map((row) => row.noActivityEvidenceImageUrl),
      ...competitorPostRows.map((row) => row.screenshotUrl),
      ...questionScreenshotRows.map((row) => row.screenshotUrl),
      ...questionHighlightScreenshotRows.map((row) => row.screenshotUrl),
      ...brandLogoRows.map((row) => row.logo_url),
      ...competitorLogoRows.map((row) => row.websiteUrl)
    ];
    const keys = new Set<string>();

    for (const url of urls) {
      const key = this.extractObjectKeyFromPublicUrl(url, config);

      if (key) {
        keys.add(key);
      }
    }

    return Array.from(keys);
  }

  private async readBrandLogoRows() {
    try {
      return await this.prisma.$queryRawUnsafe<Array<{ logo_url: string | null }>>(
        `
        SELECT logo_url
        FROM brand_ui_settings
        WHERE logo_url IS NOT NULL
        `
      );
    } catch {
      return [];
    }
  }

  private async readCompetitorLogoRows() {
    return this.prisma.competitor.findMany({
      where: {
        websiteUrl: {
          not: null
        }
      },
      select: {
        websiteUrl: true
      }
    });
  }

  private async deleteObjectKeys(client: S3Client, bucket: string, keys: string[]) {
    let deleted = 0;

    for (let index = 0; index < keys.length; index += MAX_DELETE_OBJECTS_PER_BATCH) {
      const chunk = keys.slice(index, index + MAX_DELETE_OBJECTS_PER_BATCH);

      const result = await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Quiet: true,
            Objects: chunk.map((key) => ({ Key: key }))
          }
        })
      );

      deleted += result.Deleted?.length ?? 0;
    }

    return deleted;
  }

  private resolveDeleteTargetKey(
    input: DeleteMediaObjectInput,
    config: MediaStorageConfig
  ) {
    const normalizedObjectKey = this.normalizeObjectKey(input.objectKey);

    if (normalizedObjectKey) {
      return normalizedObjectKey;
    }

    return this.extractObjectKeyFromPublicUrl(input.publicUrl, config);
  }

  private extractObjectKeyFromPublicUrl(
    value: string | null | undefined,
    config: MediaStorageConfig
  ) {
    const normalized = this.normalizeOptionalString(value);

    if (!normalized) {
      return null;
    }

    let publicUrl: URL;
    let baseUrl: URL;

    try {
      publicUrl = new URL(normalized);
      baseUrl = new URL(config.publicBaseUrl);
    } catch {
      return null;
    }

    if (publicUrl.origin !== baseUrl.origin) {
      return null;
    }

    const basePath = this.trimSlashes(baseUrl.pathname);
    const valuePath = this.trimSlashes(publicUrl.pathname);

    let keyCandidate = valuePath;

    if (basePath) {
      if (valuePath === basePath) {
        return null;
      }

      if (!valuePath.startsWith(`${basePath}/`)) {
        return null;
      }

      keyCandidate = valuePath.slice(basePath.length + 1);
    }

    keyCandidate = keyCandidate
      .split('/')
      .map((segment) => this.safeDecode(segment))
      .join('/');

    return this.normalizeObjectKey(keyCandidate);
  }

  private normalizeObjectKey(value: string | null | undefined) {
    const normalized = (value ?? '').trim().replace(/^\/+/g, '');

    if (!normalized) {
      return null;
    }

    if (!normalized.startsWith(MANAGED_OBJECT_PREFIX)) {
      return null;
    }

    if (normalized.includes('..') || normalized.includes('\\')) {
      return null;
    }

    return normalized;
  }

  private resolveStorageConfig(): MediaStorageConfig {
    const endpoint = this.readRequiredEnv('MEDIA_S3_ENDPOINT');
    const bucket = this.readRequiredEnv('MEDIA_S3_BUCKET');
    const accessKey = this.readRequiredEnv('MEDIA_S3_ACCESS_KEY');
    const secretKey = this.readRequiredEnv('MEDIA_S3_SECRET_KEY');
    const region =
      this.normalizeOptionalString(this.configService.get<string>('MEDIA_S3_REGION')) ??
      'us-east-1';
    const forcePathStyle = this.parseBoolean(
      this.configService.get<string>('MEDIA_S3_FORCE_PATH_STYLE'),
      true
    );
    const uploadMaxBytes = this.parsePositiveInteger(
      this.configService.get<string>('MEDIA_UPLOAD_MAX_BYTES'),
      DEFAULT_UPLOAD_MAX_BYTES
    );
    const expiresCandidate = this.parsePositiveInteger(
      this.configService.get<string>('MEDIA_PRESIGN_EXPIRES_SECONDS'),
      DEFAULT_PRESIGN_EXPIRES_SECONDS
    );
    const presignExpiresSeconds = Math.min(
      MAX_PRESIGN_EXPIRES_SECONDS,
      Math.max(MIN_PRESIGN_EXPIRES_SECONDS, expiresCandidate)
    );
    const publicBaseUrl =
      this.normalizeOptionalString(this.configService.get<string>('MEDIA_S3_PUBLIC_BASE_URL')) ??
      `${this.trimTrailingSlash(endpoint)}/${bucket}`;

    return {
      endpoint,
      region,
      bucket,
      accessKey,
      secretKey,
      forcePathStyle,
      publicBaseUrl,
      uploadMaxBytes,
      presignExpiresSeconds
    };
  }

  private resolveS3Client(config: MediaStorageConfig) {
    const cacheKey = [
      config.endpoint,
      config.region,
      config.bucket,
      config.accessKey,
      String(config.forcePathStyle)
    ].join('|');

    if (this.clientCache?.cacheKey === cacheKey) {
      return this.clientCache.client;
    }

    const client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey
      },
      forcePathStyle: config.forcePathStyle
    });

    this.clientCache = {
      cacheKey,
      client
    };

    return client;
  }

  private readRequiredEnv(name: string) {
    const value = this.normalizeOptionalString(this.configService.get<string>(name));

    if (!value) {
      throw new ServiceUnavailableException(
        `Media storage is not configured. Missing ${name}.`
      );
    }

    return value;
  }

  private normalizeMimeType(value: string | null | undefined) {
    const mimeType = (value ?? '').trim().toLowerCase();

    if (mimeType !== STANDARD_UPLOAD_MIME_TYPE) {
      throw new BadRequestException('Only WebP uploads are supported.');
    }

    return mimeType;
  }

  private normalizeSizeBytes(value: number | null | undefined, maxSize: number) {
    if (!Number.isInteger(value) || (value ?? 0) <= 0) {
      throw new BadRequestException('Image size must be a positive integer.');
    }

    if ((value ?? 0) > maxSize) {
      throw new BadRequestException(
        `Image size must be at most ${Math.floor(maxSize / (1024 * 1024))} MB.`
      );
    }

    return value;
  }

  private normalizeScope(value: string | null | undefined) {
    const normalized = (value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

    return normalized.length > 0 ? normalized : DEFAULT_SCOPE;
  }

  private resolveExtension(filename: string | null | undefined, mimeType: string) {
    if (mimeType === STANDARD_UPLOAD_MIME_TYPE) {
      return '.webp';
    }

    const fileNameExtension = extname(filename ?? '').toLowerCase();
    return fileNameExtension || '.webp';
  }

  private createObjectKey(scope: string, extension: string) {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const nonce = randomUUID();

    return `${MANAGED_OBJECT_PREFIX}${scope}/${year}/${month}/${day}/${Date.now()}-${nonce}${extension}`;
  }

  private resolvePublicUrl(baseUrl: string, objectKey: string) {
    const encodedPath = objectKey
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    return `${this.trimTrailingSlash(baseUrl)}/${encodedPath}`;
  }

  private normalizeOptionalString(value: string | null | undefined) {
    const normalized = value?.trim() ?? '';
    return normalized.length > 0 ? normalized : null;
  }

  private parseBoolean(value: string | null | undefined, fallback: boolean) {
    if (value === undefined || value === null) {
      return fallback;
    }

    const normalized = value.trim().toLowerCase();

    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true;
    }

    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false;
    }

    return fallback;
  }

  private parsePositiveInteger(value: string | null | undefined, fallback: number) {
    if (!value) {
      return fallback;
    }

    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed <= 0) {
      return fallback;
    }

    return parsed;
  }

  private normalizeOptionalPositiveInteger(value: number | null | undefined) {
    if (!Number.isInteger(value) || (value ?? 0) <= 0) {
      return null;
    }

    return Number(value);
  }

  private resolveOrphanCleanupMinAgeHours(rawInput: number | null | undefined) {
    const provided = this.normalizeOptionalPositiveInteger(rawInput);
    if (provided !== null) {
      return this.clamp(
        provided,
        MIN_ORPHAN_CLEANUP_MIN_AGE_HOURS,
        MAX_ORPHAN_CLEANUP_MIN_AGE_HOURS
      );
    }

    const parsedFromEnv = this.parsePositiveInteger(
      this.configService.get<string>('MEDIA_ORPHAN_CLEANUP_MIN_AGE_HOURS'),
      DEFAULT_ORPHAN_CLEANUP_MIN_AGE_HOURS
    );

    return this.clamp(
      parsedFromEnv,
      MIN_ORPHAN_CLEANUP_MIN_AGE_HOURS,
      MAX_ORPHAN_CLEANUP_MIN_AGE_HOURS
    );
  }

  private trimTrailingSlash(value: string) {
    return value.replace(/\/+$/g, '');
  }

  private trimSlashes(value: string) {
    return value.replace(/^\/+|\/+$/g, '');
  }

  private safeDecode(value: string) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  private clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  private isMissingObjectError(error: unknown) {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const candidate = error as {
      name?: string;
      $metadata?: {
        httpStatusCode?: number;
      };
    };
    const errorName = candidate.name?.toLowerCase() ?? '';
    const statusCode = candidate.$metadata?.httpStatusCode;

    return (
      errorName === 'notfound' ||
      errorName === 'nosuchkey' ||
      statusCode === 404
    );
  }
}
