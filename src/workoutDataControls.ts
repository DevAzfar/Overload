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
import { DEMO_METADATA_KEY } from "./demoMetadata";
import { ACTIVE_WORKOUT_DRAFT_KEY } from "./activeWorkoutDraft";
import { getBrowserStorage, type StorageLike } from "./storageTypes";

export const WORKOUT_DATA_KEYS = Object.freeze([WORKOUT_HISTORY_KEY, PREVIOUS_SETS_KEY] as const);
export const WORKOUT_AND_DEMO_DATA_KEYS = Object.freeze([
  WORKOUT_HISTORY_KEY,
  PREVIOUS_SETS_KEY,
  DEMO_METADATA_KEY,
] as const);
export const ALL_APP_STORAGE_KEYS = Object.freeze([
  WORKOUT_HISTORY_KEY,
  PREVIOUS_SETS_KEY,
  WORKOUT_TEMPLATES_KEY,
  CUSTOM_EXERCISES_KEY,
  APP_SETTINGS_KEY,
  DEMO_METADATA_KEY,
  ACTIVE_WORKOUT_DRAFT_KEY,
] as const);

export type StorageMutationResult =
  | { ok: true; rawValues: ReadonlyMap<string, string | null> }
  | { ok: false; message: string; rollbackFailed: boolean; conflict?: boolean };

type StorageSnapshot = Map<string, string | null>;

export type StorageMutationOptions = {
  storage?: StorageLike;
  expectedRawValues?: ReadonlyMap<string, string | null>;
  additionalChanges?: ReadonlyMap<string, string | null>;
};

export function readStorageSnapshot(
  keys: readonly string[],
  storage: StorageLike = getBrowserStorage(),
): StorageSnapshot {
  return new Map(keys.map((key) => [key, storage.getItem(key)]));
}

function restoreSnapshot(snapshot: StorageSnapshot, storage: StorageLike): boolean {
  let restored = true;
  snapshot.forEach((value, key) => {
    try {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    } catch {
      restored = false;
    }
  });
  return restored;
}

function snapshotMatchesExpected(
  current: StorageSnapshot,
  expected: ReadonlyMap<string, string | null> | undefined,
): boolean {
  if (!expected) return true;
  return [...current.entries()].every(([key, value]) => expected.get(key) === value);
}

function failureMessage(action: string, rollbackFailed: boolean): StorageMutationResult {
  return {
    ok: false,
    rollbackFailed,
    message: rollbackFailed
      ? `${action} did not complete, and Overload could not fully restore the earlier device data. Reload the app and review your data before trying again.`
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
  options: StorageMutationOptions = {},
): StorageMutationResult {
  const storage = options.storage ?? getBrowserStorage();
  const changes = new Map<string, string | null>([
    [PREVIOUS_SETS_KEY, JSON.stringify(previousSets)],
    [WORKOUT_HISTORY_KEY, JSON.stringify(history)],
  ]);
  options.additionalChanges?.forEach((value, key) => changes.set(key, value));
  let snapshot: StorageSnapshot;
  try {
    snapshot = readStorageSnapshot([...changes.keys()], storage);
  } catch {
    return {
      ok: false,
      rollbackFailed: false,
      message: "Overload could not read the current workout data, so no workout changes were attempted.",
    };
  }
  if (!snapshotMatchesExpected(snapshot, options.expectedRawValues)) {
    return {
      ok: false,
      rollbackFailed: false,
      conflict: true,
      message: "Workout data changed in another browser tab. Review or reload those changes before saving this version.",
    };
  }

  try {
    changes.forEach((value, key) => {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    });
    return { ok: true, rawValues: changes };
  } catch {
    return failureMessage("The workout-data write", !restoreSnapshot(snapshot, storage));
  }
}

export function removeStorageKeysWithRollback(
  keys: readonly string[],
  actionDescription: string,
  options: StorageMutationOptions = {},
): StorageMutationResult {
  const storage = options.storage ?? getBrowserStorage();
  let snapshot: StorageSnapshot;
  try {
    snapshot = readStorageSnapshot(keys, storage);
  } catch {
    return {
      ok: false,
      rollbackFailed: false,
      message: `Overload could not read the current device data, so ${actionDescription.toLocaleLowerCase("en-GB")} was not attempted.`,
    };
  }
  if (!snapshotMatchesExpected(snapshot, options.expectedRawValues)) {
    return {
      ok: false,
      rollbackFailed: false,
      conflict: true,
      message: "Device data changed in another browser tab. Reload or deliberately keep your local state before deleting data.",
    };
  }

  try {
    keys.forEach((key) => storage.removeItem(key));
    return { ok: true, rawValues: new Map(keys.map((key) => [key, null])) };
  } catch {
    return failureMessage(actionDescription, !restoreSnapshot(snapshot, storage));
  }
}
