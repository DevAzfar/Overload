import beginnerProgressionCsv from "./demo-data/beginner-progression.csv?raw";
import inconsistentTrainingCsv from "./demo-data/inconsistent-training.csv?raw";
import plateauBreakthroughCsv from "./demo-data/plateau-breakthrough.csv?raw";
import type { DemoProfileId } from "./demoMetadata";
import {
  parseWorkoutCsv,
  serializeWorkoutHistoryToCsv,
  type WorkoutCsvImport,
  type WorkoutCsvParseResult,
} from "./workoutCsv";

export type DemoChartMetric = "volume" | "estimated-one-rep-max";

export type DemoProfile = {
  id: DemoProfileId;
  name: string;
  description: string;
  featuredExerciseId: string;
  featuredExerciseName: string;
  preferredMetric: DemoChartMetric;
  sourceCsv: string;
};

export const DEMO_PROFILES: readonly DemoProfile[] = Object.freeze([
  Object.freeze({
    id: "beginner-progression" as const,
    name: "Beginner Progression",
    description: "Consistent training across 12 weeks, with rising volume, estimated strength and personal records.",
    featuredExerciseId: "bench",
    featuredExerciseName: "Barbell Bench Press",
    preferredMetric: "estimated-one-rep-max" as const,
    sourceCsv: beginnerProgressionCsv,
  }),
  Object.freeze({
    id: "plateau-breakthrough" as const,
    name: "Plateau and Breakthrough",
    description: "Stalled bench performance, changing training volume and a later strength breakthrough.",
    featuredExerciseId: "bench",
    featuredExerciseName: "Barbell Bench Press",
    preferredMetric: "estimated-one-rep-max" as const,
    sourceCsv: plateauBreakthroughCsv,
  }),
  Object.freeze({
    id: "inconsistent-training" as const,
    name: "Inconsistent Training",
    description: "Irregular frequency, missed weeks and variable performance with some overall progress.",
    featuredExerciseId: "squat",
    featuredExerciseName: "Back Squat",
    preferredMetric: "estimated-one-rep-max" as const,
    sourceCsv: inconsistentTrainingCsv,
  }),
]);

export type AlignedDemoProfile = {
  profile: DemoProfile;
  data: WorkoutCsvImport;
  offsetMilliseconds: number;
  sourceNewestFinishedAt: string;
  alignedNewestFinishedAt: string;
};

export function getDemoProfile(profileId: DemoProfileId): DemoProfile {
  const profile = DEMO_PROFILES.find((candidate) => candidate.id === profileId);
  if (!profile) throw new Error("Unknown demo profile.");
  return profile;
}

export function parseDemoSource(profile: DemoProfile): WorkoutCsvParseResult {
  return parseWorkoutCsv(profile.sourceCsv);
}

export function alignDemoProfileToReferenceDate(
  profile: DemoProfile,
  referenceDate = new Date(),
): AlignedDemoProfile {
  const parsed = parseDemoSource(profile);
  if (!parsed.ok) throw new Error(`${profile.name} source data is invalid: ${parsed.error}`);
  if (!Number.isFinite(referenceDate.getTime())) throw new Error("The demo alignment date is invalid.");

  const newestFinishedAt = parsed.data.workouts.reduce((latest, workout) =>
    Date.parse(workout.finishedAt) > Date.parse(latest) ? workout.finishedAt : latest,
  parsed.data.workouts[0].finishedAt);
  const targetNewestFinish = new Date(referenceDate.getTime() - 5 * 60 * 1000);
  const offsetMilliseconds = targetNewestFinish.getTime() - Date.parse(newestFinishedAt);
  const shifted = parsed.data.workouts.map((workout) => ({
    ...workout,
    startedAt: new Date(Date.parse(workout.startedAt) + offsetMilliseconds).toISOString(),
    finishedAt: new Date(Date.parse(workout.finishedAt) + offsetMilliseconds).toISOString(),
    exercises: workout.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => ({ ...set })),
    })),
  }));

  const revalidated = parseWorkoutCsv(serializeWorkoutHistoryToCsv(shifted));
  if (!revalidated.ok) throw new Error(`${profile.name} could not be revalidated after date alignment: ${revalidated.error}`);

  return {
    profile,
    data: revalidated.data,
    offsetMilliseconds,
    sourceNewestFinishedAt: newestFinishedAt,
    alignedNewestFinishedAt: targetNewestFinish.toISOString(),
  };
}
