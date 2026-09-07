import { createExerciseLookup, getExerciseById, type Exercise } from "./exercises";
import type { SavedWorkout, SavedWorkoutSet } from "./workoutHistory";

export type ValidProgressSet = {
  weight: number;
  reps: number;
  rpe: number | null;
  volume: number;
  estimatedOneRepMax: number | null;
};

export type ExerciseProgressChoice = {
  exerciseId: string;
  displayName: string;
  hasValidPerformance: boolean;
};

export type ExerciseSessionProgress = {
  id: string;
  workoutId: string;
  workoutName: string;
  startedAt: string;
  sets: ValidProgressSet[];
  volume: number;
  bestWeight: number;
  bestRepetitions: number;
  bestEstimatedOneRepMax: number | null;
};

export type ExerciseMetricBest = {
  value: number;
  workoutId: string;
  workoutName: string;
  startedAt: string;
};

export type ExerciseAllTimeBests = {
  bestWeight: ExerciseMetricBest | null;
  bestRepetitions: ExerciseMetricBest | null;
  bestEstimatedOneRepMax: ExerciseMetricBest | null;
  totalVolume: number;
  sessionCount: number;
};

export type VolumeTrendPoint = {
  workoutId: string;
  workoutName: string;
  startedAt: string;
  volume: number;
};

export type EstimatedOneRepMaxTrendPoint = {
  workoutId: string;
  workoutName: string;
  startedAt: string;
  estimatedOneRepMax: number;
};

export type PersonalRecordCategory = "weight" | "repetitions" | "estimated-one-rep-max";

export type PersonalRecordAchievement = {
  category: PersonalRecordCategory;
  value: number;
};

export type PersonalRecordEvent = {
  workoutId: string;
  workoutName: string;
  startedAt: string;
  achievements: PersonalRecordAchievement[];
};

export type ExerciseProgressAnalytics = {
  exerciseId: string;
  displayName: string;
  sessionsNewestFirst: ExerciseSessionProgress[];
  allTimeBests: ExerciseAllTimeBests;
  volumeSeries: VolumeTrendPoint[];
  personalRecords: PersonalRecordEvent[];
};

function safeSum(values: number[]): number {
  return values.reduce((total, value) => {
    const nextTotal = total + value;
    return Number.isFinite(nextTotal) ? nextTotal : Number.MAX_VALUE;
  }, 0);
}

export function isValidProgressSet(set: SavedWorkoutSet): boolean {
  if (!set.complete) return false;
  if (set.weight === null || !Number.isFinite(set.weight) || set.weight < 0) return false;
  if (set.reps === null || !Number.isFinite(set.reps) || set.reps <= 0) return false;
  return Number.isFinite(set.weight * set.reps);
}

export function calculateEstimatedOneRepMax(weight: number, reps: number): number | null {
  if (!Number.isFinite(weight) || weight < 0 || !Number.isFinite(reps) || reps < 1 || reps > 30) return null;
  if (reps === 1) return weight;

  const estimate = weight * (1 + reps / 30);
  return Number.isFinite(estimate) ? estimate : null;
}

function toValidProgressSet(set: SavedWorkoutSet): ValidProgressSet | null {
  if (!isValidProgressSet(set) || set.weight === null || set.reps === null) return null;

  return {
    weight: set.weight,
    reps: set.reps,
    rpe: set.rpe !== null && Number.isFinite(set.rpe) ? set.rpe : null,
    volume: set.weight * set.reps,
    estimatedOneRepMax: calculateEstimatedOneRepMax(set.weight, set.reps),
  };
}

