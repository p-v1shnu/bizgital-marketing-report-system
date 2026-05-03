export function formatValue(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return 'N/A';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value % 1 === 0 ? 0 : 2
  }).format(value);
}

export function formatChangePercent(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return 'N/A';
  }

  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

export function formatSignedDelta(
  currentValue: number | null,
  previousValue: number | null
) {
  if (
    currentValue === null ||
    previousValue === null ||
    Number.isNaN(currentValue) ||
    Number.isNaN(previousValue)
  ) {
    return 'N/A';
  }

  const delta = currentValue - previousValue;
  const sign = delta > 0 ? '+' : '';
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: delta % 1 === 0 ? 0 : 2
  }).format(delta);

  return `${sign}${formatted}`;
}

export function calculatePercentChange(
  currentValue: number | null,
  previousValue: number | null
) {
  if (
    currentValue === null ||
    previousValue === null ||
    Number.isNaN(currentValue) ||
    Number.isNaN(previousValue) ||
    previousValue === 0
  ) {
    return null;
  }

  return ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
}
