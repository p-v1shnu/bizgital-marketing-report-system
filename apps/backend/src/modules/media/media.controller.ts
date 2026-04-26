import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { MediaService } from './media.service';
import type {
  CleanupMediaOrphansInput,
  CreateMediaPresignReadInput,
  CreateMediaPresignUploadInput,
  DeleteMediaObjectInput
} from './media.types';

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('presign-upload')
  createPresignedUpload(
    @Body() body: CreateMediaPresignUploadInput,
    @Headers('cookie') cookieHeader?: string
  ) {
    return this.mediaService.createPresignedUpload(body, cookieHeader ?? '');
  }

  @Post('presign-read')
  createPresignedRead(
    @Body() body: CreateMediaPresignReadInput,
    @Headers('cookie') cookieHeader?: string
  ) {
    return this.mediaService.createPresignedRead(body, cookieHeader ?? '');
  }

  @Post('delete-object')
  deleteObject(
    @Body() body: DeleteMediaObjectInput,
    @Headers('cookie') cookieHeader?: string
  ) {
    return this.mediaService.deleteObject(body, cookieHeader ?? '');
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadManagedMedia(
    @UploadedFile()
    file:
      | {
          originalname?: string;
          mimetype?: string;
          size?: number;
          buffer?: Buffer;
        }
      | undefined,
    @Body('scope') scope?: string,
    @Headers('cookie') cookieHeader?: string
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Image file is required.');
    }

    return this.mediaService.uploadManagedMedia(
      {
        scope: scope ?? null,
        filename: file.originalname ?? null,
        mimeType: file.mimetype ?? null,
        sizeBytes: file.size ?? null,
        buffer: file.buffer
      },
      cookieHeader ?? ''
    );
  }

  @Post('cleanup-orphans')
  cleanupOrphans(
    @Body() body: CleanupMediaOrphansInput = {},
    @Headers('cookie') cookieHeader?: string
  ) {
    return this.mediaService.cleanupOrphansViaHttp(body, cookieHeader ?? '');
  }
}
