import {
  calculateSavedWorkoutSummary,
  isValidCompletedSavedSet,
  type SavedWorkout,
  type SavedWorkoutExercise,
} from "./workoutHistory";

export function cloneSavedWorkout(workout: SavedWorkout): SavedWorkout {
  return {
    ...workout,
    exercises: workout.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => ({ ...set })),
    })),
  };
}

export function withRecalculatedWorkoutSummary(
  workout: Omit<SavedWorkout, "totalVolume" | "exerciseCount" | "completedSetCount">,
): SavedWorkout {
  return { ...workout, ...calculateSavedWorkoutSummary(workout.exercises) };
}

export function replaceWorkoutInHistory(
  history: readonly SavedWorkout[],
  editedWorkout: SavedWorkout,
): SavedWorkout[] {
  const matches = history.filter((workout) => workout.id === editedWorkout.id).length;
  if (matches !== 1) throw new Error("The workout could not be edited because its ID is no longer unique in visible History.");
  return history
    .map((workout) => workout.id === editedWorkout.id ? cloneSavedWorkout(editedWorkout) : workout)
    .sort((first, second) => Date.parse(second.startedAt) - Date.parse(first.startedAt));
}

export function deleteWorkoutFromHistory(
  history: readonly SavedWorkout[],
  workoutId: string,
): SavedWorkout[] {
  const matches = history.filter((workout) => workout.id === workoutId).length;
  if (matches !== 1) throw new Error("The workout could not be deleted because its ID is no longer unique in visible History.");
  return history.filter((workout) => workout.id !== workoutId);
}

export function exerciseHasSets(exercise: SavedWorkoutExercise): boolean {
  return exercise.sets.length > 0;
}

export function workoutHasValidCompletedSet(exercises: readonly SavedWorkoutExercise[]): boolean {
  return exercises.some((exercise) => exercise.sets.some(isValidCompletedSavedSet));
}
