import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';

import type {
  CreateImportColumnMappingDraftFromHeadersInput,
  CreateComputedFormulaInput,
  CreateGlobalCompanyFormatOptionInput,
  ImportColumnMappingConfigResponse,
  ImportTableLayoutResponse,
  PublishImportColumnMappingInput,
  PreviewComputedFormulaInput,
  ReorderGlobalCompanyFormatOptionsInput,
  RollbackImportColumnMappingInput,
  TopContentDataSourcePolicyResponse,
  UpdateImportColumnMappingDraftInput,
  UpdateImportTableLayoutInput,
  UpdateComputedFormulaInput,
  UpdateEngagementFormulaInput,
  UpdateGlobalCompanyFormatOptionInput,
  UpdateTopContentDataSourcePolicyInput
} from './column-config.types';
import { ColumnConfigService } from './column-config.service';

@Controller('config')
export class ColumnConfigController {
  constructor(private readonly columnConfigService: ColumnConfigService) {}

  @Get('internal-options')
  getCompanyFormatOptions(@Query('includeDeprecated') includeDeprecated?: string) {
    return this.columnConfigService.getGlobalCompanyFormatOptions(
      includeDeprecated === 'true'
    );
  }

  @Post('internal-options')
  createCompanyFormatOption(@Body() body: CreateGlobalCompanyFormatOptionInput) {
    return this.columnConfigService.createGlobalCompanyFormatOption(body);
  }

  @Post('internal-options/reorder')
  reorderCompanyFormatOptions(@Body() body: ReorderGlobalCompanyFormatOptionsInput) {
    return this.columnConfigService.reorderGlobalCompanyFormatOptions(body);
  }

  @Post('internal-options/:optionId')
  updateCompanyFormatOption(
    @Param('optionId') optionId: string,
    @Body() body: UpdateGlobalCompanyFormatOptionInput
  ) {
    return this.columnConfigService.updateGlobalCompanyFormatOption(optionId, body);
  }

  @Delete('internal-options/:optionId')
  deleteCompanyFormatOption(@Param('optionId') optionId: string) {
    return this.columnConfigService.deleteGlobalCompanyFormatOption(optionId);
  }

  @Get('computed-columns/engagement')
  getEngagementFormula() {
    return this.columnConfigService.getEngagementFormula();
  }

  @Post('computed-columns/engagement')
  updateEngagementFormula(@Body() body: UpdateEngagementFormulaInput) {
    return this.columnConfigService.updateEngagementFormula(body);
  }

  @Get('meta-columns')
  getMetaColumnCatalog(@Query('limit') limit?: string) {
    return this.columnConfigService.getMetaColumnCatalog(
      limit ? Number(limit) : undefined
    );
  }

  @Get('computed-formulas')
  listComputedFormulas(@Query('activeOnly') activeOnly?: string) {
    return this.columnConfigService.listComputedFormulas(activeOnly === 'true');
  }

  @Post('computed-formulas')
  createComputedFormula(@Body() body: CreateComputedFormulaInput) {
    return this.columnConfigService.createComputedFormula(body);
  }

  @Post('computed-formulas/preview')
  previewComputedFormula(@Body() body: PreviewComputedFormulaInput) {
    return this.columnConfigService.previewComputedFormula(body);
  }

  @Post('computed-formulas/:formulaId')
  updateComputedFormula(
    @Param('formulaId') formulaId: string,
    @Body() body: UpdateComputedFormulaInput
  ) {
    return this.columnConfigService.updateComputedFormula(formulaId, body);
  }

  @Delete('computed-formulas/:formulaId')
  deleteComputedFormula(@Param('formulaId') formulaId: string) {
    return this.columnConfigService.deleteComputedFormula(formulaId);
  }

  @Get('import-table-layout')
  getImportTableLayout(): Promise<ImportTableLayoutResponse> {
    return this.columnConfigService.getImportTableLayout();
  }

  @Post('import-table-layout')
  updateImportTableLayout(@Body() body: UpdateImportTableLayoutInput) {
    return this.columnConfigService.updateImportTableLayout(body);
  }

  @Get('top-content-data-source-policy')
  getTopContentDataSourcePolicy(): Promise<TopContentDataSourcePolicyResponse> {
    return this.columnConfigService.getTopContentDataSourcePolicy();
  }

  @Post('top-content-data-source-policy')
  updateTopContentDataSourcePolicy(@Body() body: UpdateTopContentDataSourcePolicyInput) {
    return this.columnConfigService.updateTopContentDataSourcePolicy(body);
  }

  @Get('import-column-mapping')
  getImportColumnMappingConfig(): Promise<ImportColumnMappingConfigResponse> {
    return this.columnConfigService.getImportColumnMappingConfig();
  }

  @Post('import-column-mapping/draft/from-headers')
  createImportColumnMappingDraftFromHeaders(
    @Body() body: CreateImportColumnMappingDraftFromHeadersInput
  ) {
    return this.columnConfigService.createImportColumnMappingDraftFromHeaders(body);
  }

  @Post('import-column-mapping/draft')
  updateImportColumnMappingDraft(@Body() body: UpdateImportColumnMappingDraftInput) {
    return this.columnConfigService.updateImportColumnMappingDraft(body);
  }

  @Post('import-column-mapping/draft/discard')
  discardImportColumnMappingDraft() {
    return this.columnConfigService.discardImportColumnMappingDraft();
  }

  @Post('import-column-mapping/publish')
  publishImportColumnMapping(@Body() body: PublishImportColumnMappingInput) {
    return this.columnConfigService.publishImportColumnMapping(body);
  }

  @Post('import-column-mapping/rollback')
  rollbackImportColumnMapping(@Body() body: RollbackImportColumnMappingInput) {
    return this.columnConfigService.rollbackImportColumnMapping(body);
  }
}
