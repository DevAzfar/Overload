import type { PreviousSet } from "./workoutHistory";

export type Exercise = {
  id: string;
  name: string;
  muscle: string;
  equipment: string;
  previous: PreviousSet[];
};

export const EXERCISES: readonly Exercise[] = [
  { id: "bench", name: "Barbell Bench Press", muscle: "Chest", equipment: "Barbell", previous: [{ weight: 70, reps: 8 }, { weight: 70, reps: 7 }] },
  { id: "incline-db", name: "Incline Dumbbell Press", muscle: "Chest", equipment: "Dumbbells", previous: [{ weight: 26, reps: 9 }, { weight: 26, reps: 8 }] },
  { id: "pull-up", name: "Weighted Pull-up", muscle: "Back", equipment: "Bodyweight", previous: [{ weight: 32, reps: 6 }, { weight: 32, reps: 5 }] },
  { id: "lat-pulldown", name: "Lat Pulldown", muscle: "Back", equipment: "Cable", previous: [] },
  { id: "cable-row", name: "Seated Cable Row", muscle: "Back", equipment: "Cable", previous: [{ weight: 68, reps: 10 }, { weight: 68, reps: 9 }] },
  { id: "ohp", name: "Overhead Press", muscle: "Shoulders", equipment: "Barbell", previous: [{ weight: 50, reps: 6 }, { weight: 50, reps: 5 }] },
  { id: "lateral", name: "Cable Lateral Raise", muscle: "Shoulders", equipment: "Cable", previous: [{ weight: 7.5, reps: 12 }, { weight: 7.5, reps: 11 }] },
  { id: "squat", name: "Back Squat", muscle: "Legs", equipment: "Barbell", previous: [{ weight: 100, reps: 6 }, { weight: 100, reps: 6 }] },
  { id: "rdl", name: "Romanian Deadlift", muscle: "Legs", equipment: "Barbell", previous: [{ weight: 95, reps: 8 }, { weight: 95, reps: 7 }] },
  { id: "split-squat", name: "Bulgarian Split Squat", muscle: "Legs", equipment: "Dumbbells", previous: [{ weight: 24, reps: 8 }, { weight: 24, reps: 8 }] },
  { id: "curl", name: "Cable Curl", muscle: "Arms", equipment: "Cable", previous: [{ weight: 20, reps: 10 }, { weight: 20, reps: 9 }] },
  { id: "triceps", name: "Overhead Triceps Extension", muscle: "Arms", equipment: "Cable", previous: [{ weight: 25, reps: 10 }, { weight: 25, reps: 9 }] },
  { id: "calf", name: "Standing Calf Raise", muscle: "Calves", equipment: "Machine", previous: [{ weight: 70, reps: 12 }, { weight: 70, reps: 11 }] },
];

const EXERCISES_BY_ID = new Map(EXERCISES.map((exercise) => [exercise.id, exercise]));

export function getExerciseById(exerciseId: string): Exercise | undefined {
  return EXERCISES_BY_ID.get(exerciseId);
}

export function isKnownExerciseId(exerciseId: string): boolean {
  return EXERCISES_BY_ID.has(exerciseId);
}
