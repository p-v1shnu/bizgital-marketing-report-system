export const MIN_REPORTING_YEAR = 2000;
export const MAX_REPORTING_YEAR = 3000;
export const REPORTING_YEAR_LOOKAHEAD = 5;

type BuildRollingYearValuesOptions = {
  currentYear?: number;
  lookahead?: number;
  minYear?: number;
  maxYear?: number;
};

export function buildRollingYearValues(
  seedYears: Iterable<number>,
  options: BuildRollingYearValuesOptions = {}
) {
  const currentYear = options.currentYear ?? new Date().getUTCFullYear();
  const lookahead = options.lookahead ?? REPORTING_YEAR_LOOKAHEAD;
  const minYear = options.minYear ?? MIN_REPORTING_YEAR;
  const maxYear = options.maxYear ?? MAX_REPORTING_YEAR;

  const years = new Set<number>();
  for (const year of seedYears) {
    if (Number.isInteger(year)) {
      years.add(year);
    }
  }
  for (let year = currentYear; year <= currentYear + lookahead; year += 1) {
    years.add(year);
  }

  return Array.from(years)
    .filter((year) => year >= minYear && year <= maxYear)
    .sort((left, right) => right - left);
}
