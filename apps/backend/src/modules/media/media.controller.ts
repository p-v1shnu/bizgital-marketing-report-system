import { Body, Controller, Post } from '@nestjs/common';

import { MediaService } from './media.service';
import type {
  CleanupMediaOrphansInput,
  CreateMediaPresignUploadInput,
  DeleteMediaObjectInput
} from './media.types';

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('presign-upload')
  createPresignedUpload(@Body() body: CreateMediaPresignUploadInput) {
    return this.mediaService.createPresignedUpload(body);
  }

  @Post('delete-object')
  deleteObject(@Body() body: DeleteMediaObjectInput) {
    return this.mediaService.deleteObject(body);
  }

  @Post('cleanup-orphans')
  cleanupOrphans(@Body() body: CleanupMediaOrphansInput = {}) {
    return this.mediaService.cleanupOrphans(body);
  }
}