export function buildExerciseChoices(
  history: SavedWorkout[],
  exerciseLibrary: readonly Exercise[],
): ExerciseProgressChoice[] {
  const choices = new Map<string, { historicalName: string; newestTimestamp: number; hasValidPerformance: boolean }>();
  const exerciseLookup = createExerciseLookup(exerciseLibrary);

  history.forEach((workout) => {
    const workoutTimestamp = Date.parse(workout.startedAt);
    workout.exercises.forEach((exercise) => {
      const existing = choices.get(exercise.exerciseId);
      const hasValidPerformance = exercise.sets.some(isValidProgressSet);

      if (!existing) {
        choices.set(exercise.exerciseId, {
          historicalName: exercise.name,
          newestTimestamp: workoutTimestamp,
          hasValidPerformance,
        });
        return;
      }

      if (workoutTimestamp > existing.newestTimestamp) {
        existing.historicalName = exercise.name;
        existing.newestTimestamp = workoutTimestamp;
      }
      if (hasValidPerformance) existing.hasValidPerformance = true;
    });
  });

  return [...choices.entries()]
    .map(([exerciseId, details]) => ({
      exerciseId,
      displayName: getExerciseById(exerciseLookup, exerciseId)?.name ?? details.historicalName,
      hasValidPerformance: details.hasValidPerformance,
    }))
    .sort((first, second) =>
      first.displayName.localeCompare(second.displayName, "en-GB", { sensitivity: "base" }) ||
      first.exerciseId.localeCompare(second.exerciseId),
    );
}

export function filterRecordedExerciseChoices(
  choices: readonly ExerciseProgressChoice[],
  search: string,
): ExerciseProgressChoice[] {
  const term = search.trim().toLocaleLowerCase("en-GB");
  if (!term) return [...choices];
  return choices.filter((choice) => choice.displayName.toLocaleLowerCase("en-GB").includes(term));
}

export function calculateTimeAxisPositions(
  points: readonly { startedAt: string }[],
  width: number,
  padding: number,
): number[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [width / 2];
  const timestamps = points.map((point) => Date.parse(point.startedAt));
  if (timestamps.some((timestamp) => !Number.isFinite(timestamp))) return points.map(() => width / 2);
  const first = Math.min(...timestamps);
  const last = Math.max(...timestamps);
  if (last === first) return points.map(() => width / 2);
  return timestamps.map((timestamp) => padding + ((timestamp - first) / (last - first)) * (width - padding * 2));
}

export function buildExerciseSessions(history: SavedWorkout[], exerciseId: string): ExerciseSessionProgress[] {
  const sessions: ExerciseSessionProgress[] = [];

  history.forEach((workout) => {
    const sets = workout.exercises
      .filter((exercise) => exercise.exerciseId === exerciseId)
      .flatMap((exercise) => exercise.sets)
      .map(toValidProgressSet)
      .filter((set): set is ValidProgressSet => set !== null);

    if (sets.length === 0) return;

    const estimatedOneRepMaxes = sets
      .map((set) => set.estimatedOneRepMax)
      .filter((estimate): estimate is number => estimate !== null);

    sessions.push({
      id: `${workout.id}-${workout.startedAt}-${exerciseId}`,
      workoutId: workout.id,
      workoutName: workout.name,
      startedAt: workout.startedAt,
      sets,
      volume: safeSum(sets.map((set) => set.volume)),
      bestWeight: Math.max(...sets.map((set) => set.weight)),
      bestRepetitions: Math.max(...sets.map((set) => set.reps)),
      bestEstimatedOneRepMax: estimatedOneRepMaxes.length > 0 ? Math.max(...estimatedOneRepMaxes) : null,
    });
  });

  return sessions.sort((first, second) => Date.parse(second.startedAt) - Date.parse(first.startedAt));
}

function findMetricBest(
  sessions: ExerciseSessionProgress[],
  getValue: (session: ExerciseSessionProgress) => number | null,
): ExerciseMetricBest | null {
  return sessions.reduce<ExerciseMetricBest | null>((best, session) => {
    const value = getValue(session);
    if (value === null) return best;

    const isNewerTie = best !== null && value === best.value && Date.parse(session.startedAt) > Date.parse(best.startedAt);
    if (best === null || value > best.value || isNewerTie) {
      return {
        value,
        workoutId: session.workoutId,
        workoutName: session.workoutName,
        startedAt: session.startedAt,
      };
    }

    return best;
  }, null);
}

