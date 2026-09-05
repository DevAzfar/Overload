import {
  loadWorkoutHistoryResult,
  type SavedWorkout,
} from "../src/workoutHistory";
import {
  rebuildPreviousSetsFromHistory,
  writeWorkoutDataWithRollback,
} from "../src/workoutDataControls";
import { validateEditableSet } from "../src/workoutValidation";
import { loadAppSettings } from "../src/appSettings";
import { loadCustomExercises } from "../src/customExercises";
import { loadWorkoutTemplatesResult } from "../src/workoutTemplates";
import {
  encodeWorkoutCsvText,
  parseWorkoutCsv,
  savedWorkoutsAreEqual,
  serializeWorkoutHistoryToCsv,
} from "../src/workoutCsv";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Reliability check failed: ${message}`);
}

class MockStorage {
  values = new Map<string, string>();
  failReads = false;
  failRemovals = false;
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
    if (this.failRemovals) throw new Error("remove failure");
    this.values.delete(key);
  }
}

function workout(overrides: Partial<SavedWorkout> = {}): SavedWorkout {
  return {
    id: "workout-1",
    name: "Upper body",
    startedAt: "2026-09-05T08:00:00.000Z",
    finishedAt: "2026-09-05T09:01:02.000Z",
    durationSeconds: 3662,
    exercises: [{
      exerciseId: "bench",
      name: "Bench press",
      muscle: "Chest",
      equipment: "Barbell",
      sets: [
        { weight: 82.75, reps: 5.5, rpe: 8.25, complete: true },
        { weight: null, reps: null, rpe: null, complete: false },
      ],
    }],
    totalVolume: 455.125,
    exerciseCount: 1,
    completedSetCount: 1,
    ...overrides,
  };
}

function checkHistoryRecovery() {
  const storage = new MockStorage();
  const olderDuplicate = workout({ startedAt: "2026-09-01T08:00:00.000Z", name: "Older duplicate" });
  const newest = workout({ totalVolume: 999, completedSetCount: 99, exerciseCount: 99 });
  const legacy = workout({
    id: "legacy",
    startedAt: "2026-08-01T08:00:00.000Z",
    exercises: [{
      exerciseId: "legacy-lift",
      name: "Legacy lift",
      muscle: "Other",
      equipment: "Other",
      sets: [{ weight: 10, reps: 2, rpe: 11, complete: true }],
    }],
    totalVolume: 20,
    completedSetCount: 1,
    exerciseCount: 1,
  });
  storage.values.set("lift-off-workouts-v1", JSON.stringify([olderDuplicate, legacy, newest, { broken: true }]));
  const recovered = loadWorkoutHistoryResult(storage);
  assert(recovered.status === "recovered", "recoverable History should report recovered status");
  assert(recovered.data.length === 2, "invalid and older duplicate records should be ignored");
  assert(recovered.discardedItemCount === 2, "discarded History records should be counted for mutation warnings");
  assert(recovered.data[0].name === newest.name, "newest duplicate should be retained");
  assert(recovered.data[0].totalVolume === 455.125, "stored summary mismatch should be derived from sets");
  assert(recovered.message.includes("duplicate") && recovered.message.includes("summary") && recovered.message.includes("legacy RPE"), "recovery warning should explain each recovery type");
  assert(storage.values.get("lift-off-workouts-v1")?.includes("Older duplicate"), "loading must not rewrite recovered History");

  const missing = loadWorkoutHistoryResult(new MockStorage());
  assert(missing.status === "missing", "missing History should not be reported as failure");
  const unavailableStorage = new MockStorage();
  unavailableStorage.failReads = true;
  assert(loadWorkoutHistoryResult(unavailableStorage).status === "unavailable", "read failure should remain distinct from empty History");
  const failedRecovery = new MockStorage();
  failedRecovery.values.set("lift-off-workouts-v1", "not-json");
  failedRecovery.failRemovals = true;
  assert(loadWorkoutHistoryResult(failedRecovery).status === "recovery-failed", "failed corrupt-data removal should be explicit");
}

function checkStrictSetValidation() {
  assert(validateEditableSet({ weight: "", reps: "", rpe: "", complete: false }, "kg").canonicalSet !== null, "blank incomplete set should remain valid");
  assert(validateEditableSet({ weight: "-1", reps: "", rpe: "", complete: false }, "kg").canonicalSet === null, "negative incomplete weight must fail");
  assert(validateEditableSet({ weight: "", reps: "0", rpe: "", complete: false }, "kg").canonicalSet === null, "non-positive incomplete reps must fail");
  assert(validateEditableSet({ weight: "", reps: "", rpe: "11", complete: false }, "kg").canonicalSet === null, "new out-of-range incomplete RPE must fail");
  assert(validateEditableSet({ weight: "0", reps: "8", rpe: "", complete: true }, "kg").canonicalSet?.complete, "zero-weight bodyweight set should remain valid");
}

function checkOtherStructuredLoads() {
  const unavailable = new MockStorage();
  unavailable.failReads = true;
  assert(loadAppSettings(unavailable).status === "unavailable", "settings read failure should be distinct from missing settings");

  const custom = new MockStorage();
  custom.values.set("lift-off-custom-exercises-v1", JSON.stringify({
    version: 1,
    exercises: [
      { id: "custom-safe", name: "Safe custom", muscle: "Chest", equipment: "Barbell", kind: "custom" },
      { broken: true },
    ],
  }));
  const customResult = loadCustomExercises(custom);
  assert(customResult.status === "recovered" && customResult.exercises.length === 1, "custom-exercise loading should preserve valid entries and report recovery");

  const templates = new MockStorage();
  templates.values.set("lift-off-workout-templates-v1", JSON.stringify({
    version: 1,
    templates: [{ id: "template-custom", name: "Custom", exerciseIds: ["custom-safe"], kind: "custom" }],
  }));
  const templateResult = loadWorkoutTemplatesResult(templates);
  assert(templateResult.status === "recovered", "missing built-ins should be restored with recovered status");
  assert(templateResult.templates.length === 3, "valid custom template and both source built-ins should be retained");
}

function checkCoordinatedRollback() {
  const history = [workout()];
  const previous = rebuildPreviousSetsFromHistory(history);
  const storage = new MockStorage();
  storage.values.set("lift-off-workouts-v1", "old-history");
  storage.values.set("lift-off-previous-sets", "old-previous");
  storage.failWriteNumber = 2;
  const result = writeWorkoutDataWithRollback(history, previous, { storage });
  assert(!result.ok, "second-write failure should fail the coordinated mutation");
  assert("rollbackFailed" in result && !result.rollbackFailed, "second-write failure should report a successful rollback");
  assert(storage.values.get("lift-off-workouts-v1") === "old-history", "History snapshot should be restored");
  assert(storage.values.get("lift-off-previous-sets") === "old-previous", "previous-set snapshot should be restored");

  const conflictStorage = new MockStorage();
  const conflict = writeWorkoutDataWithRollback(history, previous, {
    storage: conflictStorage,
    expectedRawValues: new Map([["lift-off-workouts-v1", "different"], ["lift-off-previous-sets", null]]),
  });
  assert(!conflict.ok, "changed raw storage must fail the write");
  assert("conflict" in conflict && conflict.conflict, "changed raw storage must block the write before mutation");
}

function checkCsvRoundTrip() {
  const dangerousNames = [
    "=SUM(A1:A2)",
    "+example",
    "-example",
    "@example",
    "'example",
    "''example",
    "\\=example",
  ];
  const records = dangerousNames.map((name, index) => workout({
    id: `formula-${index}`,
    name,
    startedAt: new Date(Date.UTC(2026, 8, 5 - index, 8)).toISOString(),
  }));
  records.push(workout({
    id: "representative",
    name: "Commas, \"quotes\"\nand newlines",
    exercises: [
      {
        exerciseId: "repeat-id",
        name: "Row, pull \"wide\"\nvariation",
        muscle: "Back",
        equipment: "Cable",
        sets: [
          { weight: 33.333333333333336, reps: 7.25, rpe: 8.75, complete: true },
          { weight: null, reps: null, rpe: null, complete: false },
        ],
      },
      {
        exerciseId: "repeat-id",
        name: "Repeated occurrence",
        muscle: "Back",
        equipment: "Cable",
        sets: [{ weight: 0, reps: 12.5, rpe: null, complete: true }],
      },
    ],
    totalVolume: 241.66666666666669,
    exerciseCount: 2,
    completedSetCount: 2,
  }));

  const csv = serializeWorkoutHistoryToCsv(records);
  dangerousNames.forEach((name) => {
    const encoded = encodeWorkoutCsvText(name);
    assert(csv.includes(encoded), `CSV should contain the deterministic representation for ${name}`);
    if (/^[=+\-@']/.test(name)) {
      assert(encoded.startsWith("~lift-off:b64:"), `dangerous name ${name} should use reversible formula-safe encoding`);
    }
  });
  const parsed = parseWorkoutCsv(csv);
  if ("error" in parsed) throw new Error(`Reliability check failed: ${parsed.error}`);
  assert(parsed.ok, "CSV should parse");
  assert(parsed.data.workouts.length === records.length, "round trip should preserve workout count");
  records.forEach((original) => {
    const restored = parsed.data.workouts.find((candidate) => candidate.id === original.id);
    assert(restored && savedWorkoutsAreEqual(original, restored), `round trip should preserve ${original.id}`);
  });

  const legacyCsv = serializeWorkoutHistoryToCsv([workout({
    id: "legacy-csv",
    exercises: [{
      exerciseId: "historical-only",
      name: "Historical only",
      muscle: "Snapshot muscle",
      equipment: "Snapshot equipment",
      sets: [{ weight: 1.5, reps: 2.5, rpe: 12, complete: true }],
    }],
    totalVolume: 3.75,
    exerciseCount: 1,
    completedSetCount: 1,
  })]);
  const legacyParsed = parseWorkoutCsv(legacyCsv);
  assert(legacyParsed.ok && legacyParsed.data.legacyRpeCount === 1, "schema-v1 legacy RPE should be preserved with a warning count");
}

checkHistoryRecovery();
checkStrictSetValidation();
checkOtherStructuredLoads();
checkCoordinatedRollback();
checkCsvRoundTrip();
console.log("Lift Off reliability checks passed.");
