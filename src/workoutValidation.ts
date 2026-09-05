import { displayWeightToKilograms, type WeightUnit } from "./weightUnits";
import type { SavedWorkoutSet } from "./workoutHistory";

export const WORKOUT_NAME_MAX_LENGTH = 100;
export const TEMPLATE_NAME_MAX_LENGTH = 100;
export const EXERCISE_NAME_MAX_LENGTH = 100;

export type EditableSetFields = {
  weight: string;
  reps: string;
  rpe: string;
  complete: boolean;
};

export type SetFieldName = "weight" | "reps" | "rpe";
export type SetFieldErrors = Partial<Record<SetFieldName, string>>;

export type SetValidationResult = {
  errors: SetFieldErrors;
  canonicalSet: SavedWorkoutSet | null;
};

function parseNonblankFiniteNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateWorkoutName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "Enter a workout name.";
  if (trimmed.length > WORKOUT_NAME_MAX_LENGTH) {
    return `Workout name must be ${WORKOUT_NAME_MAX_LENGTH} characters or fewer.`;
  }
  return "";
}

export function validateTemplateName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "Enter a template name.";
  if (trimmed.length > TEMPLATE_NAME_MAX_LENGTH) {
    return `Template name must be ${TEMPLATE_NAME_MAX_LENGTH} characters or fewer.`;
  }
  return "";
}

export function validateExerciseName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "Enter an exercise name.";
  if (trimmed.length > EXERCISE_NAME_MAX_LENGTH) {
    return `Exercise name must be ${EXERCISE_NAME_MAX_LENGTH} characters or fewer.`;
  }
  return "";
}

export function validateEditableSet(
  set: EditableSetFields,
  weightUnit: WeightUnit,
): SetValidationResult {
  const errors: SetFieldErrors = {};
  const weightBlank = set.weight.trim() === "";
  const repsBlank = set.reps.trim() === "";
  const rpeBlank = set.rpe.trim() === "";

  const displayWeight = parseNonblankFiniteNumber(set.weight);
  const reps = parseNonblankFiniteNumber(set.reps);
  const rpe = parseNonblankFiniteNumber(set.rpe);

  let canonicalWeight: number | null = null;
  if (weightBlank) {
    if (set.complete) errors.weight = "Weight is required for a completed set.";
  } else if (displayWeight === null) {
    errors.weight = "Weight must be a finite number.";
  } else if (displayWeight < 0) {
    errors.weight = "Weight cannot be negative.";
  } else {
    canonicalWeight = displayWeightToKilograms(displayWeight, weightUnit);
    if (!Number.isFinite(canonicalWeight)) errors.weight = "Weight is too large to store safely.";
  }

  if (repsBlank) {
    if (set.complete) errors.reps = "Repetitions are required for a completed set.";
  } else if (reps === null) {
    errors.reps = "Repetitions must be a finite number.";
  } else if (reps <= 0) {
    errors.reps = "Repetitions must be greater than zero.";
  }

  if (!rpeBlank) {
    if (rpe === null) errors.rpe = "RPE must be a finite number.";
    else if (rpe < 1 || rpe > 10) errors.rpe = "RPE must be between 1 and 10.";
  }

  if (Object.keys(errors).length > 0) return { errors, canonicalSet: null };
  const canonicalSet: SavedWorkoutSet = {
    weight: weightBlank ? null : canonicalWeight,
    reps: repsBlank ? null : reps,
    rpe: rpeBlank ? null : rpe,
    complete: set.complete,
  };
  if (
    canonicalSet.complete &&
    canonicalSet.weight !== null &&
    canonicalSet.reps !== null &&
    !Number.isFinite(canonicalSet.weight * canonicalSet.reps)
  ) {
    return { errors: { weight: "Weight and repetitions produce an unsafe volume." }, canonicalSet: null };
  }
  return { errors, canonicalSet };
}

export function hasSetFieldErrors(errors: SetFieldErrors): boolean {
  return Object.values(errors).some(Boolean);
}

export function isRpeOutsideCurrentRange(value: number | null): boolean {
  return value !== null && Number.isFinite(value) && (value < 1 || value > 10);
}
