import {
  decodeWorkoutCsvText,
  encodeWorkoutCsvText,
  parseWorkoutCsv,
  savedWorkoutsAreEqual,
  serializeWorkoutHistoryToCsv,
} from "../src/workoutCsv";
import { calculateSavedWorkoutSummary, type SavedWorkout, type SavedWorkoutExercise } from "../src/workoutHistory";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function createWorkout(
  id: string,
  name: string,
  startedAt: string,
  finishedAt: string,
  durationSeconds: number,
  exercises: SavedWorkoutExercise[],
): SavedWorkout {
  return {
    id,
    name,
    startedAt,
    finishedAt,
    durationSeconds,
    exercises,
    ...calculateSavedWorkoutSummary(exercises),
  };
}

const reversibleNames = [
  "=SUM(A1:A2)",
  "\\=SUM(A1:A2)",
  "+example",
  "-example",
  "@example",
  "'example",
  "''example",
  "\\=example",
  "~lift-off:b64:natural-prefix",
];

reversibleNames.forEach((name) => {
  const encoded = encodeWorkoutCsvText(name);
  assert(decodeWorkoutCsvText(encoded) === name, `Reversible text encoding failed for ${name}`);
  if (/^\s*[=+\-@']/.test(name)) {
    assert(!/^\s*[=+\-@']/.test(encoded), `Formula-sensitive text was not neutralised: ${name}`);
  }
});

const history: SavedWorkout[] = [
  createWorkout(
    "workout-newer",
    "Push, \"Power\"\nDay",
    "2026-09-05T18:05:06.789Z",
    "2026-09-05T19:15:07.123Z",
    4200,
    [
      {
        exerciseId: "repeated-exercise",
        name: "=SUM(A1:A2)",
        muscle: "Chest",
        equipment: "Barbell",
        sets: [
          { weight: 33.3333333333, reps: 7.5, rpe: 8.25, complete: true },
          { weight: null, reps: null, rpe: null, complete: false },
        ],
      },
      {
        exerciseId: "repeated-exercise",
        name: "\\=example",
        muscle: "Chest, upper",
        equipment: "Custom \"rack\"\nattachment",
        sets: [
          { weight: 12.3456789012, reps: 11, rpe: null, complete: true },
          { weight: 15.125, reps: null, rpe: 6.75, complete: false },
        ],
      },
    ],
  ),
  createWorkout(
    "workout-older",
    "'example",
    "2026-08-31T23:59:59.001Z",
    "2026-09-01T00:30:01.002Z",
    1802,
    [
      {
        exerciseId: "historical-only-id",
        name: "Exercise, \"quoted\"\nname",
        muscle: "+example",
        equipment: "@example",
        sets: [
          { weight: 0, reps: 12.5, rpe: 9.125, complete: true },
          { weight: null, reps: 3.75, rpe: null, complete: false },
        ],
      },
    ],
  ),
  createWorkout(
    "workout-formula-names",
    "Formula-safe names",
    "2026-08-20T12:00:00.000Z",
    "2026-08-20T12:30:00.000Z",
    1800,
    reversibleNames.map((name, index) => ({
      exerciseId: `formula-exercise-${index}`,
      name,
      muscle: "Verification",
      equipment: "Verification",
      sets: [{ weight: index + 0.125, reps: index + 1.25, rpe: index % 2 === 0 ? null : 7.5, complete: true }],
    })),
  ),
];

const csv = serializeWorkoutHistoryToCsv(history);
assert(csv.includes("33.3333333333"), "Canonical decimal weight was rounded during export");
assert(csv.includes("12.3456789012"), "Second canonical decimal weight was rounded during export");

const parsed = parseWorkoutCsv(csv);
if ("error" in parsed) {
  throw new Error(parsed.error);
}
assert(parsed.data.workouts.length === history.length, "Workout count changed during round trip");
history.forEach((workout, index) => {
  assert(savedWorkoutsAreEqual(parsed.data.workouts[index], workout), `Workout ${workout.id} changed during round trip`);
});

assert(parsed.data.workouts[0].exercises[0].exerciseId === parsed.data.workouts[0].exercises[1].exerciseId, "Repeated exercise IDs were not preserved");
assert(parsed.data.workouts[0].exercises[0].sets[1].weight === null, "Blank incomplete weight did not restore as null");
assert(parsed.data.workouts[0].exercises[0].sets[1].reps === null, "Blank incomplete repetitions did not restore as null");
assert(parsed.data.workouts[0].name === "Push, \"Power\"\nDay", "Quoted workout text was not restored exactly");
assert(
  parsed.data.workouts[2].exercises.every((exercise, index) => exercise.name === reversibleNames[index]),
  "One or more formula-sensitive names changed during the full CSV round trip",
);

console.log("Workout CSV verification passed: reversible formula safety, canonical decimals, nulls, ordering, repeated IDs and full round trip.");
