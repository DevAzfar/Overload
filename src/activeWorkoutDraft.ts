import type { ExerciseKind } from "./exercises";
import { getBrowserStorage, type StorageLike, type StorageLoadStatus } from "./storageTypes";
import type { WeightUnit } from "./weightUnits";
import { WORKOUT_NAME_MAX_LENGTH } from "./workoutValidation";
import {
  WORKOUT_CSV_MAX_EXERCISES_PER_WORKOUT,
  WORKOUT_CSV_MAX_SETS_PER_EXERCISE,
} from "./workoutCsv";

export const ACTIVE_WORKOUT_DRAFT_KEY = "overload-active-workout-draft-v1";
export const ACTIVE_WORKOUT_DRAFT_VERSION = 1;

const MAX_RAW_FIELD_LENGTH = 1_000;

export type ActiveWorkoutDraftSet = {
  id: string;
  weight: string;
  reps: string;
  rpe: string;
  complete: boolean;
};

export type ActiveWorkoutDraftExercise = {
  id: string;
  sessionId: string;
  name: string;
  muscle: string;
  equipment: string;
  kind: ExerciseKind;
  sets: ActiveWorkoutDraftSet[];
};

export type ActiveWorkoutDraft = {
  version: 1;
  workoutName: string;
  startedAt: number;
  weightUnit: WeightUnit;
  exercises: ActiveWorkoutDraftExercise[];
};

export type ActiveWorkoutDraftLoadResult = {
  draft: ActiveWorkoutDraft | null;
  status: StorageLoadStatus | "unsupported";
  message: string;
  rawValue: string | null;
};

export type ActiveWorkoutDraftMutationResult =
  | { ok: true; rawValue: string | null }
  | { ok: false; conflict: boolean; message: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, allowBlank = true): value is string {
  return typeof value === "string" && value.length <= MAX_RAW_FIELD_LENGTH && (allowBlank || value.trim().length > 0);
}

function isDraftSet(value: unknown): value is ActiveWorkoutDraftSet {
  return isObject(value) &&
    isBoundedString(value.id, false) &&
    isBoundedString(value.weight) &&
    isBoundedString(value.reps) &&
    isBoundedString(value.rpe) &&
    typeof value.complete === "boolean";
}

function isDraftExercise(value: unknown): value is ActiveWorkoutDraftExercise {
  if (!isObject(value) || !isBoundedString(value.id, false) || !isBoundedString(value.sessionId, false)) return false;
  if (!isBoundedString(value.name, false) || !isBoundedString(value.muscle, false) || !isBoundedString(value.equipment, false)) return false;
  if (value.kind !== "built-in" && value.kind !== "custom") return false;
  if (!Array.isArray(value.sets) || value.sets.length < 1 || value.sets.length > WORKOUT_CSV_MAX_SETS_PER_EXERCISE) return false;
  if (!value.sets.every(isDraftSet)) return false;
  return new Set(value.sets.map((set) => set.id)).size === value.sets.length;
}

export function isActiveWorkoutDraft(value: unknown): value is ActiveWorkoutDraft {
  if (!isObject(value) || value.version !== ACTIVE_WORKOUT_DRAFT_VERSION) return false;
  if (!isBoundedString(value.workoutName, false) || value.workoutName.trim() !== value.workoutName || value.workoutName.length > WORKOUT_NAME_MAX_LENGTH) return false;
  if (typeof value.startedAt !== "number" || !Number.isFinite(value.startedAt) || value.startedAt <= 0) return false;
  if (value.weightUnit !== "kg" && value.weightUnit !== "lb") return false;
  if (!Array.isArray(value.exercises) || value.exercises.length > WORKOUT_CSV_MAX_EXERCISES_PER_WORKOUT) return false;
  if (!value.exercises.every(isDraftExercise)) return false;
  if (new Set(value.exercises.map((exercise) => exercise.sessionId)).size !== value.exercises.length) return false;
  const setIds = value.exercises.flatMap((exercise) => exercise.sets.map((set) => set.id));
  return new Set(setIds).size === setIds.length;
}

export function activeDraftHasEnteredData(draft: Pick<ActiveWorkoutDraft, "exercises">): boolean {
  return draft.exercises.some((exercise) =>
    exercise.sets.some((set) =>
      set.complete || Boolean(set.weight.trim() || set.reps.trim() || set.rpe.trim()),
    ),
  );
}

