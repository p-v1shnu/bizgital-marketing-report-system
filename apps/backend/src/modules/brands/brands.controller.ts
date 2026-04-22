import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';

import { BrandsService } from './brands.service';
import type {
  CreateBrandInput,
  CreateCompanyFormatOptionInput,
  DeleteBrandInput,
  ReorderCompanyFormatOptionsInput,
  UpdateBrandInput,
  UpdateCompanyFormatOptionInput
} from './brands.types';

@Controller('brands')
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Get()
  listBrands() {
    return this.brandsService.listBrands();
  }

  @Post()
  createBrand(@Body() body: CreateBrandInput) {
    return this.brandsService.createBrand(body);
  }

  @Get(':brandCode')
  getBrand(@Param('brandCode') brandCode: string) {
    return this.brandsService.getBrandByCodeOrThrow(brandCode);
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
  async getBrandMemberships(@Param('brandCode') brandCode: string) {
    const brand = await this.brandsService.getBrandByCodeOrThrow(brandCode);

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
}
