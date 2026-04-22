import {
  Controller,
  Get,
  Param,
  ParseFilePipeBuilder,
  Post,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { getImportStorageRoot } from './import-storage';
import { ImportsService } from './imports.service';

@Controller('brands/:brandId/reporting-periods/:periodId/import-jobs')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Get()
  listImportJobs(
    @Param('brandId') brandCode: string,
    @Param('periodId') periodId: string
  ) {
    return this.importsService.listImportJobs(brandCode, periodId);
  }

  @Get('preview')
  getLatestImportPreview(
    @Param('brandId') brandCode: string,
    @Param('periodId') periodId: string
  ) {
    return this.importsService.getLatestImportPreview(brandCode, periodId);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (request, _file, callback) => {
          const brandCode = String(request.params.brandId);
          const periodId = String(request.params.periodId);
          const storageRoot = getImportStorageRoot();
          const targetDirectory = join(storageRoot, brandCode, periodId);

          mkdirSync(targetDirectory, { recursive: true });
          callback(null, targetDirectory);
        },
        filename: (_request, file, callback) => {
          const extension = extname(file.originalname).toLowerCase();
          callback(null, `${Date.now()}-${randomUUID()}${extension}`);
        }
      })
    })
  )
  uploadImportJob(
    @Param('brandId') brandCode: string,
    @Param('periodId') periodId: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({
          maxSize: 25 * 1024 * 1024
        })
        .build({
          fileIsRequired: true
        })
    )
    file: Express.Multer.File
  ) {
    return this.importsService.createImportJob(brandCode, periodId, file);
  }
}
