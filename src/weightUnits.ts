export type WeightUnit = "kg" | "lb";

export const KILOGRAMS_TO_POUNDS = 2.2046226218;

export function kilogramsToDisplayWeight(valueInKilograms: number, unit: WeightUnit): number {
  return unit === "lb" ? valueInKilograms * KILOGRAMS_TO_POUNDS : valueInKilograms;
}

export function displayWeightToKilograms(displayValue: number, unit: WeightUnit): number {
  return unit === "lb" ? displayValue / KILOGRAMS_TO_POUNDS : displayValue;
}

export function formatDisplayNumber(value: number, maximumFractionDigits = 2): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1_000_000_000) return value.toExponential(Math.min(maximumFractionDigits, 2));
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits }).format(value);
}

export function formatWeightFromKilograms(
  valueInKilograms: number,
  unit: WeightUnit,
  maximumFractionDigits = 2,
): string {
  return `${formatDisplayNumber(kilogramsToDisplayWeight(valueInKilograms, unit), maximumFractionDigits)} ${unit}`;
}

export function formatVolumeFromKilograms(
  valueInKilograms: number,
  unit: WeightUnit,
  maximumFractionDigits = 2,
): string {
  return formatWeightFromKilograms(valueInKilograms, unit, maximumFractionDigits);
}

export function formatCompactVolumeFromKilograms(valueInKilograms: number, unit: WeightUnit): string {
  const displayValue = kilogramsToDisplayWeight(valueInKilograms, unit);
  if (!Number.isFinite(displayValue)) return `— ${unit}`;
  if (displayValue >= 1_000_000) return `${formatDisplayNumber(displayValue / 1_000_000, 1)}M ${unit}`;
  if (displayValue >= 1_000) return `${formatDisplayNumber(displayValue / 1_000, 1)}k ${unit}`;
  return `${formatDisplayNumber(displayValue, 1)} ${unit}`;
}

export function formatWeightInputFromKilograms(valueInKilograms: number, unit: WeightUnit): string {
  const displayValue = kilogramsToDisplayWeight(valueInKilograms, unit);
  if (!Number.isFinite(displayValue)) return "";
  return String(Number(displayValue.toFixed(4)));
}
