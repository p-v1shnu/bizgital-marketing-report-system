import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';

import {
  CurrentUser,
  type AuthenticatedRequestUser
} from '../auth/current-user.decorator';
import { BrandsService } from './brands.service';
import type {
  CreateBrandInput,
  CreateBrandCampaignInput,
  CreateCompanyFormatOptionInput,
  DeleteBrandInput,
  ReorderCompanyFormatOptionsInput,
  UpdateBrandInput,
  UpdateBrandCampaignInput,
  UpdateCompanyFormatOptionInput
} from './brands.types';

function normalizeOptionalActor(user: AuthenticatedRequestUser | undefined) {
  if (!user || user.internal) {
    return undefined;
  }

  return {
    actorName: user.displayName,
    actorEmail: user.email
  };
}

@Controller('brands')
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Get()
  listBrands(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.brandsService.listBrands(user);
  }

  @Post()
  createBrand(@Body() body: CreateBrandInput) {
    return this.brandsService.createBrand(body);
  }

  @Get(':brandCode')
  getBrand(
    @Param('brandCode') brandCode: string,
    @CurrentUser() user: AuthenticatedRequestUser
  ) {
    return this.brandsService.getBrandByCodeOrThrow(brandCode, user);
  }

  @Post(':brandCode')
  updateBrand(@Param('brandCode') brandCode: string, @Body() body: UpdateBrandInput) {
    return this.brandsService.updateBrand(brandCode, body);
  }

  @Delete(':brandCode')
  deleteBrand(@Param('brandCode') brandCode: string, @Body() body: DeleteBrandInput) {
    return this.brandsService.deleteBrand(brandCode, body);
  }

  @Get(':brandCode/memberships')
  async getBrandMemberships(
    @Param('brandCode') brandCode: string,
    @CurrentUser() user: AuthenticatedRequestUser
  ) {
    const brand = await this.brandsService.getBrandByCodeOrThrow(brandCode, user);

    return {
      brand: {
        id: brand.id,
        code: brand.code,
        name: brand.name
      },
      memberships: brand.memberships.map((membership) => ({
        id: membership.id,
        role: membership.role,
        permissions: membership.permissions,
        user: {
          id: membership.user.id,
          email: membership.user.email,
          displayName: membership.user.displayName,
          status: membership.user.status
        }
      }))
    };
  }

  @Get(':brandCode/internal-options')
  getCompanyFormatOptions(
    @Param('brandCode') brandCode: string,
    @Query('includeDeprecated') includeDeprecated?: string
  ) {
    return this.brandsService.getCompanyFormatOptions(
      brandCode,
      includeDeprecated === 'true'
    );
  }

  @Post(':brandCode/internal-options')
  createCompanyFormatOption(
    @Param('brandCode') brandCode: string,
    @Body() body: CreateCompanyFormatOptionInput
  ) {
    return this.brandsService.createCompanyFormatOption(brandCode, body);
  }

  @Post(':brandCode/internal-options/reorder')
  reorderCompanyFormatOptions(
    @Param('brandCode') brandCode: string,
    @Body() body: ReorderCompanyFormatOptionsInput
  ) {
    return this.brandsService.reorderCompanyFormatOptions(brandCode, body);
  }

  @Post(':brandCode/internal-options/:optionId')
  updateCompanyFormatOption(
    @Param('brandCode') brandCode: string,
    @Param('optionId') optionId: string,
    @Body() body: UpdateCompanyFormatOptionInput
  ) {
    return this.brandsService.updateCompanyFormatOption(brandCode, optionId, body);
  }

  @Delete(':brandCode/internal-options/:optionId')
  deleteCompanyFormatOption(
    @Param('brandCode') brandCode: string,
    @Param('optionId') optionId: string
  ) {
    return this.brandsService.deleteCompanyFormatOption(brandCode, optionId);
  }

  @Get(':brandCode/campaigns')
  listCampaigns(
    @Param('brandCode') brandCode: string,
    @Query('year') year?: string,
    @Query('includeInactive') includeInactive?: string,
    @CurrentUser() user?: AuthenticatedRequestUser
  ) {
    const parsedYear = year ? Number(year) : null;
    const resolvedYear =
      parsedYear !== null && Number.isFinite(parsedYear) ? parsedYear : undefined;

    return this.brandsService.listCampaigns(brandCode, {
      year: resolvedYear,
      includeInactive: includeInactive === 'true'
    }, user);
  }

  @Post(':brandCode/campaigns')
  createCampaign(
    @Param('brandCode') brandCode: string,
    @Body() body: CreateBrandCampaignInput,
    @CurrentUser() user?: AuthenticatedRequestUser
  ) {
    return this.brandsService.createCampaign(
      brandCode,
      body,
      normalizeOptionalActor(user),
      user
    );
  }

  @Post(':brandCode/campaigns/:campaignId')
  updateCampaign(
    @Param('brandCode') brandCode: string,
    @Param('campaignId') campaignId: string,
    @Body() body: UpdateBrandCampaignInput,
    @CurrentUser() user?: AuthenticatedRequestUser
  ) {
    return this.brandsService.updateCampaign(
      brandCode,
      campaignId,
      body,
      normalizeOptionalActor(user),
      user
    );
  }

  @Delete(':brandCode/campaigns/:campaignId')
  deleteCampaign(
    @Param('brandCode') brandCode: string,
    @Param('campaignId') campaignId: string,
    @CurrentUser() user?: AuthenticatedRequestUser
  ) {
    return this.brandsService.deleteCampaign(
      brandCode,
      campaignId,
      normalizeOptionalActor(user),
      user
    );
  }
}
