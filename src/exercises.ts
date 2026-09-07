export const MUSCLE_GROUPS = Object.freeze([
  "Chest",
  "Back",
  "Shoulders",
  "Quadriceps",
  "Hamstrings",
  "Glutes",
  "Calves",
  "Biceps",
  "Triceps",
  "Forearms",
  "Core",
  "Hip flexors",
  "Abductors",
  "Adductors",
  "Neck",
] as const);

export const EQUIPMENT_TYPES = Object.freeze([
  "Barbell",
  "Dumbbell",
  "Cable",
  "Machine",
  "Bodyweight",
  "Smith machine",
  "Resistance band",
  "Other",
] as const);

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
export type Equipment = (typeof EQUIPMENT_TYPES)[number];
export type ExerciseKind = "built-in" | "custom";

type ExerciseDefinition = {
  readonly id: string;
  readonly name: string;
  readonly muscle: MuscleGroup;
  readonly equipment: Equipment;
};

export type BuiltInExercise = ExerciseDefinition & {
  readonly kind: "built-in";
};

export type CustomExercise = ExerciseDefinition & {
  readonly kind: "custom";
};

export type Exercise = BuiltInExercise | CustomExercise;

type BuiltInInput = Omit<BuiltInExercise, "kind">;

function defineBuiltInExercises(exercises: readonly BuiltInInput[]): readonly BuiltInExercise[] {
  return Object.freeze(
    exercises.map((exercise) => Object.freeze({ ...exercise, kind: "built-in" as const })),
  );
}

