import { APP_SETTINGS_KEY } from "./appSettings";
import { CUSTOM_EXERCISES_KEY } from "./customExercises";
import {
  PREVIOUS_SETS_KEY,
  WORKOUT_HISTORY_KEY,
  isValidCompletedSavedSet,
  type PreviousSet,
  type PreviousSetsByExercise,
  type SavedWorkout,
} from "./workoutHistory";
import { WORKOUT_TEMPLATES_KEY } from "./workoutTemplates";

export const WORKOUT_DATA_KEYS = Object.freeze([WORKOUT_HISTORY_KEY, PREVIOUS_SETS_KEY] as const);
export const ALL_LIFT_OFF_KEYS = Object.freeze([
  WORKOUT_HISTORY_KEY,
  PREVIOUS_SETS_KEY,
  WORKOUT_TEMPLATES_KEY,
  CUSTOM_EXERCISES_KEY,
  APP_SETTINGS_KEY,
] as const);

export type StorageMutationResult =
  | { ok: true }
  | { ok: false; message: string; rollbackFailed: boolean };

type StorageSnapshot = Map<string, string | null>;

function readSnapshot(keys: readonly string[]): StorageSnapshot {
  return new Map(keys.map((key) => [key, window.localStorage.getItem(key)]));
}

function restoreSnapshot(snapshot: StorageSnapshot): boolean {
  let restored = true;
  snapshot.forEach((value, key) => {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch {
      restored = false;
    }
  });
  return restored;
}

function failureMessage(action: string, rollbackFailed: boolean): StorageMutationResult {
  return {
    ok: false,
    rollbackFailed,
    message: rollbackFailed
      ? `${action} did not complete, and Lift Off could not fully restore the earlier device data. Reload the app and review your data before trying again.`
      : `${action} did not complete. The earlier device data was restored and the app state was not changed.`,
  };
}

export function rebuildPreviousSetsFromHistory(history: readonly SavedWorkout[]): PreviousSetsByExercise {
  const previousSets: PreviousSetsByExercise = {};
  const sortedHistory = [...history].sort(
    (first, second) => Date.parse(second.startedAt) - Date.parse(first.startedAt),
  );

  sortedHistory.forEach((workout) => {
    const validSetsByExercise = new Map<string, PreviousSet[]>();
    workout.exercises.forEach((exercise) => {
      if (previousSets[exercise.exerciseId]) return;
      const sets = validSetsByExercise.get(exercise.exerciseId) ?? [];
      exercise.sets.filter(isValidCompletedSavedSet).forEach((set) => {
        sets.push({ weight: set.weight!, reps: set.reps! });
      });
      if (sets.length > 0) validSetsByExercise.set(exercise.exerciseId, sets);
    });

    validSetsByExercise.forEach((sets, exerciseId) => {
      if (!previousSets[exerciseId] && sets.length > 0) previousSets[exerciseId] = sets;
    });
  });

  return previousSets;
}

export function writeWorkoutDataWithRollback(
  history: readonly SavedWorkout[],
  previousSets: PreviousSetsByExercise,
): StorageMutationResult {
  let snapshot: StorageSnapshot;
  try {
    snapshot = readSnapshot(WORKOUT_DATA_KEYS);
  } catch {
    return {
      ok: false,
      rollbackFailed: false,
      message: "Lift Off could not read the current workout data, so no workout changes were attempted.",
    };
  }

  try {
    window.localStorage.setItem(PREVIOUS_SETS_KEY, JSON.stringify(previousSets));
    window.localStorage.setItem(WORKOUT_HISTORY_KEY, JSON.stringify(history));
    return { ok: true };
  } catch {
    return failureMessage("The workout-data write", !restoreSnapshot(snapshot));
  }
}

export function removeStorageKeysWithRollback(
  keys: readonly string[],
  actionDescription: string,
): StorageMutationResult {
  let snapshot: StorageSnapshot;
  try {
    snapshot = readSnapshot(keys);
  } catch {
    return {
      ok: false,
      rollbackFailed: false,
      message: `Lift Off could not read the current device data, so ${actionDescription.toLocaleLowerCase("en-GB")} was not attempted.`,
    };
  }

  try {
    keys.forEach((key) => window.localStorage.removeItem(key));
    return { ok: true };
  } catch {
    return failureMessage(actionDescription, !restoreSnapshot(snapshot));
  }
}
