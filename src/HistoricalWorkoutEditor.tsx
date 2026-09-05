import { useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import { cloneSavedWorkout, withRecalculatedWorkoutSummary } from "./historyMutations";
import type { ActionResult } from "./storageTypes";
import {
  hasSetFieldErrors,
  isRpeOutsideCurrentRange,
  validateEditableSet,
  validateWorkoutName,
  type EditableSetFields,
  type SetFieldErrors,
  type SetFieldName,
} from "./workoutValidation";
import type { SavedWorkout, SavedWorkoutExercise, SavedWorkoutSet } from "./workoutHistory";
import { formatWeightInputFromKilograms, type WeightUnit } from "./weightUnits";

type DraftSet = EditableSetFields & {
  originalWeightKg: number | null;
  weightChanged: boolean;
  originalRpe: number | null;
};

type DraftExercise = Omit<SavedWorkoutExercise, "sets"> & { sets: DraftSet[] };

type HistoricalWorkoutEditorProps = {
  workout: SavedWorkout;
  weightUnit: WeightUnit;
  recoveredHistoryWillBeSaved: boolean;
  onSave: (workout: SavedWorkout) => ActionResult;
  onCancel: () => void;
};

function toInputNumber(value: number | null) {
  return value === null ? "" : String(value);
}

function createDraft(workout: SavedWorkout, weightUnit: WeightUnit) {
  return cloneSavedWorkout(workout).exercises.map<DraftExercise>((exercise) => ({
    ...exercise,
    sets: exercise.sets.map((set) => {
      const weight = set.weight === null ? "" : formatWeightInputFromKilograms(set.weight, weightUnit);
      return {
        weight,
        reps: toInputNumber(set.reps),
        rpe: toInputNumber(set.rpe),
        complete: set.complete,
        originalWeightKg: set.weight,
        weightChanged: false,
        originalRpe: set.rpe,
      };
    }),
  }));
}

function fieldId(exerciseIndex: number, setIndex: number, field: SetFieldName) {
  return `history-edit-${exerciseIndex}-${setIndex}-${field}`;
}

function validateDraftSet(set: DraftSet, weightUnit: WeightUnit) {
  return validateEditableSet(set, weightUnit);
}

function toCanonicalSet(set: DraftSet, weightUnit: WeightUnit): SavedWorkoutSet | null {
  const result = validateDraftSet(set, weightUnit);
  if (!result.canonicalSet) return null;
  return {
    ...result.canonicalSet,
    weight: set.weightChanged ? result.canonicalSet.weight : set.originalWeightKg,
  };
}

function countValidCompletedSets(exercises: DraftExercise[], weightUnit: WeightUnit, ignored?: [number, number]) {
  return exercises.reduce((count, exercise, exerciseIndex) => count + exercise.sets.reduce((setCount, set, setIndex) => {
    if (ignored?.[0] === exerciseIndex && ignored[1] === setIndex) return setCount;
    const canonical = toCanonicalSet(set, weightUnit);
    return setCount + (canonical?.complete ? 1 : 0);
  }, 0), 0);
}

export default function HistoricalWorkoutEditor({
  workout,
  weightUnit,
  recoveredHistoryWillBeSaved,
  onSave,
  onCancel,
}: HistoricalWorkoutEditorProps) {
  const [name, setName] = useState(workout.name);
  const [exercises, setExercises] = useState<DraftExercise[]>(() => createDraft(workout, weightUnit));
  const [errors, setErrors] = useState<Record<string, SetFieldErrors>>({});
  const [nameError, setNameError] = useState("");
  const [actionError, setActionError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [pendingSave, setPendingSave] = useState<SavedWorkout | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const validCompletedSetCount = useMemo(
    () => countValidCompletedSets(exercises, weightUnit),
    [exercises, weightUnit],
  );

  function updateSet(exerciseIndex: number, setIndex: number, field: keyof EditableSetFields, value: string | boolean) {
    setActionError("");
    setDirty(true);
    setExercises((current) => current.map((exercise, currentExerciseIndex) => currentExerciseIndex !== exerciseIndex
      ? exercise
      : {
          ...exercise,
          sets: exercise.sets.map((set, currentSetIndex) => currentSetIndex === setIndex
            ? { ...set, [field]: value, ...(field === "weight" ? { weightChanged: true } : {}) }
            : set),
        }));
    setErrors((current) => {
      const next = { ...current };
      delete next[`${exerciseIndex}-${setIndex}`];
      return next;
    });
  }

  function removeSet(exerciseIndex: number, setIndex: number) {
    const exercise = exercises[exerciseIndex];
    if (!exercise || exercise.sets.length <= 1) {
      setActionError("Every exercise occurrence must keep at least one set.");
      return;
    }
    if (countValidCompletedSets(exercises, weightUnit, [exerciseIndex, setIndex]) < 1) {
      setActionError("A workout must keep at least one valid completed set.");
      return;
    }
    setActionError("");
    setDirty(true);
    setExercises((current) => current.map((item, index) => index === exerciseIndex
      ? { ...item, sets: item.sets.filter((_, currentSetIndex) => currentSetIndex !== setIndex) }
      : item));
  }

  function buildEditedWorkout(): SavedWorkout | null {
    const nextNameError = validateWorkoutName(name);
    const nextErrors: Record<string, SetFieldErrors> = {};
    let firstInvalidField = "";
    const canonicalExercises: SavedWorkoutExercise[] = [];

    exercises.forEach((exercise, exerciseIndex) => {
      const canonicalSets: SavedWorkoutSet[] = [];
      exercise.sets.forEach((set, setIndex) => {
        const result = validateDraftSet(set, weightUnit);
        if (hasSetFieldErrors(result.errors)) {
          nextErrors[`${exerciseIndex}-${setIndex}`] = result.errors;
          if (!firstInvalidField) {
            const firstField = (["weight", "reps", "rpe"] as SetFieldName[]).find((field) => result.errors[field]);
            if (firstField) firstInvalidField = fieldId(exerciseIndex, setIndex, firstField);
          }
          return;
        }
        const canonical = toCanonicalSet(set, weightUnit);
        if (canonical) canonicalSets.push(canonical);
      });
      canonicalExercises.push({
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        muscle: exercise.muscle,
        equipment: exercise.equipment,
        sets: canonicalSets,
      });
    });

    setNameError(nextNameError);
    setErrors(nextErrors);
    if (nextNameError || Object.keys(nextErrors).length > 0) {
      setActionError("Correct the highlighted fields before saving this workout.");
      window.requestAnimationFrame(() => {
        const target = document.getElementById(nextNameError ? "history-edit-name" : firstInvalidField);
        target?.focus();
      });
      return null;
    }
    if (validCompletedSetCount < 1) {
      setActionError("A historical workout must contain at least one valid completed set.");
      return null;
    }

    return withRecalculatedWorkoutSummary({
      id: workout.id,
      name: name.trim(),
      startedAt: workout.startedAt,
      finishedAt: workout.finishedAt,
      durationSeconds: workout.durationSeconds,
      exercises: canonicalExercises,
    });
  }

  function performSave(editedWorkout: SavedWorkout) {
    setActionError("");
    const result = onSave(editedWorkout);
    if (!result.ok) setActionError(result.message);
    setPendingSave(null);
  }

  function submit() {
    setActionError("");
    const editedWorkout = buildEditedWorkout();
    if (!editedWorkout) return;
    if (recoveredHistoryWillBeSaved) setPendingSave(editedWorkout);
    else performSave(editedWorkout);
  }

  function requestCancel() {
    setActionError("");
    if (dirty) setConfirmCancel(true);
    else onCancel();
  }

  return (
    <main className="app-shell">
      <div className="phone-layout history-editor-layout">
        <header className="history-header">
          <button className="text-button history-back-button" type="button" onClick={requestCancel}>← History</button>
          <span className="progress-header-mark">LIFT OFF</span>
        </header>

        <section className="history-intro compact-intro" aria-labelledby="history-editor-title">
          <p className="eyebrow">Historical workout</p>
          <h1 id="history-editor-title" ref={headingRef} tabIndex={-1}>Edit saved workout</h1>
          <p>Change the name or existing set values. Exercise snapshots, order, timestamps and duration stay unchanged.</p>
        </section>

        <form className="history-editor" onSubmit={(event) => { event.preventDefault(); submit(); }} noValidate>
          <label className="history-editor-name" htmlFor="history-edit-name">
            Workout name
            <input
              id="history-edit-name"
              value={name}
              maxLength={101}
              aria-invalid={Boolean(nameError)}
              aria-describedby={nameError ? "history-edit-name-error" : undefined}
              onChange={(event) => { setName(event.target.value); setNameError(""); setActionError(""); setDirty(true); }}
            />
          </label>
          {nameError && <p className="field-error" id="history-edit-name-error">{nameError}</p>}

          <p className="history-editor-unit-note">Weights are being edited in {weightUnit}. Unchanged values keep their exact stored kilograms.</p>

          {exercises.map((exercise, exerciseIndex) => (
            <section className="history-editor-exercise" key={`${exercise.exerciseId}-${exerciseIndex}`} aria-labelledby={`history-edit-exercise-${exerciseIndex}`}>
              <header>
                <span className="muscle-label">{exercise.muscle || "Unspecified muscle"}</span>
                <h2 id={`history-edit-exercise-${exerciseIndex}`}>{exercise.name || "Unnamed exercise"}</h2>
                <p>{exercise.equipment || "Unspecified equipment"}</p>
              </header>
              <div className="history-editor-sets">
                {exercise.sets.map((set, setIndex) => {
                  const setErrors = errors[`${exerciseIndex}-${setIndex}`] ?? validateDraftSet(set, weightUnit).errors;
                  const cannotRemoveForExercise = exercise.sets.length <= 1;
                  const cannotRemoveForWorkout = countValidCompletedSets(exercises, weightUnit, [exerciseIndex, setIndex]) < 1;
                  const removalReason = cannotRemoveForExercise
                    ? "Cannot remove the only set in this exercise."
                    : cannotRemoveForWorkout
                      ? "Cannot remove the workout’s last valid completed set."
                      : "";
                  return (
                    <fieldset className="history-editor-set" key={setIndex}>
                      <legend>Set {setIndex + 1}</legend>
                      <div className="history-editor-set-grid">
                        {(["weight", "reps", "rpe"] as SetFieldName[]).map((field) => {
                          const id = fieldId(exerciseIndex, setIndex, field);
                          const error = setErrors[field];
                          const legacyRpe = field === "rpe" && isRpeOutsideCurrentRange(set.originalRpe) && set.rpe === toInputNumber(set.originalRpe);
                          return (
                            <label key={field} htmlFor={id}>
                              {field === "weight" ? `Weight (${weightUnit})` : field === "reps" ? "Reps" : "RPE"}
                              <input
                                id={id}
                                type="number"
                                inputMode="decimal"
                                step="any"
                                value={set[field]}
                                aria-invalid={Boolean(error)}
                                aria-describedby={error ? `${id}-error` : legacyRpe ? `${id}-legacy` : undefined}
                                onChange={(event) => updateSet(exerciseIndex, setIndex, field, event.target.value)}
                              />
                              {legacyRpe && <small id={`${id}-legacy`} className="legacy-value-label">Legacy RPE: correct or clear before saving.</small>}
                              {error && <small className="field-error" id={`${id}-error`}>{error}</small>}
                            </label>
                          );
                        })}
                        <button
                          type="button"
                          className={set.complete ? "set-complete active" : "set-complete"}
                          aria-pressed={set.complete}
                          onClick={() => updateSet(exerciseIndex, setIndex, "complete", !set.complete)}
                        >
                          {set.complete ? "Completed" : "Incomplete"}
                        </button>
                        <button
                          type="button"
                          className="history-remove-set"
                          disabled={Boolean(removalReason)}
                          aria-describedby={removalReason ? `history-remove-reason-${exerciseIndex}-${setIndex}` : undefined}
                          onClick={() => removeSet(exerciseIndex, setIndex)}
                        >Remove set</button>
                      </div>
                      {removalReason && <p className="history-removal-reason" id={`history-remove-reason-${exerciseIndex}-${setIndex}`}>{removalReason}</p>}
                    </fieldset>
                  );
                })}
              </div>
            </section>
          ))}

          {actionError && <p className="history-notice error" role="alert">{actionError}</p>}
          <p className="history-editor-summary" aria-live="polite">{validCompletedSetCount} valid completed {validCompletedSetCount === 1 ? "set" : "sets"} in this draft.</p>
          <div className="history-editor-actions">
            <button type="button" onClick={requestCancel}>Cancel</button>
            <button type="submit" className="primary-button">Save workout</button>
          </div>
        </form>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Discard historical edits?"
        description="Your unsaved name and set changes will be discarded. The stored workout will remain unchanged."
        confirmLabel="Discard edits"
        destructive
        onCancel={() => setConfirmCancel(false)}
        onConfirm={onCancel}
      />
      <ConfirmDialog
        open={pendingSave !== null}
        title="Save recovered History?"
        description="Saving this edit will permanently write only the visible recovered workouts. Duplicate or unreadable records previously ignored during recovery will be discarded."
        confirmLabel="Save recovered History"
        destructive
        onCancel={() => setPendingSave(null)}
        onConfirm={() => { if (pendingSave) performSave(pendingSave); }}
      />
    </main>
  );
}
