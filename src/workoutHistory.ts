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

function safelyRemoveItem(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable in restricted browser modes. The app can still run in memory.
  }
}

export function loadWorkoutHistory(): SavedWorkout[] {
  let rawHistory: string | null;

  try {
    rawHistory = window.localStorage.getItem(WORKOUT_HISTORY_KEY);
  } catch {
    return [];
  }

  if (rawHistory === null) return [];

  try {
    const parsed: unknown = JSON.parse(rawHistory);

    if (!Array.isArray(parsed)) {
      safelyRemoveItem(WORKOUT_HISTORY_KEY);
      return [];
    }

    return parsed
      .filter(isSavedWorkout)
      .sort((first, second) => Date.parse(second.startedAt) - Date.parse(first.startedAt));
  } catch {
    safelyRemoveItem(WORKOUT_HISTORY_KEY);
    return [];
  }
}

export function saveWorkoutHistory(history: SavedWorkout[]): boolean {
  try {
    window.localStorage.setItem(WORKOUT_HISTORY_KEY, JSON.stringify(history));
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

export function loadPreviousSets(): PreviousSetsByExercise {
  let rawPrevious: string | null;

  try {
    rawPrevious = window.localStorage.getItem(PREVIOUS_SETS_KEY);
  } catch {
    return {};
  }

  if (rawPrevious === null) return {};

  try {
    const parsed: unknown = JSON.parse(rawPrevious);
    if (!isObject(parsed)) {
      safelyRemoveItem(PREVIOUS_SETS_KEY);
      return {};
    }

    const validPreviousSets: PreviousSetsByExercise = {};
    Object.entries(parsed).forEach(([exerciseId, sets]) => {
      if (exerciseId.length > 0 && Array.isArray(sets) && sets.every(isPreviousSet)) {
        validPreviousSets[exerciseId] = sets;
      }
    });
    return validPreviousSets;
  } catch {
    safelyRemoveItem(PREVIOUS_SETS_KEY);
    return {};
  }
}

export function savePreviousSets(previousSets: PreviousSetsByExercise): boolean {
  try {
    window.localStorage.setItem(PREVIOUS_SETS_KEY, JSON.stringify(previousSets));
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
