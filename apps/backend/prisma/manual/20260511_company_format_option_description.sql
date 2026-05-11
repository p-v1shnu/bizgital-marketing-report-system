ALTER TABLE brand_dropdown_options
  ADD COLUMN description TEXT NULL AFTER label;

ALTER TABLE global_company_format_options
  ADD COLUMN description TEXT NULL AFTER label;
