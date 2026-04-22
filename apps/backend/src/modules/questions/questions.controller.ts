import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';

import { QuestionsService } from './questions.service';
import type {
  SaveQuestionAssignmentsInput,
  SaveQuestionEntryInput,
  SaveQuestionHighlightsInput,
  SaveQuestionMasterInput,
  UpdateQuestionMasterInput
} from './questions.types';

@Controller('brands/:brandId/reporting-periods/:periodId/questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Get()
  getOverview(
    @Param('brandId') brandCode: string,
    @Param('periodId') periodId: string
  ) {
    return this.questionsService.getOverview(brandCode, periodId);
  }

  @Post('highlights')
  saveHighlights(
    @Param('brandId') brandCode: string,
    @Param('periodId') periodId: string,
    @Body() body: SaveQuestionHighlightsInput
  ) {
    return this.questionsService.saveHighlights(brandCode, periodId, body);
  }

  @Post(':activationId')
  saveEvidence(
    @Param('brandId') brandCode: string,
    @Param('periodId') periodId: string,
    @Param('activationId') activationId: string,
    @Body() body: SaveQuestionEntryInput
  ) {
    return this.questionsService.saveEntry(brandCode, periodId, activationId, body);
  }
}

@Controller('brands/:brandId/question-setup')
export class QuestionSetupController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Get()
  getSetup(@Param('brandId') brandCode: string) {
    return this.questionsService.getSetup(brandCode);
  }

  @Post('assignments')
  saveAssignments(
    @Param('brandId') brandCode: string,
    @Body() body: SaveQuestionAssignmentsInput
  ) {
    return this.questionsService.saveAssignments(brandCode, body.questionIds ?? []);
  }
}

@Controller('config/questions/catalog')
export class QuestionCatalogController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Get()
  getCatalog() {
    return this.questionsService.getGlobalCatalog();
  }

  @Post()
  createMaster(@Body() body: SaveQuestionMasterInput) {
    return this.questionsService.createGlobalMaster(body);
  }

  @Patch(':questionId')
  updateMaster(
    @Param('questionId') questionId: string,
    @Body() body: UpdateQuestionMasterInput
  ) {
    return this.questionsService.updateGlobalMaster(questionId, body);
  }

  @Delete(':questionId')
  deleteMaster(@Param('questionId') questionId: string) {
    return this.questionsService.deleteGlobalMaster(questionId);
  }
}
