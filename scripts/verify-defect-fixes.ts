import {
  ACTIVE_WORKOUT_DRAFT_KEY,
  activeDraftHasEnteredData,
  calculateActiveWorkoutElapsedSeconds,
  isActiveWorkoutDraft,
  loadActiveWorkoutDraft,
  removeActiveWorkoutDraft,
  removeDraftExercise,
  removeDraftSet,
  saveActiveWorkoutDraft,
  serialiseActiveWorkoutDraft,
  type ActiveWorkoutDraft,
  type ActiveWorkoutDraftExercise,
  type ActiveWorkoutDraftSet,
} from "../src/activeWorkoutDraft";
import { BUILT_IN_EXERCISES } from "../src/exercises";
import {
  buildExerciseChoices,
  calculateTimeAxisPositions,
  filterRecordedExerciseChoices,
} from "../src/progressAnalytics";
import { calculateSavedWorkoutSummary, type SavedWorkout } from "../src/workoutHistory";
import {
  ALL_APP_STORAGE_KEYS,
  WORKOUT_AND_DEMO_DATA_KEYS,
  rebuildPreviousSetsFromHistory,
  writeWorkoutDataWithRollback,
} from "../src/workoutDataControls";
import { validateEditableSet } from "../src/workoutValidation";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Defect-fix verification failed: ${message}`);
}

class MockStorage {
  values = new Map<string, string>();
  failReads = false;
  failWriteNumber = 0;
  writeCount = 0;

  getItem(key: string) {
    if (this.failReads) throw new Error("read failure");
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.writeCount += 1;
    if (this.failWriteNumber === this.writeCount) throw new Error("write failure");
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.writeCount += 1;
    if (this.failWriteNumber === this.writeCount) throw new Error("remove failure");
    this.values.delete(key);
  }
}

function draftSet(id: string, overrides: Partial<ActiveWorkoutDraftSet> = {}): ActiveWorkoutDraftSet {
  return { id, weight: "", reps: "", rpe: "", complete: false, ...overrides };
}

function draftExercise(index: number, setCount = 1): ActiveWorkoutDraftExercise {
  return {
    id: `exercise-${index}`,
    sessionId: `session-${index}`,
    name: `Exercise ${index}`,
    muscle: "Chest",
    equipment: "Barbell",
    kind: "built-in",
    sets: Array.from({ length: setCount }, (_, setIndex) => draftSet(`set-${index}-${setIndex}`)),
  };
}

function draft(unit: "kg" | "lb" = "kg", exerciseCount = 1, setCount = 1): ActiveWorkoutDraft {
  return {
    version: 1,
    workoutName: "Recovery workout",
    startedAt: 1_700_000_000_000,
    weightUnit: unit,
    exercises: Array.from({ length: exerciseCount }, (_, index) => draftExercise(index, setCount)),
  };
}

function savedWorkout(): SavedWorkout {
  const exercises = [{
    exerciseId: "bench",
    name: "Barbell Bench Press",
    muscle: "Chest",
    equipment: "Barbell",
    sets: [{ weight: 80, reps: 5, rpe: 8, complete: true }],
  }];
  return {
    id: "saved-workout",
    name: "Upper",
    startedAt: "2026-09-01T10:00:00.000Z",
    finishedAt: "2026-09-01T11:00:00.000Z",
    durationSeconds: 3_600,
    exercises,
    ...calculateSavedWorkoutSummary(exercises),
  };
}

const kgDraft = draft("kg");
kgDraft.exercises[0].sets[0] = draftSet("kg-set", { weight: "82.75", reps: "5.5", rpe: "8.25", complete: true });
const lbDraft = draft("lb");
lbDraft.exercises[0].sets[0] = draftSet("lb-set", { weight: "182.4321", reps: "5.5", rpe: "8.25", complete: true });
for (const candidate of [kgDraft, lbDraft]) {
  const storage = new MockStorage();
  const save = saveActiveWorkoutDraft(candidate, null, storage);
  assert(save.ok, `${candidate.weightUnit} draft should save`);
  const loaded = loadActiveWorkoutDraft(storage);
  assert(loaded.status === "loaded" && loaded.draft !== null, `${candidate.weightUnit} draft should load`);
  assert(loaded.draft.weightUnit === candidate.weightUnit, `${candidate.weightUnit} unit should be preserved`);
  assert(loaded.draft.exercises[0].sets[0].weight === candidate.exercises[0].sets[0].weight, `${candidate.weightUnit} raw weight should round-trip exactly`);
  assert(serialiseActiveWorkoutDraft(loaded.draft) === save.rawValue, `${candidate.weightUnit} serialization should be deterministic`);
}

assert(calculateActiveWorkoutElapsedSeconds(10_000, 15_999) === 5, "timer should resume from the saved start timestamp");
assert(activeDraftHasEnteredData(kgDraft), "entered or completed data should require confirmed discard");
assert(!activeDraftHasEnteredData(draft()), "an untouched initial set should not be described as entered data");
assert(!activeDraftHasEnteredData(draft("kg", 1, 2)), "additional blank sets alone should not be described as entered data");

const corrupt = new MockStorage();
corrupt.values.set(ACTIVE_WORKOUT_DRAFT_KEY, "not-json");
assert(loadActiveWorkoutDraft(corrupt).status === "corrupt", "corrupt draft should be rejected without crashing");
assert(corrupt.values.has(ACTIVE_WORKOUT_DRAFT_KEY), "corrupt draft should not be removed silently");
const refusedOverwrite = saveActiveWorkoutDraft(draft(), null, corrupt);
assert(!refusedOverwrite.ok && refusedOverwrite.conflict && corrupt.getItem(ACTIVE_WORKOUT_DRAFT_KEY) === "not-json", "a corrupt stored draft must not be overwritten after an invalid read");
const unsupported = new MockStorage();
unsupported.values.set(ACTIVE_WORKOUT_DRAFT_KEY, JSON.stringify({ version: 2 }));
assert(loadActiveWorkoutDraft(unsupported).status === "unsupported", "unsupported draft version should be explicit");
const unavailable = new MockStorage();
unavailable.failReads = true;
assert(loadActiveWorkoutDraft(unavailable).status === "unavailable", "failed read should differ from a missing draft");

assert(isActiveWorkoutDraft(draft("kg", 100)), "100 exercise occurrences should be accepted");
assert(!isActiveWorkoutDraft(draft("kg", 101)), "101 exercise occurrences should be rejected");
assert(isActiveWorkoutDraft(draft("kg", 1, 200)), "200 sets should be accepted");
assert(!isActiveWorkoutDraft(draft("kg", 1, 201)), "201 sets should be rejected");
const duplicateSetIds = draft("kg", 2);
duplicateSetIds.exercises[1].sets[0].id = duplicateSetIds.exercises[0].sets[0].id;
assert(!isActiveWorkoutDraft(duplicateSetIds), "set IDs should remain unique across a recovered workout");
assert(Object.keys(validateEditableSet(kgDraft.exercises[0].sets[0], "kg").errors).length === 0, "valid decimal fields should pass the shared set validator");
assert(Object.keys(validateEditableSet(draftSet("invalid", { weight: "-1", reps: "0", rpe: "11", complete: true }), "kg").errors).length === 3, "invalid completed fields should report every field error");

const orderedExercise = draftExercise(0, 3);
const afterSetRemoval = removeDraftSet([orderedExercise], orderedExercise.sessionId, orderedExercise.sets[1].id);
assert(afterSetRemoval[0].sets.map((set) => set.id).join(",") === "set-0-0,set-0-2", "set removal should preserve remaining stable order");
assert(removeDraftSet([draftExercise(0)], "session-0", "set-0-0")[0].sets.length === 1, "the only set must not be removed");
const exercisesBeforeCancelledRemoval = [draftExercise(0), draftExercise(1)];
assert(exercisesBeforeCancelledRemoval.length === 2, "cancelling exercise removal should leave the untouched collection available");
assert(removeDraftExercise(exercisesBeforeCancelledRemoval, "session-0").map((exercise) => exercise.sessionId).join(",") === "session-1", "confirmed exercise removal should target only its stable session ID");

assert(Object.keys(rebuildPreviousSetsFromHistory([])).length === 0, "empty History should produce no previous-set values");

const historicalOnlyWorkout = savedWorkout();
historicalOnlyWorkout.exercises.push({
  exerciseId: "historical-only",
  name: "Archived Row",
  muscle: "Back",
  equipment: "Cable",
  sets: [{ weight: null, reps: null, rpe: null, complete: false }],
});
historicalOnlyWorkout.exerciseCount = 2;
const choices = buildExerciseChoices([historicalOnlyWorkout], BUILT_IN_EXERCISES);
assert(choices.length === 2, "Progress choices should include recorded IDs only, including historical-only IDs");
assert(!choices.some((choice) => choice.exerciseId === "squat"), "unrecorded library exercises should remain absent from Progress");
assert(filterRecordedExerciseChoices(choices, "  archived ROW ").map((choice) => choice.exerciseId).join() === "historical-only", "recorded exercise search should be trimmed and case-insensitive");

assert(calculateTimeAxisPositions([{ startedAt: "2026-01-01T00:00:00Z" }], 100, 5)[0] === 50, "single chart point should be centred");
assert(calculateTimeAxisPositions([
  { startedAt: "2026-01-01T00:00:00Z" },
  { startedAt: "2026-01-01T00:00:00Z" },
], 100, 5).every((position) => position === 50), "identical timestamps should not divide by zero");
const spaced = calculateTimeAxisPositions([
  { startedAt: "2026-01-01T00:00:00Z" },
  { startedAt: "2026-01-02T00:00:00Z" },
  { startedAt: "2026-01-22T00:00:00Z" },
], 100, 5);
assert(spaced[1] - spaced[0] < spaced[2] - spaced[1], "chart spacing should reflect actual elapsed time");

const finishStorage = new MockStorage();
const savedDraftRaw = serialiseActiveWorkoutDraft(kgDraft);
finishStorage.values.set(ACTIVE_WORKOUT_DRAFT_KEY, savedDraftRaw);
const workout = savedWorkout();
const finish = writeWorkoutDataWithRollback([workout], rebuildPreviousSetsFromHistory([workout]), {
  storage: finishStorage,
  expectedRawValues: new Map([
    ["lift-off-workouts-v1", null],
    ["lift-off-previous-sets", null],
    [ACTIVE_WORKOUT_DRAFT_KEY, savedDraftRaw],
  ]),
  additionalChanges: new Map([[ACTIVE_WORKOUT_DRAFT_KEY, null]]),
});
assert(finish.ok && finishStorage.getItem(ACTIVE_WORKOUT_DRAFT_KEY) === null, "successful History write should clear the active draft transactionally");

const failedFinishStorage = new MockStorage();
failedFinishStorage.values.set(ACTIVE_WORKOUT_DRAFT_KEY, savedDraftRaw);
failedFinishStorage.failWriteNumber = 2;
const failedFinish = writeWorkoutDataWithRollback([workout], rebuildPreviousSetsFromHistory([workout]), {
  storage: failedFinishStorage,
  additionalChanges: new Map([[ACTIVE_WORKOUT_DRAFT_KEY, null]]),
});
assert(!failedFinish.ok && failedFinishStorage.getItem(ACTIVE_WORKOUT_DRAFT_KEY) === savedDraftRaw, "failed History write should preserve the active draft after rollback");

const discardStorage = new MockStorage();
discardStorage.values.set(ACTIVE_WORKOUT_DRAFT_KEY, savedDraftRaw);
assert(removeActiveWorkoutDraft(savedDraftRaw, discardStorage).ok && discardStorage.getItem(ACTIVE_WORKOUT_DRAFT_KEY) === null, "explicit discard should remove only the expected draft");
assert(ALL_APP_STORAGE_KEYS.includes(ACTIVE_WORKOUT_DRAFT_KEY), "Reset all app data should include the active draft key");
assert(!WORKOUT_AND_DEMO_DATA_KEYS.includes(ACTIVE_WORKOUT_DRAFT_KEY as never), "ordinary workout-data clearing should preserve the active draft key");

console.log("Overload defect-fix verification passed.");
