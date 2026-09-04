import {
  BUILT_IN_EXERCISES,
  isBuiltInExerciseId,
  isEquipment,
  isMuscleGroup,
  type CustomExercise,
  type Equipment,
  type Exercise,
  type MuscleGroup,
} from "./exercises";

export const CUSTOM_EXERCISES_KEY = "lift-off-custom-exercises-v1";

type CustomExerciseStoreV1 = {
  version: 1;
  exercises: CustomExercise[];
};

export type CustomExerciseDraft = {
  name: string;
  muscle: MuscleGroup | "";
  equipment: Equipment | "";
};

export type CustomExerciseLoadResult = {
  exercises: CustomExercise[];
  error: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normaliseExerciseText(value: string): string {
  return value.trim().toLocaleLowerCase("en-GB");
}

export function getExerciseIdentityKey(exercise: Pick<Exercise, "name" | "muscle" | "equipment">): string {
  return [exercise.name, exercise.muscle, exercise.equipment]
    .map(normaliseExerciseText)
    .join("\u0000");
}

function toValidCustomExercise(value: unknown): CustomExercise | null {
  if (!isObject(value) || value.kind !== "custom") return null;
  if (typeof value.id !== "string" || value.id.trim() === "") return null;
  if (typeof value.name !== "string" || value.name.trim() === "") return null;
  if (!isMuscleGroup(value.muscle) || !isEquipment(value.equipment)) return null;

  const id = value.id.trim();
  if (isBuiltInExerciseId(id)) return null;

  return {
    id,
    name: value.name.trim(),
    muscle: value.muscle,
    equipment: value.equipment,
    kind: "custom",
  };
}

function safelyRemoveCustomExercises(): boolean {
  try {
    window.localStorage.removeItem(CUSTOM_EXERCISES_KEY);
    return true;
  } catch {
    return false;
  }
}

function invalidStoreResult(): CustomExerciseLoadResult {
  const cleared = safelyRemoveCustomExercises();
  return {
    exercises: [],
    error: cleared
      ? "Invalid custom-exercise data was removed. Built-in exercises and other Lift Off data were not changed."
      : "Custom-exercise data is invalid and could not be cleared because device storage is unavailable.",
  };
}

export function loadCustomExercises(): CustomExerciseLoadResult {
  let rawExercises: string | null;

  try {
    rawExercises = window.localStorage.getItem(CUSTOM_EXERCISES_KEY);
  } catch {
    return {
      exercises: [],
      error: "Lift Off could not access custom exercises on this device. Built-in exercises are still available.",
    };
  }

  if (rawExercises === null) return { exercises: [], error: "" };

  try {
    const parsed: unknown = JSON.parse(rawExercises);
    if (!isObject(parsed) || parsed.version !== 1 || !Array.isArray(parsed.exercises)) {
      return invalidStoreResult();
    }

    const seenIds = new Set<string>();
    const seenIdentities = new Set(BUILT_IN_EXERCISES.map(getExerciseIdentityKey));
    const exercises: CustomExercise[] = [];

    parsed.exercises.forEach((candidate) => {
      const exercise = toValidCustomExercise(candidate);
      if (!exercise || seenIds.has(exercise.id)) return;

      const identity = getExerciseIdentityKey(exercise);
      if (seenIdentities.has(identity)) return;

      seenIds.add(exercise.id);
      seenIdentities.add(identity);
      exercises.push(exercise);
    });

    return { exercises, error: "" };
  } catch {
    return invalidStoreResult();
  }
}

function customExercisesAreValid(exercises: readonly CustomExercise[]): boolean {
  const validExercises = exercises.map(toValidCustomExercise);
  if (validExercises.some((exercise) => exercise === null)) return false;

  const ids = validExercises.map((exercise) => exercise!.id);
  if (new Set(ids).size !== ids.length) return false;

  const identities = [
    ...BUILT_IN_EXERCISES.map(getExerciseIdentityKey),
    ...validExercises.map((exercise) => getExerciseIdentityKey(exercise!)),
  ];
  return new Set(identities).size === identities.length;
}

export function saveCustomExercises(exercises: readonly CustomExercise[]): boolean {
  if (!customExercisesAreValid(exercises)) return false;

  const store: CustomExerciseStoreV1 = {
    version: 1,
    exercises: exercises.map((exercise) => ({ ...exercise })),
  };

  try {
    window.localStorage.setItem(CUSTOM_EXERCISES_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

export function createCustomExerciseId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `custom-${crypto.randomUUID()}`;
  }

  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