export const BUILT_IN_EXERCISES = defineBuiltInExercises([
  // Chest
  { id: "bench", name: "Barbell Bench Press", muscle: "Chest", equipment: "Barbell" },
  { id: "incline-db", name: "Incline Dumbbell Press", muscle: "Chest", equipment: "Dumbbell" },
  { id: "dumbbell-bench-press", name: "Dumbbell Bench Press", muscle: "Chest", equipment: "Dumbbell" },
  { id: "machine-chest-press", name: "Chest Press", muscle: "Chest", equipment: "Machine" },
  { id: "cable-chest-fly", name: "Cable Chest Fly", muscle: "Chest", equipment: "Cable" },
  { id: "push-up", name: "Push-up", muscle: "Chest", equipment: "Bodyweight" },

  // Back
  { id: "pull-up", name: "Weighted Pull-up", muscle: "Back", equipment: "Bodyweight" },
  { id: "lat-pulldown", name: "Lat Pulldown", muscle: "Back", equipment: "Cable" },
  { id: "cable-row", name: "Seated Cable Row", muscle: "Back", equipment: "Cable" },
  { id: "bodyweight-pull-up", name: "Pull-up", muscle: "Back", equipment: "Bodyweight" },
  { id: "dumbbell-row", name: "Dumbbell Row", muscle: "Back", equipment: "Dumbbell" },
  { id: "barbell-row", name: "Barbell Row", muscle: "Back", equipment: "Barbell" },
  { id: "machine-row", name: "Machine Row", muscle: "Back", equipment: "Machine" },

  // Shoulders
  { id: "ohp", name: "Overhead Press", muscle: "Shoulders", equipment: "Barbell" },
  { id: "lateral", name: "Cable Lateral Raise", muscle: "Shoulders", equipment: "Cable" },
  { id: "dumbbell-overhead-press", name: "Dumbbell Overhead Press", muscle: "Shoulders", equipment: "Dumbbell" },
  { id: "dumbbell-lateral-raise", name: "Dumbbell Lateral Raise", muscle: "Shoulders", equipment: "Dumbbell" },
  { id: "rear-delt-fly", name: "Rear-delt Fly", muscle: "Shoulders", equipment: "Machine" },
  { id: "face-pull", name: "Face Pull", muscle: "Shoulders", equipment: "Cable" },

  // Quadriceps
  { id: "squat", name: "Back Squat", muscle: "Quadriceps", equipment: "Barbell" },
  { id: "split-squat", name: "Bulgarian Split Squat", muscle: "Quadriceps", equipment: "Dumbbell" },
  { id: "deep-squat", name: "Deep Squat", muscle: "Quadriceps", equipment: "Barbell" },
  { id: "front-squat", name: "Front Squat", muscle: "Quadriceps", equipment: "Barbell" },
  { id: "leg-press", name: "Leg Press", muscle: "Quadriceps", equipment: "Machine" },
  { id: "leg-extension", name: "Leg Extension", muscle: "Quadriceps", equipment: "Machine" },
  { id: "smith-machine-squat", name: "Smith Machine Squat", muscle: "Quadriceps", equipment: "Smith machine" },

  // Hamstrings
  { id: "rdl", name: "Romanian Deadlift", muscle: "Hamstrings", equipment: "Barbell" },
  { id: "leg-curl", name: "Leg Curl", muscle: "Hamstrings", equipment: "Machine" },
  { id: "dumbbell-romanian-deadlift", name: "Dumbbell Romanian Deadlift", muscle: "Hamstrings", equipment: "Dumbbell" },
  { id: "nordic-hamstring-curl", name: "Nordic Hamstring Curl", muscle: "Hamstrings", equipment: "Bodyweight" },
  { id: "good-morning", name: "Good Morning", muscle: "Hamstrings", equipment: "Barbell" },

  // Glutes
  { id: "hip-thrust", name: "Hip Thrust", muscle: "Glutes", equipment: "Barbell" },
  { id: "glute-bridge", name: "Glute Bridge", muscle: "Glutes", equipment: "Bodyweight" },
  { id: "cable-kickback", name: "Cable Kickback", muscle: "Glutes", equipment: "Cable" },
  { id: "smith-machine-hip-thrust", name: "Smith Machine Hip Thrust", muscle: "Glutes", equipment: "Smith machine" },

  // Calves
  { id: "calf", name: "Standing Calf Raise", muscle: "Calves", equipment: "Machine" },
  { id: "seated-calf-raise", name: "Seated Calf Raise", muscle: "Calves", equipment: "Machine" },
  { id: "single-leg-calf-raise", name: "Single-leg Calf Raise", muscle: "Calves", equipment: "Bodyweight" },
  { id: "smith-machine-calf-raise", name: "Smith Machine Calf Raise", muscle: "Calves", equipment: "Smith machine" },

  // Biceps
  { id: "curl", name: "Cable Curl", muscle: "Biceps", equipment: "Cable" },
  { id: "dumbbell-curl", name: "Dumbbell Curl", muscle: "Biceps", equipment: "Dumbbell" },
  { id: "hammer-curl", name: "Hammer Curl", muscle: "Biceps", equipment: "Dumbbell" },
  { id: "zottman-curl", name: "Zottman Curl", muscle: "Biceps", equipment: "Dumbbell" },
  { id: "barbell-curl", name: "Barbell Curl", muscle: "Biceps", equipment: "Barbell" },

  // Triceps
  { id: "triceps", name: "Overhead Triceps Extension", muscle: "Triceps", equipment: "Cable" },
  { id: "triceps-pushdown", name: "Triceps Pushdown", muscle: "Triceps", equipment: "Cable" },
  { id: "dumbbell-overhead-triceps-extension", name: "Dumbbell Overhead Triceps Extension", muscle: "Triceps", equipment: "Dumbbell" },
  { id: "close-grip-bench-press", name: "Close-grip Bench Press", muscle: "Triceps", equipment: "Barbell" },
  { id: "dip", name: "Dip", muscle: "Triceps", equipment: "Bodyweight" },

  // Forearms
  { id: "wrist-curl", name: "Wrist Curl", muscle: "Forearms", equipment: "Dumbbell" },
  { id: "reverse-wrist-curl", name: "Reverse Wrist Curl", muscle: "Forearms", equipment: "Dumbbell" },

  // Core
  { id: "ab-crunch", name: "Ab Crunch", muscle: "Core", equipment: "Bodyweight" },
  { id: "cable-twist", name: "Cable Twist", muscle: "Core", equipment: "Cable" },
  { id: "hanging-knee-raise", name: "Hanging Knee Raise", muscle: "Core", equipment: "Bodyweight" },
  { id: "ab-wheel-rollout", name: "Ab Wheel Rollout", muscle: "Core", equipment: "Other" },

  // Hip flexors
  { id: "hip-flexor-raise", name: "Hip-flexor Raise", muscle: "Hip flexors", equipment: "Bodyweight" },
  { id: "resistance-band-march", name: "Resistance Band March", muscle: "Hip flexors", equipment: "Resistance band" },

  // Abductors
  { id: "hip-abduction", name: "Hip Abduction", muscle: "Abductors", equipment: "Machine" },
  { id: "lateral-band-walk", name: "Lateral Band Walk", muscle: "Abductors", equipment: "Resistance band" },

  // Adductors
  { id: "hip-adduction", name: "Hip Adduction", muscle: "Adductors", equipment: "Machine" },

  // Neck
  { id: "neck-curl", name: "Neck Curl", muscle: "Neck", equipment: "Other" },
  { id: "neck-extension", name: "Neck Extension", muscle: "Neck", equipment: "Other" },
  { id: "lateral-neck-flexion", name: "Lateral Neck Flexion", muscle: "Neck", equipment: "Other" },
]);

export function isMuscleGroup(value: unknown): value is MuscleGroup {
  return typeof value === "string" && MUSCLE_GROUPS.some((muscle) => muscle === value);
}

export function isEquipment(value: unknown): value is Equipment {
  return typeof value === "string" && EQUIPMENT_TYPES.some((equipment) => equipment === value);
}

export function isBuiltInExerciseId(exerciseId: string): boolean {
  return BUILT_IN_EXERCISES.some((exercise) => exercise.id === exerciseId);
}

export function combineExerciseLibrary(customExercises: readonly CustomExercise[]): readonly Exercise[] {
  const builtIns = [...BUILT_IN_EXERCISES].sort((first, second) => first.name.localeCompare(second.name, "en-GB", { sensitivity: "base" }));
  const customCopies = customExercises
    .map((exercise) => Object.freeze({ ...exercise }))
    .sort((first, second) => first.name.localeCompare(second.name, "en-GB", { sensitivity: "base" }));
  return Object.freeze([...builtIns, ...customCopies]);
}

export function createExerciseLookup(exercises: readonly Exercise[]): ReadonlyMap<string, Exercise> {
  return new Map(exercises.map((exercise) => [exercise.id, exercise]));
}

export function getExerciseById(
  exerciseLookup: ReadonlyMap<string, Exercise>,
  exerciseId: string,
): Exercise | undefined {
  return exerciseLookup.get(exerciseId);
}