export function activeDraftIsMeaningful(draft: Pick<ActiveWorkoutDraft, "exercises">): boolean {
  return draft.exercises.length > 0 || activeDraftHasEnteredData(draft);
}

export function calculateActiveWorkoutElapsedSeconds(startedAt: number, referenceTime = Date.now()): number {
  if (!Number.isFinite(startedAt) || !Number.isFinite(referenceTime)) return 0;
  return Math.max(0, Math.floor((referenceTime - startedAt) / 1_000));
}

export function serialiseActiveWorkoutDraft(draft: ActiveWorkoutDraft): string {
  if (!isActiveWorkoutDraft(draft)) throw new Error("The active workout draft is not structurally valid.");
  return JSON.stringify(draft);
}

export function loadActiveWorkoutDraft(storage: StorageLike = getBrowserStorage()): ActiveWorkoutDraftLoadResult {
  let rawValue: string | null;
  try {
    rawValue = storage.getItem(ACTIVE_WORKOUT_DRAFT_KEY);
  } catch {
    return {
      draft: null,
      status: "unavailable",
      message: "Overload could not read the active-workout draft. Reload after restoring storage access; no stored draft was overwritten.",
      rawValue: null,
    };
  }
  if (rawValue === null) return { draft: null, status: "missing", message: "", rawValue: null };

  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (isObject(parsed) && typeof parsed.version === "number" && parsed.version !== ACTIVE_WORKOUT_DRAFT_VERSION) {
      return {
        draft: null,
        status: "unsupported",
        message: `A saved workout draft uses unsupported version ${parsed.version}. It was not loaded or overwritten.`,
        rawValue,
      };
    }
    if (!isActiveWorkoutDraft(parsed)) {
      return {
        draft: null,
        status: "corrupt",
        message: "A saved workout draft is unreadable or invalid. It was not loaded or overwritten.",
        rawValue,
      };
    }
    return { draft: parsed, status: "loaded", message: "", rawValue };
  } catch {
    return {
      draft: null,
      status: "corrupt",
      message: "A saved workout draft contains invalid data. It was not loaded or overwritten.",
      rawValue,
    };
  }
}

export function saveActiveWorkoutDraft(
  draft: ActiveWorkoutDraft,
  expectedRawValue: string | null,
  storage: StorageLike = getBrowserStorage(),
): ActiveWorkoutDraftMutationResult {
  let rawValue: string;
  try {
    rawValue = serialiseActiveWorkoutDraft(draft);
    if (storage.getItem(ACTIVE_WORKOUT_DRAFT_KEY) !== expectedRawValue) {
      return { ok: false, conflict: true, message: "The saved workout draft changed in another browser tab. This local workout was not written over it." };
    }
    storage.setItem(ACTIVE_WORKOUT_DRAFT_KEY, rawValue);
    return { ok: true, rawValue };
  } catch {
    return { ok: false, conflict: false, message: "Overload could not save the latest workout draft. Keep this tab open while storage is unavailable." };
  }
}

export function removeActiveWorkoutDraft(
  expectedRawValue: string | null,
  storage: StorageLike = getBrowserStorage(),
): ActiveWorkoutDraftMutationResult {
  try {
    if (storage.getItem(ACTIVE_WORKOUT_DRAFT_KEY) !== expectedRawValue) {
      return { ok: false, conflict: true, message: "The saved workout draft changed in another browser tab and was not discarded." };
    }
    storage.removeItem(ACTIVE_WORKOUT_DRAFT_KEY);
    return { ok: true, rawValue: null };
  } catch {
    return { ok: false, conflict: false, message: "Overload could not remove the saved workout draft. It remains available for recovery." };
  }
}

export function removeDraftSet(
  exercises: ActiveWorkoutDraftExercise[],
  sessionId: string,
  setId: string,
): ActiveWorkoutDraftExercise[] {
  return exercises.map((exercise) => {
    if (exercise.sessionId !== sessionId || exercise.sets.length <= 1) return exercise;
    return { ...exercise, sets: exercise.sets.filter((set) => set.id !== setId) };
  });
}

export function removeDraftExercise(
  exercises: ActiveWorkoutDraftExercise[],
  sessionId: string,
): ActiveWorkoutDraftExercise[] {
  return exercises.filter((exercise) => exercise.sessionId !== sessionId);
}
