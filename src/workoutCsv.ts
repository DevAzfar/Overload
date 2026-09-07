import {
  calculateSavedWorkoutSummary,
  isSavedWorkout,
  isValidCompletedSavedSet,
  type SavedWorkout,
  type SavedWorkoutExercise,
  type SavedWorkoutSet,
} from "./workoutHistory";

export const WORKOUT_CSV_SCHEMA_VERSION = "1";
export const WORKOUT_CSV_MAX_FILE_SIZE = 5 * 1024 * 1024;
export const WORKOUT_CSV_MAX_ROWS = 100_000;
export const WORKOUT_CSV_MAX_WORKOUTS = 5_000;
export const WORKOUT_CSV_MAX_EXERCISES_PER_WORKOUT = 100;
export const WORKOUT_CSV_MAX_SETS_PER_EXERCISE = 200;
export const WORKOUT_CSV_MAX_TEXT_LENGTH = 200;

export const WORKOUT_CSV_HEADERS = Object.freeze([
  "schema_version",
  "workout_id",
  "workout_name",
  "started_at",
  "finished_at",
  "duration_seconds",
  "exercise_index",
  "exercise_id",
  "exercise_name",
  "muscle",
  "equipment",
  "set_index",
  "weight_kg",
  "reps",
  "rpe",
  "complete",
] as const);

