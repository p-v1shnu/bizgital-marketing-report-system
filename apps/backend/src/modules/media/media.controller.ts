import { Body, Controller, Headers, Post } from '@nestjs/common';

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

  @Post('cleanup-orphans')
  cleanupOrphans(
    @Body() body: CleanupMediaOrphansInput = {},
    @Headers('cookie') cookieHeader?: string
  ) {
    return this.mediaService.cleanupOrphansViaHttp(body, cookieHeader ?? '');
  }
}