export function calculateAllTimeBests(sessions: ExerciseSessionProgress[]): ExerciseAllTimeBests {
  return {
    bestWeight: findMetricBest(sessions, (session) => session.bestWeight),
    bestRepetitions: findMetricBest(sessions, (session) => session.bestRepetitions),
    bestEstimatedOneRepMax: findMetricBest(sessions, (session) => session.bestEstimatedOneRepMax),
    totalVolume: safeSum(sessions.map((session) => session.volume)),
    sessionCount: sessions.length,
  };
}

export function createVolumeSeries(sessionsNewestFirst: ExerciseSessionProgress[]): VolumeTrendPoint[] {
  return [...sessionsNewestFirst].reverse().map((session) => ({
    workoutId: session.workoutId,
    workoutName: session.workoutName,
    startedAt: session.startedAt,
    volume: session.volume,
  }));
}

export function createEstimatedOneRepMaxSeries(
  sessionsNewestFirst: ExerciseSessionProgress[],
): EstimatedOneRepMaxTrendPoint[] {
  return [...sessionsNewestFirst].reverse().flatMap((session) =>
    session.bestEstimatedOneRepMax === null ? [] : [{
      workoutId: session.workoutId,
      workoutName: session.workoutName,
      startedAt: session.startedAt,
      estimatedOneRepMax: session.bestEstimatedOneRepMax,
    }],
  );
}

export function detectPersonalRecords(sessionsNewestFirst: ExerciseSessionProgress[]): PersonalRecordEvent[] {
  let bestWeight: number | null = null;
  let bestRepetitions: number | null = null;
  let bestEstimatedOneRepMax: number | null = null;
  const recordEvents: PersonalRecordEvent[] = [];

  [...sessionsNewestFirst].reverse().forEach((session) => {
    const achievements: PersonalRecordAchievement[] = [];

    if (bestWeight === null || session.bestWeight > bestWeight) {
      bestWeight = session.bestWeight;
      achievements.push({ category: "weight", value: session.bestWeight });
    }
    if (bestRepetitions === null || session.bestRepetitions > bestRepetitions) {
      bestRepetitions = session.bestRepetitions;
      achievements.push({ category: "repetitions", value: session.bestRepetitions });
    }
    if (
      session.bestEstimatedOneRepMax !== null &&
      (bestEstimatedOneRepMax === null || session.bestEstimatedOneRepMax > bestEstimatedOneRepMax)
    ) {
      bestEstimatedOneRepMax = session.bestEstimatedOneRepMax;
      achievements.push({ category: "estimated-one-rep-max", value: session.bestEstimatedOneRepMax });
    }

    if (achievements.length > 0) {
      recordEvents.push({
        workoutId: session.workoutId,
        workoutName: session.workoutName,
        startedAt: session.startedAt,
        achievements,
      });
    }
  });

  return recordEvents;
}

export function calculateExerciseProgress(
  history: SavedWorkout[],
  exerciseId: string,
  exerciseLibrary: readonly Exercise[],
): ExerciseProgressAnalytics | null {
  const choice = buildExerciseChoices(history, exerciseLibrary).find((candidate) => candidate.exerciseId === exerciseId);
  if (!choice) return null;

  const sessionsNewestFirst = buildExerciseSessions(history, exerciseId);
  return {
    exerciseId,
    displayName: choice.displayName,
    sessionsNewestFirst,
    allTimeBests: calculateAllTimeBests(sessionsNewestFirst),
    volumeSeries: createVolumeSeries(sessionsNewestFirst),
    personalRecords: detectPersonalRecords(sessionsNewestFirst),
  };
}
