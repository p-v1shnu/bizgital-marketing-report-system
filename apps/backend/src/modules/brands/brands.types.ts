import type {
  BrandStatus,
  BrandDropdownFieldKey,
  BrandDropdownOptionStatus
} from '@prisma/client';

export type CompanyFormatOptionsResponse = {
  brand: {
    id: string;
    code: string;
    name: string;
  };
  fields: Array<{
    key: BrandDropdownFieldKey;
    label: string;
    options: Array<{
      id: string;
      fieldKey: BrandDropdownFieldKey;
      valueKey: string;
      label: string;
      status: BrandDropdownOptionStatus;
      sortOrder: number;
    }>;
  }>;
};

export type CreateCompanyFormatOptionInput = {
  fieldKey: BrandDropdownFieldKey;
  label: string;
};

export type UpdateCompanyFormatOptionInput = {
  label?: string;
  status?: BrandDropdownOptionStatus;
};

export type ReorderCompanyFormatOptionsInput = {
  fieldKey: BrandDropdownFieldKey;
  optionIds: string[];
};

export type CreateBrandInput = {
  code?: string;
  name: string;
  timezone?: string;
  status?: BrandStatus;
  logoUrl?: string | null;
  responsibleUserIds?: string[];
  actorName?: string;
  actorEmail?: string;
};

export type UpdateBrandInput = {
  name?: string;
  timezone?: string;
  status?: BrandStatus;
  logoUrl?: string | null;
  responsibleUserIds?: string[];
  actorName?: string;
  actorEmail?: string;
};

export type DeleteBrandInput = {
  actorName?: string;
  actorEmail?: string;
};
