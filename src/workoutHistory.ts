import { getBrowserStorage, type StorageLike, type StorageLoadResult } from "./storageTypes";

export const WORKOUT_HISTORY_KEY = "lift-off-workouts-v1";
export const PREVIOUS_SETS_KEY = "lift-off-previous-sets";

export type PreviousSet = {
  weight: number;
  reps: number;
};

export type PreviousSetsByExercise = Record<string, PreviousSet[]>;

export type SavedWorkoutSet = {
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  complete: boolean;
};

export type SavedWorkoutExercise = {
  exerciseId: string;
  name: string;
  muscle: string;
  equipment: string;
  sets: SavedWorkoutSet[];
};

export type SavedWorkout = {
  id: string;
  name: string;
  startedAt: string;
  finishedAt: string;
  durationSeconds: number;
  exercises: SavedWorkoutExercise[];
  totalVolume: number;
  exerciseCount: number;
  completedSetCount: number;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isValidDateString(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isSavedWorkoutSet(value: unknown): value is SavedWorkoutSet {
  if (!isObject(value)) return false;
  const { weight, reps, rpe, complete } = value;

  if (!isNullableFiniteNumber(weight)) return false;
  if (!isNullableFiniteNumber(reps)) return false;
  if (!isNullableFiniteNumber(rpe)) return false;
  if (typeof complete !== "boolean") return false;
  if (!complete) return true;

  return weight !== null && weight >= 0 && reps !== null && reps > 0;
}

function isSavedWorkoutExercise(value: unknown): value is SavedWorkoutExercise {
  return (
    isObject(value) &&
    typeof value.exerciseId === "string" &&
    typeof value.name === "string" &&
    typeof value.muscle === "string" &&
    typeof value.equipment === "string" &&
    Array.isArray(value.sets) &&
    value.sets.every(isSavedWorkoutSet)
  );
}

type LoadCompatibleWorkout = {
  workout: SavedWorkout;
  summaryMismatch: boolean;
  legacyRpeCount: number;
};

function toLoadCompatibleWorkout(value: unknown): LoadCompatibleWorkout | null {
  if (!isObject(value) || typeof value.id !== "string" || typeof value.name !== "string") return null;
  if (!isValidDateString(value.startedAt) || !isValidDateString(value.finishedAt)) return null;
  if (!isFiniteNumber(value.durationSeconds) || value.durationSeconds < 0) return null;
  if (!Array.isArray(value.exercises) || !value.exercises.every(isSavedWorkoutExercise)) return null;

  const exercises = value.exercises.map((exercise) => ({
    ...exercise,
    sets: exercise.sets.map((set) => ({ ...set })),
  }));
  const calculatedSummary = calculateSavedWorkoutSummary(exercises);
  const summaryMismatch = value.totalVolume !== calculatedSummary.totalVolume ||
    value.exerciseCount !== calculatedSummary.exerciseCount ||
    value.completedSetCount !== calculatedSummary.completedSetCount;
  const legacyRpeCount = exercises.reduce(
    (count, exercise) => count + exercise.sets.filter(
      (set) => set.rpe !== null && (set.rpe < 1 || set.rpe > 10),
    ).length,
    0,
  );

  return {
    workout: {
      id: value.id,
      name: value.name,
      startedAt: value.startedAt,
      finishedAt: value.finishedAt,
      durationSeconds: value.durationSeconds,
      exercises,
      ...calculatedSummary,
    },
    summaryMismatch,
    legacyRpeCount,
  };
}

export function isSavedWorkout(value: unknown): value is SavedWorkout {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isValidDateString(value.startedAt) &&
    isValidDateString(value.finishedAt) &&
    isFiniteNumber(value.durationSeconds) &&
    value.durationSeconds >= 0 &&
    Array.isArray(value.exercises) &&
    value.exercises.every(isSavedWorkoutExercise) &&
    isFiniteNumber(value.totalVolume) &&
    value.totalVolume >= 0 &&
    typeof value.exerciseCount === "number" &&
    Number.isInteger(value.exerciseCount) &&
    value.exerciseCount >= 0 &&
    typeof value.completedSetCount === "number" &&
    Number.isInteger(value.completedSetCount) &&
    value.completedSetCount > 0
  );
}

export function isValidCompletedSavedSet(set: SavedWorkoutSet): boolean {
  return (
    set.complete &&
    set.weight !== null &&
    Number.isFinite(set.weight) &&
    set.weight >= 0 &&
    set.reps !== null &&
    Number.isFinite(set.reps) &&
    set.reps > 0 &&
    Number.isFinite(set.weight * set.reps) &&
    (set.rpe === null || Number.isFinite(set.rpe))
  );
}

export function calculateSavedWorkoutSummary(exercises: SavedWorkoutExercise[]): {
  totalVolume: number;
  exerciseCount: number;
  completedSetCount: number;
} {
  const completedSets = exercises.flatMap((exercise) => exercise.sets.filter(isValidCompletedSavedSet));
  const totalVolume = completedSets.reduce((total, set) => {
    const nextTotal = total + set.weight! * set.reps!;
    return Number.isFinite(nextTotal) ? nextTotal : Number.MAX_VALUE;
  }, 0);

  return {
    totalVolume,
    exerciseCount: exercises.length,
    completedSetCount: completedSets.length,
  };
}

function safelyRemoveItem(key: string, storage: StorageLike) {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function loadWorkoutHistoryResult(
  storage: StorageLike = getBrowserStorage(),
): StorageLoadResult<SavedWorkout[]> {
  let rawHistory: string | null;

  try {
    rawHistory = storage.getItem(WORKOUT_HISTORY_KEY);
  } catch {
    return {
      data: [],
      status: "unavailable",
      message: "Lift Off could not read workout History from device storage. The empty state may not reflect the data stored on this device.",
      rawValue: null,
    };
  }

  if (rawHistory === null) return { data: [], status: "missing", message: "", rawValue: null };

  try {
    const parsed: unknown = JSON.parse(rawHistory);

    if (!Array.isArray(parsed)) {
      const removed = safelyRemoveItem(WORKOUT_HISTORY_KEY, storage);
      return {
        data: [],
        status: removed ? "corrupt" : "recovery-failed",
        message: removed
          ? "Corrupt workout History was removed. No valid workouts could be recovered."
          : "Workout History is corrupt and could not be removed because device storage is unavailable.",
        rawValue: rawHistory,
      };
    }

    const compatible = parsed
      .map(toLoadCompatibleWorkout)
      .filter((entry): entry is LoadCompatibleWorkout => entry !== null)
      .sort((first, second) => Date.parse(second.workout.startedAt) - Date.parse(first.workout.startedAt));
    const ignoredInvalidCount = parsed.length - compatible.length;
    const seenIds = new Set<string>();
    let duplicateCount = 0;
    const recoveredHistory = compatible.flatMap((entry) => {
      if (seenIds.has(entry.workout.id)) {
        duplicateCount += 1;
        return [];
      }
      seenIds.add(entry.workout.id);
      return [entry.workout];
    });
    const summaryMismatchCount = compatible.filter((entry) => entry.summaryMismatch).length;
    const legacyRpeCount = compatible.reduce((count, entry) => count + entry.legacyRpeCount, 0);
    const warnings: string[] = [];
    if (ignoredInvalidCount > 0) warnings.push(`${ignoredInvalidCount} unreadable workout ${ignoredInvalidCount === 1 ? "record was" : "records were"} ignored`);
    if (duplicateCount > 0) warnings.push(`${duplicateCount} older duplicate workout ${duplicateCount === 1 ? "record was" : "records were"} ignored`);
    if (summaryMismatchCount > 0) warnings.push(`${summaryMismatchCount} workout ${summaryMismatchCount === 1 ? "summary was" : "summaries were"} recalculated for display`);
    if (legacyRpeCount > 0) warnings.push(`${legacyRpeCount} legacy RPE ${legacyRpeCount === 1 ? "value is" : "values are"} outside the current 1–10 range`);

    return {
      data: recoveredHistory,
      status: warnings.length > 0 ? "recovered" : "loaded",
      message: warnings.length > 0
        ? `Workout History was partially recovered: ${warnings.join("; ")}. Storage was not rewritten. A successful explicit History change will save only the visible recovered workouts.`
        : "",
      rawValue: rawHistory,
      discardedItemCount: ignoredInvalidCount + duplicateCount,
    };
  } catch {
    const removed = safelyRemoveItem(WORKOUT_HISTORY_KEY, storage);
    return {
      data: [],
      status: removed ? "corrupt" : "recovery-failed",
      message: removed
        ? "Corrupt workout History JSON was removed. No valid workouts could be recovered."
        : "Workout History contains corrupt JSON and could not be removed because device storage is unavailable.",
      rawValue: rawHistory,
    };
  }
}

export function loadWorkoutHistory(): SavedWorkout[] {
  return loadWorkoutHistoryResult().data;
}

export function saveWorkoutHistory(history: SavedWorkout[], storage: StorageLike = getBrowserStorage()): boolean {
  try {
    storage.setItem(WORKOUT_HISTORY_KEY, JSON.stringify(history));
    return true;
  } catch {
    return false;
  }
}

function isPreviousSet(value: unknown): value is PreviousSet {
  return (
    isObject(value) &&
    isFiniteNumber(value.weight) &&
    value.weight >= 0 &&
    isFiniteNumber(value.reps) &&
    value.reps > 0
  );
}

export function loadPreviousSetsResult(
  storage: StorageLike = getBrowserStorage(),
): StorageLoadResult<PreviousSetsByExercise> {
  let rawPrevious: string | null;

  try {
    rawPrevious = storage.getItem(PREVIOUS_SETS_KEY);
  } catch {
    return {
      data: {},
      status: "unavailable",
      message: "Lift Off could not read previous-set data from device storage.",
      rawValue: null,
    };
  }

  if (rawPrevious === null) return { data: {}, status: "missing", message: "", rawValue: null };

  try {
    const parsed: unknown = JSON.parse(rawPrevious);
    if (!isObject(parsed)) {
      const removed = safelyRemoveItem(PREVIOUS_SETS_KEY, storage);
      return {
        data: {},
        status: removed ? "corrupt" : "recovery-failed",
        message: removed
          ? "Corrupt previous-set data was removed. History was not changed."
          : "Previous-set data is corrupt and could not be removed because device storage is unavailable.",
        rawValue: rawPrevious,
      };
    }

    const validPreviousSets: PreviousSetsByExercise = {};
    let ignoredCount = 0;
    Object.entries(parsed).forEach(([exerciseId, sets]) => {
      if (exerciseId.length > 0 && Array.isArray(sets) && sets.every(isPreviousSet)) {
        validPreviousSets[exerciseId] = sets.map((set) => ({ ...set }));
      } else {
        ignoredCount += 1;
      }
    });
    return {
      data: validPreviousSets,
      status: ignoredCount > 0 ? "recovered" : "loaded",
      message: ignoredCount > 0
        ? `${ignoredCount} invalid previous-set ${ignoredCount === 1 ? "entry was" : "entries were"} ignored while valid entries were preserved.`
        : "",
      rawValue: rawPrevious,
    };
  } catch {
    const removed = safelyRemoveItem(PREVIOUS_SETS_KEY, storage);
    return {
      data: {},
      status: removed ? "corrupt" : "recovery-failed",
      message: removed
        ? "Corrupt previous-set JSON was removed. History was not changed."
        : "Previous-set JSON is corrupt and could not be removed because device storage is unavailable.",
      rawValue: rawPrevious,
    };
  }
}

export function loadPreviousSets(): PreviousSetsByExercise {
  return loadPreviousSetsResult().data;
}

export function savePreviousSets(previousSets: PreviousSetsByExercise, storage: StorageLike = getBrowserStorage()): boolean {
  try {
    storage.setItem(PREVIOUS_SETS_KEY, JSON.stringify(previousSets));
    return true;
  } catch {
    return false;
  }
}

export function createWorkoutId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `workout-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
