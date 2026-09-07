import { loadDemoMetadata, serialiseDemoMetadata, type DemoMetadata } from "../src/demoMetadata";
import { alignDemoProfileToReferenceDate, DEMO_PROFILES, parseDemoSource } from "../src/demoProfiles";
import {
  buildExerciseSessions,
  calculateEstimatedOneRepMax,
  createEstimatedOneRepMaxSeries,
  detectPersonalRecords,
} from "../src/progressAnalytics";
import { formatWeightFromKilograms } from "../src/weightUnits";
import {
  calculateSavedWorkoutSummary,
  isSavedWorkout,
  isValidCompletedSavedSet,
  type SavedWorkout,
} from "../src/workoutHistory";
import { savedWorkoutsAreEqual, serializeWorkoutHistoryToCsv, parseWorkoutCsv } from "../src/workoutCsv";
import {
  ALL_APP_STORAGE_KEYS,
  WORKOUT_AND_DEMO_DATA_KEYS,
  rebuildPreviousSetsFromHistory,
  removeStorageKeysWithRollback,
  writeWorkoutDataWithRollback,
} from "../src/workoutDataControls";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Demo verification failed: ${message}`);
}

class MockStorage {
  values = new Map<string, string>();
  writeCount = 0;
  failAtWrite = 0;
  failRollback = false;

  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    this.writeCount += 1;
    if (this.writeCount === this.failAtWrite || (this.failRollback && this.writeCount > this.failAtWrite)) throw new Error("write failure");
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.writeCount += 1;
    if (this.writeCount === this.failAtWrite || (this.failRollback && this.writeCount > this.failAtWrite)) throw new Error("remove failure");
    this.values.delete(key);
  }
}

function average(values: number[]) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function localWeekStart(reference: Date) {
  const start = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

const referenceDate = new Date("2026-09-06T12:00:00.000Z");
const alignedById = new Map<string, SavedWorkout[]>();

DEMO_PROFILES.forEach((profile) => {
  const rawRows = profile.sourceCsv.replace(/^\uFEFF/, "").trim().split(/\r?\n/).map((row) => row.split(","));
  assert(rawRows[0][0] === "schema_version" && rawRows[0][12] === "weight_kg", `${profile.name} should expose the schema-v1 canonical kilogram header`);
  assert(rawRows.slice(1).every((row) => row[0] === "1"), `${profile.name} rows should all declare schema version 1`);
  const rawIndexes = new Map<string, Map<number, number[]>>();
  rawRows.slice(1).forEach((row) => {
    const workoutExercises = rawIndexes.get(row[1]) ?? new Map<number, number[]>();
    const exerciseIndex = Number(row[6]);
    const setIndexes = workoutExercises.get(exerciseIndex) ?? [];
    setIndexes.push(Number(row[11]));
    workoutExercises.set(exerciseIndex, setIndexes);
    rawIndexes.set(row[1], workoutExercises);
  });
  rawIndexes.forEach((exerciseMap, workoutId) => {
    assert([...exerciseMap.keys()].sort((a, b) => a - b).every((value, index) => value === index), `${workoutId} exercise indexes should be contiguous`);
    exerciseMap.forEach((setIndexes, exerciseIndex) => {
      assert(setIndexes.sort((a, b) => a - b).every((value, index) => value === index), `${workoutId} exercise ${exerciseIndex} set indexes should be contiguous`);
    });
  });

  const source = parseDemoSource(profile);
  assert(source.ok, `${profile.name} source CSV should parse`);
  assert(source.data.workoutCount >= 20 && source.data.workoutCount <= 30, `${profile.name} should contain 20–30 workouts`);
  assert(new Set(source.data.workouts.map((workout) => workout.id)).size === source.data.workouts.length, `${profile.name} workout IDs should be unique`);
  assert(source.data.workouts.every(isSavedWorkout), `${profile.name} workouts should satisfy strict saved-workout validation`);
  assert(source.data.workouts.every((workout) => workout.completedSetCount > 0), `${profile.name} workouts should have completed sets`);

  const sourceTimes = [...source.data.workouts].reverse().map((workout) => Date.parse(workout.startedAt));
  const spanWeeks = (sourceTimes.at(-1)! - sourceTimes[0]) / (7 * 24 * 60 * 60 * 1000);
  assert(spanWeeks >= 10 && spanWeeks <= 14.5, `${profile.name} should span roughly 10–14 weeks`);

  let incompleteCount = 0;
  source.data.workouts.forEach((workout) => {
    const independentCompletedSets = workout.exercises.flatMap((entry) => entry.sets).filter(isValidCompletedSavedSet);
    incompleteCount += workout.exercises.flatMap((entry) => entry.sets).filter((entry) => !entry.complete).length;
    const summary = calculateSavedWorkoutSummary(workout.exercises);
    assert(summary.completedSetCount === independentCompletedSets.length, `${workout.id} completed-set summary should be derived`);
    assert(summary.totalVolume === independentCompletedSets.reduce((total, entry) => total + entry.weight! * entry.reps!, 0), `${workout.id} incomplete sets should not affect volume`);
  });
  assert(incompleteCount > 0, `${profile.name} should contain incomplete sets`);

  const aligned = alignDemoProfileToReferenceDate(profile, referenceDate);
  alignedById.set(profile.id, aligned.data.workouts);
  const alignedChronological = [...aligned.data.workouts].reverse();
  const newest = aligned.data.workouts[0];
  assert(aligned.data.workouts.every((workout) => Date.parse(workout.finishedAt) <= referenceDate.getTime()), `${profile.name} should not move any workout into the future`);
  assert(Date.parse(newest.startedAt) >= localWeekStart(referenceDate).getTime(), `${profile.name} newest workout should support the current-week Dashboard`);
  source.data.workouts.forEach((workout, index) => {
    const shifted = aligned.data.workouts.find((candidate) => candidate.id === workout.id)!;
    assert(shifted.durationSeconds === workout.durationSeconds, `${workout.id} duration should be preserved`);
    assert(Date.parse(shifted.startedAt) - Date.parse(workout.startedAt) === aligned.offsetMilliseconds, `${workout.id} should use the single profile offset`);
    if (index > 0) {
      const sourceGap = Date.parse(source.data.workouts[index - 1].startedAt) - Date.parse(workout.startedAt);
      const alignedGap = Date.parse(aligned.data.workouts[index - 1].startedAt) - Date.parse(shifted.startedAt);
      assert(sourceGap === alignedGap, `${workout.id} date interval should be preserved`);
    }
  });

  const roundTrip = parseWorkoutCsv(serializeWorkoutHistoryToCsv(aligned.data.workouts));
  assert(roundTrip.ok, `${profile.name} aligned CSV should round-trip`);
  aligned.data.workouts.forEach((workout, index) => {
    assert(savedWorkoutsAreEqual(workout, roundTrip.data.workouts[index]), `${workout.id} should round-trip exactly`);
  });

  const featuredSessions = buildExerciseSessions(aligned.data.workouts, profile.featuredExerciseId);
  assert(featuredSessions.length >= 6, `${profile.name} featured exercise should have useful session depth`);
  assert(createEstimatedOneRepMaxSeries(featuredSessions).length >= 6, `${profile.name} should expose estimated-1RM chart data`);
  const previous = rebuildPreviousSetsFromHistory(aligned.data.workouts);
  assert((previous[profile.featuredExerciseId]?.length ?? 0) > 0, `${profile.name} should rebuild featured previous sets`);
  assert(alignedChronological.length === aligned.data.workouts.length, `${profile.name} ordering should remain intact`);
  const sourceFeatured = buildExerciseSessions(source.data.workouts, profile.featuredExerciseId).map((session) => session.bestEstimatedOneRepMax);
  assert(featuredSessions.map((session) => session.bestEstimatedOneRepMax).every((value, index) => value === sourceFeatured[index]), `${profile.name} alignment should not alter its E1RM pattern`);
});

const beginner = alignedById.get("beginner-progression")!;
const beginnerBench = buildExerciseSessions(beginner, "bench");
const beginnerChronological = [...beginnerBench].reverse();
assert(beginnerChronological.at(-1)!.bestEstimatedOneRepMax! > beginnerChronological[0].bestEstimatedOneRepMax! * 1.25, "beginner bench E1RM should rise broadly");
assert(detectPersonalRecords(beginnerBench).length >= 6, "beginner bench should contain multiple record events");
const beginnerVolumes = [...beginner].reverse().map((workout) => workout.totalVolume);
assert(average(beginnerVolumes.slice(-6)) > average(beginnerVolumes.slice(0, 6)) * 1.2, "beginner volume should rise broadly");

const plateau = alignedById.get("plateau-breakthrough")!;
const plateauBench = [...buildExerciseSessions(plateau, "bench")].reverse();
const plateauValues = plateauBench.map((session) => session.bestEstimatedOneRepMax!);
const stalled = plateauValues.slice(4, 9);
assert(Math.max(...stalled) - Math.min(...stalled) < 1, "plateau profile should contain a measurable multi-session E1RM plateau");
assert(plateauValues.at(-1)! > Math.max(...stalled) * 1.08, "plateau profile should later break through its stalled best");
assert(new Set(plateauBench.slice(4, 9).map((session) => session.volume)).size >= 3, "plateau sessions should vary volume while E1RM is stalled");

const inconsistent = alignedById.get("inconsistent-training")!;
const inconsistentTimes = [...inconsistent].reverse().map((workout) => Date.parse(workout.startedAt));
const inconsistentGaps = inconsistentTimes.slice(1).map((time, index) => (time - inconsistentTimes[index]) / 86_400_000);
assert(Math.max(...inconsistentGaps) >= 10, "inconsistent profile should contain meaningful date gaps");
const inconsistentVolumes = inconsistent.map((workout) => workout.totalVolume);
assert(Math.max(...inconsistentVolumes) / Math.min(...inconsistentVolumes) > 1.5, "inconsistent profile should have noticeably variable volume");
const inconsistentSquat = [...buildExerciseSessions(inconsistent, "squat")].reverse();
assert(inconsistentSquat.at(-1)!.bestEstimatedOneRepMax! > inconsistentSquat[0].bestEstimatedOneRepMax!, "inconsistent profile should still show some squat improvement");

assert(calculateEstimatedOneRepMax(100, 31) === null, "E1RM should be unavailable above 30 repetitions");
assert(formatWeightFromKilograms(100, "kg") === "100 kg", "kg E1RM presentation should remain canonical");
assert(formatWeightFromKilograms(100, "lb").endsWith(" lb") && formatWeightFromKilograms(100, "lb") !== "100 lb", "lb E1RM presentation should convert only for display");

const transactionStorage = new MockStorage();
const firstProfile = DEMO_PROFILES[0];
const firstHistory = alignedById.get(firstProfile.id)!;
const firstMetadata: DemoMetadata = { version: 1, profileId: firstProfile.id, activatedAt: referenceDate.toISOString() };
let transaction = writeWorkoutDataWithRollback(firstHistory, rebuildPreviousSetsFromHistory(firstHistory), {
  storage: transactionStorage,
  additionalChanges: new Map([["overload-demo-profile-v1", serialiseDemoMetadata(firstMetadata)]]),
});
assert(transaction.ok, "demo activation transaction should succeed");
assert(loadDemoMetadata(transactionStorage).metadata?.profileId === firstProfile.id, "demo metadata should identify the active profile");

const beforeFailure = new Map(transactionStorage.values);
transactionStorage.writeCount = 0;
transactionStorage.failAtWrite = 3;
const secondHistory = alignedById.get(DEMO_PROFILES[1].id)!;
transaction = writeWorkoutDataWithRollback(secondHistory, rebuildPreviousSetsFromHistory(secondHistory), {
  storage: transactionStorage,
  additionalChanges: new Map([["overload-demo-profile-v1", serialiseDemoMetadata({ version: 1, profileId: DEMO_PROFILES[1].id, activatedAt: referenceDate.toISOString() })]]),
});
assert(!transaction.ok && !transaction.rollbackFailed, "failed demo switch should roll back all writes");
assert([...beforeFailure].every(([key, value]) => transactionStorage.values.get(key) === value), "failed switch should preserve existing history and metadata");

transactionStorage.writeCount = 0;
transactionStorage.failAtWrite = 0;
transaction = writeWorkoutDataWithRollback(secondHistory, rebuildPreviousSetsFromHistory(secondHistory), {
  storage: transactionStorage,
  additionalChanges: new Map([["overload-demo-profile-v1", serialiseDemoMetadata({ version: 1, profileId: DEMO_PROFILES[1].id, activatedAt: referenceDate.toISOString() })]]),
});
assert(transaction.ok, "demo switching should replace history safely");
assert(JSON.parse(transactionStorage.getItem("lift-off-workouts-v1")!)[0].id.startsWith("demo-plateau-"), "successful switch should replace the earlier profile history");
assert(loadDemoMetadata(transactionStorage).metadata?.profileId === "plateau-breakthrough", "successful switch should update metadata with history");

const rollbackFailureStorage = new MockStorage();
rollbackFailureStorage.values = new Map(beforeFailure);
rollbackFailureStorage.failAtWrite = 3;
rollbackFailureStorage.failRollback = true;
const rollbackFailure = writeWorkoutDataWithRollback(secondHistory, rebuildPreviousSetsFromHistory(secondHistory), {
  storage: rollbackFailureStorage,
  additionalChanges: new Map([["overload-demo-profile-v1", serialiseDemoMetadata({ version: 1, profileId: DEMO_PROFILES[1].id, activatedAt: referenceDate.toISOString() })]]),
});
assert(!rollbackFailure.ok && rollbackFailure.rollbackFailed && rollbackFailure.message.includes("could not fully restore"), "rollback failure should report storage uncertainty");

const mutationStorage = new MockStorage();
mutationStorage.values = new Map(beforeFailure);
const mutation = writeWorkoutDataWithRollback(firstHistory.slice(1), rebuildPreviousSetsFromHistory(firstHistory.slice(1)), {
  storage: mutationStorage,
  additionalChanges: new Map([["overload-demo-profile-v1", null]]),
});
assert(mutation.ok && loadDemoMetadata(mutationStorage).metadata === null, "history mutation should remove named demo metadata transactionally");

const clearResult = removeStorageKeysWithRollback(WORKOUT_AND_DEMO_DATA_KEYS, "Clear demo", { storage: mutationStorage });
assert(clearResult.ok && WORKOUT_AND_DEMO_DATA_KEYS.every((key) => mutationStorage.getItem(key) === null), "clear should remove history, previous sets and demo metadata");
mutationStorage.values.set("lift-off-settings-v1", JSON.stringify({ version: 1, displayName: "Demo", weightUnit: "kg" }));
mutationStorage.values.set("overload-demo-profile-v1", serialiseDemoMetadata(firstMetadata));
const resetResult = removeStorageKeysWithRollback(ALL_APP_STORAGE_KEYS, "Reset all app data", { storage: mutationStorage });
assert(resetResult.ok && ALL_APP_STORAGE_KEYS.every((key) => mutationStorage.getItem(key) === null), "reset should remove demo metadata and every app-owned key");
assert(ALL_APP_STORAGE_KEYS.includes("lift-off-workouts-v1"), "legacy workout key must remain app-owned and compatible");
assert(ALL_APP_STORAGE_KEYS.includes("overload-demo-profile-v1"), "reset scope must include demo metadata");

console.log("Overload demo-data verification passed.");