const TEXT_ENCODING_PREFIX = "~lift-off:b64:";
const DANGEROUS_FORMULA_START = /^\s*[=+\-@']/u;
const STRICT_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

export type WorkoutCsvImport = {
  workouts: SavedWorkout[];
  workoutCount: number;
  exerciseCount: number;
  setCount: number;
  earliestStartedAt: string;
  latestStartedAt: string;
  legacyRpeCount: number;
};

export type WorkoutCsvParseResult =
  | { ok: true; data: WorkoutCsvImport }
  | { ok: false; error: string };

export type WorkoutImportConflicts = {
  exactDuplicateIds: string[];
  conflictingIds: string[];
  newWorkoutCount: number;
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error("Invalid encoded text");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function encodeWorkoutCsvText(value: string): string {
  if (!value.startsWith(TEXT_ENCODING_PREFIX) && !DANGEROUS_FORMULA_START.test(value)) return value;
  return `${TEXT_ENCODING_PREFIX}${bytesToBase64Url(new TextEncoder().encode(value))}`;
}

export function decodeWorkoutCsvText(value: string): string {
  if (!value.startsWith(TEXT_ENCODING_PREFIX)) return value;
  const encoded = value.slice(TEXT_ENCODING_PREFIX.length);
  return new TextDecoder("utf-8", { fatal: true }).decode(base64UrlToBytes(encoded));
}

function escapeCsvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function optionalNumberCell(value: number | null): string {
  return value === null ? "" : String(value);
}

function validateExportText(value: string, label: string, trimRequired = false): void {
  if (value.trim() === "") throw new Error(`${label} is required before this workout can be exported.`);
  if (value.length > WORKOUT_CSV_MAX_TEXT_LENGTH) {
    throw new Error(`${label} exceeds the ${WORKOUT_CSV_MAX_TEXT_LENGTH}-character CSV limit.`);
  }
  if (trimRequired && value !== value.trim()) {
    throw new Error(`${label} cannot start or end with whitespace.`);
  }
}

export function serializeWorkoutHistoryToCsv(history: readonly SavedWorkout[]): string {
  if (history.length > WORKOUT_CSV_MAX_WORKOUTS) {
    throw new Error(`Workout history exceeds the ${WORKOUT_CSV_MAX_WORKOUTS.toLocaleString()}-workout CSV limit.`);
  }
  const rows: string[][] = [[...WORKOUT_CSV_HEADERS]];
  const seenWorkoutIds = new Set<string>();

  history.forEach((workout) => {
    if (!isSavedWorkout(workout)) throw new Error("A workout is not valid and cannot be exported.");
    validateExportText(workout.id, `Workout ID ${workout.id || "(blank)"}`, true);
    if (seenWorkoutIds.has(workout.id)) throw new Error(`Workout ID ${workout.id} appears more than once and cannot be reconstructed unambiguously.`);
    seenWorkoutIds.add(workout.id);
    validateExportText(workout.name, `Workout ${workout.id} name`);
    validateExportText(workout.startedAt, `Workout ${workout.id} start timestamp`, true);
    validateExportText(workout.finishedAt, `Workout ${workout.id} finish timestamp`, true);
    if (!Number.isSafeInteger(workout.durationSeconds)) {
      throw new Error(`Workout ${workout.id} duration must be a non-negative safe integer for CSV restoration.`);
    }
    if (workout.exercises.length === 0 || workout.exercises.some((exercise) => exercise.sets.length === 0)) {
      throw new Error(`Workout ${workout.id} contains an exercise without set rows and cannot be reconstructed safely from CSV.`);
    }
    if (workout.exercises.length > WORKOUT_CSV_MAX_EXERCISES_PER_WORKOUT) {
      throw new Error(`Workout ${workout.id} exceeds the ${WORKOUT_CSV_MAX_EXERCISES_PER_WORKOUT}-exercise CSV limit.`);
    }

    workout.exercises.forEach((exercise, exerciseIndex) => {
      validateExportText(exercise.exerciseId, `Workout ${workout.id} exercise ${exerciseIndex + 1} ID`, true);
      validateExportText(exercise.name, `Workout ${workout.id} exercise ${exerciseIndex + 1} name`);
      validateExportText(exercise.muscle, `Workout ${workout.id} exercise ${exerciseIndex + 1} muscle`);
      validateExportText(exercise.equipment, `Workout ${workout.id} exercise ${exerciseIndex + 1} equipment`);
      if (exercise.sets.length > WORKOUT_CSV_MAX_SETS_PER_EXERCISE) {
        throw new Error(`Workout ${workout.id} exercise ${exerciseIndex + 1} exceeds the ${WORKOUT_CSV_MAX_SETS_PER_EXERCISE}-set CSV limit.`);
      }
      exercise.sets.forEach((set, setIndex) => {
        if (set.weight !== null && set.weight < 0) {
          throw new Error(`Workout ${workout.id} exercise ${exerciseIndex + 1} set ${setIndex + 1} has a negative weight.`);
        }
        if (set.reps !== null && set.reps <= 0) {
          throw new Error(`Workout ${workout.id} exercise ${exerciseIndex + 1} set ${setIndex + 1} has non-positive repetitions.`);
        }
        if (rows.length > WORKOUT_CSV_MAX_ROWS) {
          throw new Error(`Workout history exceeds the ${WORKOUT_CSV_MAX_ROWS.toLocaleString()}-row CSV limit.`);
        }
        rows.push([
          WORKOUT_CSV_SCHEMA_VERSION,
          encodeWorkoutCsvText(workout.id),
          encodeWorkoutCsvText(workout.name),
          encodeWorkoutCsvText(workout.startedAt),
          encodeWorkoutCsvText(workout.finishedAt),
          String(workout.durationSeconds),
          String(exerciseIndex),
          encodeWorkoutCsvText(exercise.exerciseId),
          encodeWorkoutCsvText(exercise.name),
          encodeWorkoutCsvText(exercise.muscle),
          encodeWorkoutCsvText(exercise.equipment),
          String(setIndex),
          optionalNumberCell(set.weight),
          optionalNumberCell(set.reps),
          optionalNumberCell(set.rpe),
          String(set.complete),
        ]);
      });
    });
  });

  const csv = `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")}\r\n`;
  if (new Blob([csv]).size > WORKOUT_CSV_MAX_FILE_SIZE) {
    throw new Error(`The generated CSV exceeds the ${WORKOUT_CSV_MAX_FILE_SIZE / 1024 / 1024} MiB import limit.`);
  }
  return csv;
}

function parseCsvRows(source: string): string[][] {
  const text = source.startsWith("\uFEFF") ? source.slice(1) : source;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let quoteClosed = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          quoteClosed = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (quoteClosed) {
      if (character === ",") {
        row.push(field);
        field = "";
        quoteClosed = false;
      } else if (character === "\r" || character === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        quoteClosed = false;
        if (character === "\r" && text[index + 1] === "\n") index += 1;
      } else {
        throw new Error("A quoted CSV field must be followed by a comma or line ending.");
      }
    } else if (character === '"') {
      if (field.length > 0) throw new Error("A quotation mark appears inside an unquoted CSV field.");
      inQuotes = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\r" || character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (character === "\r" && text[index + 1] === "\n") index += 1;
    } else {
      field += character;
    }
  }

  if (inQuotes) throw new Error("The CSV ends inside a quoted field.");
  if (field.length > 0 || row.length > 0 || quoteClosed) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function requiredText(cell: string, label: string, rowNumber: number, trimRequired = false): string {
  let decoded: string;
  try {
    decoded = decodeWorkoutCsvText(cell);
  } catch {
    throw new Error(`Row ${rowNumber}: ${label} contains invalid reversible text encoding.`);
  }
  if (decoded.trim() === "") throw new Error(`Row ${rowNumber}: ${label} is required.`);
  if (decoded.length > WORKOUT_CSV_MAX_TEXT_LENGTH) {
    throw new Error(`Row ${rowNumber}: ${label} exceeds ${WORKOUT_CSV_MAX_TEXT_LENGTH} characters.`);
  }
  if (trimRequired && decoded !== decoded.trim()) throw new Error(`Row ${rowNumber}: ${label} cannot start or end with whitespace.`);
  return decoded;
}

function parseRequiredInteger(cell: string, label: string, rowNumber: number): number {
  if (!/^\d+$/.test(cell)) throw new Error(`Row ${rowNumber}: ${label} must be a non-negative integer.`);
  const value = Number(cell);
  if (!Number.isSafeInteger(value)) throw new Error(`Row ${rowNumber}: ${label} is too large.`);
  return value;
}

function parseOptionalNumber(cell: string, label: string, rowNumber: number): number | null {
  if (cell === "") return null;
  if (!STRICT_NUMBER.test(cell)) throw new Error(`Row ${rowNumber}: ${label} must be a finite number or a blank cell.`);
  const value = Number(cell);
  if (!Number.isFinite(value)) throw new Error(`Row ${rowNumber}: ${label} must be finite.`);
  return value;
}

function parseBoolean(cell: string, rowNumber: number): boolean {
  if (cell === "true") return true;
  if (cell === "false") return false;
  throw new Error(`Row ${rowNumber}: complete must be exactly true or false.`);
}

type ExerciseAccumulator = {
  exerciseId: string;
  name: string;
  muscle: string;
  equipment: string;
  sets: Map<number, SavedWorkoutSet>;
};

type WorkoutAccumulator = {
  id: string;
  name: string;
  startedAt: string;
  finishedAt: string;
  durationSeconds: number;
  exercises: Map<number, ExerciseAccumulator>;
};

function sameWorkoutMetadata(accumulator: WorkoutAccumulator, candidate: Omit<WorkoutAccumulator, "exercises">): boolean {
  return accumulator.id === candidate.id &&
    accumulator.name === candidate.name &&
    accumulator.startedAt === candidate.startedAt &&
    accumulator.finishedAt === candidate.finishedAt &&
    accumulator.durationSeconds === candidate.durationSeconds;
}

function sameExerciseMetadata(accumulator: ExerciseAccumulator, candidate: Omit<ExerciseAccumulator, "sets">): boolean {
  return accumulator.exerciseId === candidate.exerciseId &&
    accumulator.name === candidate.name &&
    accumulator.muscle === candidate.muscle &&
    accumulator.equipment === candidate.equipment;
}

function ensureContiguousIndexes(indexes: number[], label: string): void {
  const sorted = [...indexes].sort((first, second) => first - second);
  sorted.forEach((value, position) => {
    if (value !== position) throw new Error(`${label} indexes must start at 0 and remain contiguous.`);
  });
}

export function parseWorkoutCsv(source: string): WorkoutCsvParseResult {
  if (new Blob([source]).size > WORKOUT_CSV_MAX_FILE_SIZE) {
    return { ok: false, error: `The CSV exceeds the ${WORKOUT_CSV_MAX_FILE_SIZE / 1024 / 1024} MiB limit.` };
  }

  try {
    const rows = parseCsvRows(source);
    if (rows.length === 0) throw new Error("The CSV is empty.");
    const header = rows[0];
    if (header.length !== WORKOUT_CSV_HEADERS.length ||
      header.some((cell, index) => cell !== WORKOUT_CSV_HEADERS[index])) {
      throw new Error(`CSV headers must exactly match: ${WORKOUT_CSV_HEADERS.join(", ")}.`);
    }

    const dataRows = rows.slice(1);
    if (dataRows.length === 0) throw new Error("The CSV contains headers but no workout sets.");
    if (dataRows.length > WORKOUT_CSV_MAX_ROWS) throw new Error(`The CSV exceeds the ${WORKOUT_CSV_MAX_ROWS.toLocaleString()}-row limit.`);

    const workouts = new Map<string, WorkoutAccumulator>();
    let legacyRpeCount = 0;
    dataRows.forEach((cells, dataIndex) => {
      const rowNumber = dataIndex + 2;
      if (cells.length !== WORKOUT_CSV_HEADERS.length) {
        throw new Error(`Row ${rowNumber}: expected ${WORKOUT_CSV_HEADERS.length} columns but found ${cells.length}.`);
      }
      if (cells[0] !== WORKOUT_CSV_SCHEMA_VERSION) {
        throw new Error(`Row ${rowNumber}: unsupported schema version ${cells[0] || "(blank)"}; supported version is ${WORKOUT_CSV_SCHEMA_VERSION}.`);
      }

      const id = requiredText(cells[1], "workout_id", rowNumber, true);
      const name = requiredText(cells[2], "workout_name", rowNumber);
      const startedAt = requiredText(cells[3], "started_at", rowNumber, true);
      const finishedAt = requiredText(cells[4], "finished_at", rowNumber, true);
      if (!Number.isFinite(Date.parse(startedAt)) || !Number.isFinite(Date.parse(finishedAt))) {
        throw new Error(`Row ${rowNumber}: started_at and finished_at must be valid timestamps.`);
      }
      if (Date.parse(finishedAt) < Date.parse(startedAt)) throw new Error(`Row ${rowNumber}: finished_at cannot be before started_at.`);
      const durationSeconds = parseRequiredInteger(cells[5], "duration_seconds", rowNumber);
      const exerciseIndex = parseRequiredInteger(cells[6], "exercise_index", rowNumber);
      const exerciseId = requiredText(cells[7], "exercise_id", rowNumber, true);
      const exerciseName = requiredText(cells[8], "exercise_name", rowNumber);
      const muscle = requiredText(cells[9], "muscle", rowNumber);
      const equipment = requiredText(cells[10], "equipment", rowNumber);
      const setIndex = parseRequiredInteger(cells[11], "set_index", rowNumber);
      const set: SavedWorkoutSet = {
        weight: parseOptionalNumber(cells[12], "weight_kg", rowNumber),
        reps: parseOptionalNumber(cells[13], "reps", rowNumber),
        rpe: parseOptionalNumber(cells[14], "rpe", rowNumber),
        complete: parseBoolean(cells[15], rowNumber),
      };
      if (set.weight !== null && set.weight < 0) {
        throw new Error(`Row ${rowNumber}: weight_kg cannot be negative.`);
      }
      if (set.reps !== null && set.reps <= 0) {
        throw new Error(`Row ${rowNumber}: reps must be greater than zero when supplied.`);
      }
      if (set.rpe !== null && (set.rpe < 1 || set.rpe > 10)) legacyRpeCount += 1;
      if (set.complete && !isValidCompletedSavedSet(set)) {
        throw new Error(`Row ${rowNumber}: a completed set requires non-negative weight_kg, repetitions above zero and an optional finite RPE.`);
      }

      const workoutMetadata = { id, name, startedAt, finishedAt, durationSeconds };
      let workout = workouts.get(id);
      if (!workout) {
        if (workouts.size >= WORKOUT_CSV_MAX_WORKOUTS) throw new Error(`The CSV exceeds the ${WORKOUT_CSV_MAX_WORKOUTS.toLocaleString()}-workout limit.`);
        workout = { ...workoutMetadata, exercises: new Map() };
        workouts.set(id, workout);
      } else if (!sameWorkoutMetadata(workout, workoutMetadata)) {
        throw new Error(`Row ${rowNumber}: repeated workout ID ${id} has inconsistent workout metadata.`);
      }

      const exerciseMetadata = { exerciseId, name: exerciseName, muscle, equipment };
      let exercise = workout.exercises.get(exerciseIndex);
      if (!exercise) {
        if (workout.exercises.size >= WORKOUT_CSV_MAX_EXERCISES_PER_WORKOUT) {
          throw new Error(`Workout ${id} exceeds the ${WORKOUT_CSV_MAX_EXERCISES_PER_WORKOUT}-exercise limit.`);
        }
        exercise = { ...exerciseMetadata, sets: new Map() };
        workout.exercises.set(exerciseIndex, exercise);
      } else if (!sameExerciseMetadata(exercise, exerciseMetadata)) {
        throw new Error(`Row ${rowNumber}: exercise occurrence ${exerciseIndex} in workout ${id} has inconsistent metadata.`);
      }

      if (setIndex >= WORKOUT_CSV_MAX_SETS_PER_EXERCISE) {
        throw new Error(`Row ${rowNumber}: set_index exceeds the ${WORKOUT_CSV_MAX_SETS_PER_EXERCISE}-set limit.`);
      }
      if (exercise.sets.has(setIndex)) {
        throw new Error(`Row ${rowNumber}: duplicate set_index ${setIndex} for exercise occurrence ${exerciseIndex} in workout ${id}.`);
      }
      exercise.sets.set(setIndex, set);
    });

    let exerciseCount = 0;
    const reconstructed = [...workouts.values()].map((workout) => {
      ensureContiguousIndexes([...workout.exercises.keys()], `Workout ${workout.id} exercise`);
      const exercises: SavedWorkoutExercise[] = [...workout.exercises.entries()]
        .sort(([first], [second]) => first - second)
        .map(([exerciseIndex, exercise]) => {
          ensureContiguousIndexes([...exercise.sets.keys()], `Workout ${workout.id} exercise ${exerciseIndex} set`);
          return {
            exerciseId: exercise.exerciseId,
            name: exercise.name,
            muscle: exercise.muscle,
            equipment: exercise.equipment,
            sets: [...exercise.sets.entries()].sort(([first], [second]) => first - second).map(([, set]) => set),
          };
        });
      exerciseCount += exercises.length;
      const summary = calculateSavedWorkoutSummary(exercises);
      const savedWorkout: SavedWorkout = {
        id: workout.id,
        name: workout.name,
        startedAt: workout.startedAt,
        finishedAt: workout.finishedAt,
        durationSeconds: workout.durationSeconds,
        exercises,
        ...summary,
      };
      if (!isSavedWorkout(savedWorkout)) throw new Error(`Workout ${workout.id} does not satisfy Overload workout validation.`);
      return savedWorkout;
    }).sort((first, second) => Date.parse(second.startedAt) - Date.parse(first.startedAt));

    const startedTimes = reconstructed.map((workout) => Date.parse(workout.startedAt));
    return {
      ok: true,
      data: {
        workouts: reconstructed,
        workoutCount: reconstructed.length,
        exerciseCount,
        setCount: dataRows.length,
        earliestStartedAt: new Date(Math.min(...startedTimes)).toISOString(),
        latestStartedAt: new Date(Math.max(...startedTimes)).toISOString(),
        legacyRpeCount,
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The CSV could not be validated." };
  }
}

export function savedWorkoutsAreEqual(first: SavedWorkout, second: SavedWorkout): boolean {
  return first.id === second.id &&
    first.name === second.name &&
    first.startedAt === second.startedAt &&
    first.finishedAt === second.finishedAt &&
    first.durationSeconds === second.durationSeconds &&
    first.totalVolume === second.totalVolume &&
    first.exerciseCount === second.exerciseCount &&
    first.completedSetCount === second.completedSetCount &&
    first.exercises.length === second.exercises.length &&
    first.exercises.every((exercise, exerciseIndex) => {
      const otherExercise = second.exercises[exerciseIndex];
      return exercise.exerciseId === otherExercise.exerciseId &&
        exercise.name === otherExercise.name &&
        exercise.muscle === otherExercise.muscle &&
        exercise.equipment === otherExercise.equipment &&
        exercise.sets.length === otherExercise.sets.length &&
        exercise.sets.every((set, setIndex) => {
          const otherSet = otherExercise.sets[setIndex];
          return set.weight === otherSet.weight &&
            set.reps === otherSet.reps &&
            set.rpe === otherSet.rpe &&
            set.complete === otherSet.complete;
        });
    });
}

export function analyseWorkoutImport(
  importedWorkouts: readonly SavedWorkout[],
  existingHistory: readonly SavedWorkout[],
): WorkoutImportConflicts {
  const existingById = new Map(existingHistory.map((workout) => [workout.id, workout]));
  const exactDuplicateIds: string[] = [];
  const conflictingIds: string[] = [];
  let newWorkoutCount = 0;

  importedWorkouts.forEach((workout) => {
    const existing = existingById.get(workout.id);
    if (!existing) newWorkoutCount += 1;
    else if (savedWorkoutsAreEqual(workout, existing)) exactDuplicateIds.push(workout.id);
    else conflictingIds.push(workout.id);
  });

  return { exactDuplicateIds, conflictingIds, newWorkoutCount };
}

export function mergeWorkoutHistory(
  existingHistory: readonly SavedWorkout[],
  importedWorkouts: readonly SavedWorkout[],
  allowSkippingConflicts: boolean,
): SavedWorkout[] {
  const conflicts = analyseWorkoutImport(importedWorkouts, existingHistory);
  if (conflicts.conflictingIds.length > 0 && !allowSkippingConflicts) {
    throw new Error("Conflicting workout IDs must be explicitly kept as existing records or resolved with Replace.");
  }

  const existingIds = new Set(existingHistory.map((workout) => workout.id));
  return [
    ...existingHistory,
    ...importedWorkouts.filter((workout) => !existingIds.has(workout.id)),
  ].sort((first, second) => Date.parse(second.startedAt) - Date.parse(first.startedAt));
}

export function createWorkoutCsvFilename(referenceDate = new Date()): string {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, "0");
  const day = String(referenceDate.getDate()).padStart(2, "0");
  return `overload-workouts-${year}-${month}-${day}.csv`;
}
