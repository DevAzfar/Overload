import { useEffect, useId, useMemo, useRef, useState } from "react";
import BrandLogo from "./BrandLogo";
import ConfirmDialog from "./ConfirmDialog";
import {
  EQUIPMENT_TYPES,
  MUSCLE_GROUPS,
  type CustomExercise,
  type Equipment,
  type Exercise,
  type MuscleGroup,
} from "./exercises";
import {
  createCustomExerciseId,
  getExerciseIdentityKey,
  type CustomExerciseDraft,
} from "./customExercises";
import { validateExerciseName } from "./workoutValidation";
import type { WorkoutTemplate } from "./workoutTemplates";

type ExerciseManagerProps = {
  exercises: readonly Exercise[];
  customExercises: readonly CustomExercise[];
  workoutTemplates: readonly WorkoutTemplate[];
  storageError: string;
  onCommit: (exercises: CustomExercise[]) => boolean;
  onBack: () => void;
  onDraftStateChange?: (hasDraft: boolean) => void;
};

type FieldErrors = Partial<Record<keyof CustomExerciseDraft, string>>;

const emptyDraft = (): CustomExerciseDraft => ({ name: "", muscle: "", equipment: "" });

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((first, second) =>
    first.localeCompare(second, "en-GB", { sensitivity: "base" }),
  );
}

export default function ExerciseManager({
  exercises,
  customExercises,
  workoutTemplates,
  storageError,
  onCommit,
  onBack,
  onDraftStateChange,
}: ExerciseManagerProps) {
  const [search, setSearch] = useState("");
  const [muscleFilter, setMuscleFilter] = useState<MuscleGroup | "">("");
  const [equipmentFilter, setEquipmentFilter] = useState<Equipment | "">("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CustomExerciseDraft>(emptyDraft);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [managerMessage, setManagerMessage] = useState("");
  const [managerError, setManagerError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [exerciseToDelete, setExerciseToDelete] = useState<CustomExercise | null>(null);
  const [confirmCancelDraft, setConfirmCancelDraft] = useState(false);
  const [cancelThenBack, setCancelThenBack] = useState(false);
  const searchId = useId();

  useEffect(() => { headingRef.current?.focus(); }, []);
  useEffect(() => { onDraftStateChange?.(showForm); }, [onDraftStateChange, showForm]);
  useEffect(() => () => onDraftStateChange?.(false), [onDraftStateChange]);

  useEffect(() => {
    if (showForm) {
      formRef.current?.scrollIntoView({ block: "start" });
      nameInputRef.current?.focus();
    }
  }, [editingId, showForm]);

  const muscleOptions = useMemo(() => uniqueSorted(exercises.map((exercise) => exercise.muscle)), [exercises]);
  const equipmentOptions = useMemo(() => uniqueSorted(exercises.map((exercise) => exercise.equipment)), [exercises]);
  const filteredExercises = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("en-GB");
    return exercises.filter((exercise) =>
      (!term || exercise.name.toLocaleLowerCase("en-GB").includes(term)) &&
      (!muscleFilter || exercise.muscle === muscleFilter) &&
      (!equipmentFilter || exercise.equipment === equipmentFilter),
    );
  }, [equipmentFilter, exercises, muscleFilter, search]);

  function clearOperationMessages() {
    setManagerMessage("");
    setManagerError("");
  }

  function openCreateForm() {
    setEditingId(null);
    setDraft(emptyDraft());
    setFieldErrors({});
    setFormError("");
    clearOperationMessages();
    setShowForm(true);
  }

  function openEditForm(exercise: CustomExercise) {
    setEditingId(exercise.id);
    setDraft({ name: exercise.name, muscle: exercise.muscle, equipment: exercise.equipment });
    setFieldErrors({});
    setFormError("");
    clearOperationMessages();
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setDraft(emptyDraft());
    setFieldErrors({});
    setFormError("");
  }

  function requestCloseForm() {
    setCancelThenBack(false);
    setConfirmCancelDraft(true);
  }

  function requestBack() {
    if (!showForm) {
      onBack();
      return;
    }
    setCancelThenBack(true);
    setConfirmCancelDraft(true);
  }

  function updateDraft<Field extends keyof CustomExerciseDraft>(field: Field, value: CustomExerciseDraft[Field]) {
    setDraft((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setFormError("");
  }

  function submitExercise() {
    const nextFieldErrors: FieldErrors = {};
    const name = draft.name.trim();
    const nameError = validateExerciseName(draft.name);
    if (nameError) nextFieldErrors.name = nameError;
    if (!draft.muscle) nextFieldErrors.muscle = "Choose a muscle group.";
    if (!draft.equipment) nextFieldErrors.equipment = "Choose equipment.";

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setFormError("Complete every required field before saving.");
      return;
    }

    const comparableExercise = {
      name,
      muscle: draft.muscle as MuscleGroup,
      equipment: draft.equipment as Equipment,
    };
    const duplicate = exercises.find((exercise) =>
      exercise.id !== editingId && getExerciseIdentityKey(exercise) === getExerciseIdentityKey(comparableExercise),
    );
    if (duplicate) {
      setFieldErrors({ name: "An exercise with the same name, muscle and equipment already exists." });
      setFormError(`This matches ${duplicate.name} (${duplicate.muscle} · ${duplicate.equipment}).`);
      return;
    }

    let id = editingId;
    if (id === null) {
      id = createCustomExerciseId();
      while (exercises.some((exercise) => exercise.id === id)) id = createCustomExerciseId();
    }

    const savedExercise: CustomExercise = {
      id,
      name,
      muscle: comparableExercise.muscle,
      equipment: comparableExercise.equipment,
      kind: "custom",
    };
    const nextExercises = editingId === null
      ? [...customExercises, savedExercise]
      : customExercises.map((exercise) => exercise.id === editingId ? savedExercise : exercise);

    if (!onCommit(nextExercises)) {
      setFormError("Overload could not save this exercise on your device. Your complete draft and saved exercises are unchanged.");
      return;
    }

    const successMessage = editingId === null
      ? `${savedExercise.name} was created.`
      : `${savedExercise.name} was updated without changing its exercise ID.`;
    closeForm();
    setManagerError("");
    setManagerMessage(successMessage);
  }

  function deleteExercise(exercise: CustomExercise) {
    clearOperationMessages();
    const dependentTemplates = workoutTemplates.filter((template) => template.exerciseIds.includes(exercise.id));
    if (dependentTemplates.length > 0) {
      const templateNames = dependentTemplates.map((template) => template.name).join(", ");
      setManagerError(
        `${exercise.name} cannot be deleted because it is used by ${dependentTemplates.length === 1 ? "the template" : "these templates"}: ${templateNames}. Remove it from every listed template first.`,
      );
      return;
    }

    const nextExercises = customExercises.filter((candidate) => candidate.id !== exercise.id);
    if (!onCommit(nextExercises)) {
      setManagerError(`Overload could not delete ${exercise.name}. The saved exercise is unchanged.`);
      setExerciseToDelete(null);
      return;
    }

    if (editingId === exercise.id) closeForm();
    setManagerMessage(`${exercise.name} was deleted. Historical workout data was preserved.`);
    setExerciseToDelete(null);
  }

  function resetFilters() {
    setSearch("");
    setMuscleFilter("");
    setEquipmentFilter("");
  }

  return (
    <main className="app-shell">
      <div className="phone-layout exercise-manager-layout">
        <header className="history-header">
          <button type="button" className="text-button history-back-button" onClick={requestBack}>
            <span aria-hidden="true">←</span> Templates
          </button>
          <span className="progress-header-mark"><BrandLogo size="compact" /><span>OVERLOAD</span></span>
        </header>

        <section className="template-intro" aria-labelledby="manage-exercises-title">
          <p className="eyebrow">Exercise library</p>
          <h1 id="manage-exercises-title" ref={headingRef} tabIndex={-1}>Manage exercises.</h1>
          <p>Browse built-in movements or create exercises that match your training.</p>
          <button type="button" className="primary-button manage-create-button" onClick={openCreateForm}>
            Create custom exercise
          </button>
        </section>

        {storageError && <p className="exercise-manager-alert" role="alert">{storageError}</p>}
        {managerError && <p className="exercise-manager-alert" role="alert">{managerError}</p>}
        {managerMessage && <p className="exercise-manager-success" role="status">{managerMessage}</p>}

        {showForm && (
          <form ref={formRef} className="exercise-form" onSubmit={(event) => { event.preventDefault(); submitExercise(); }} noValidate>
            <div className="exercise-form-heading">
              <div>
                <p className="eyebrow">{editingId === null ? "New exercise" : "Edit custom exercise"}</p>
                <h2>{editingId === null ? "Add an exercise" : "Update exercise details"}</h2>
              </div>
              <button type="button" onClick={requestCloseForm}>Cancel</button>
            </div>

            <label>
              <span>Exercise name</span>
              <input
                ref={nameInputRef}
                value={draft.name}
                onChange={(event) => updateDraft("name", event.target.value)}
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? "exercise-name-error" : undefined}
              />
              {fieldErrors.name && <small id="exercise-name-error" className="field-error">{fieldErrors.name}</small>}
            </label>

            <label>
              <span>Muscle group</span>
              <select
                value={draft.muscle}
                onChange={(event) => updateDraft("muscle", event.target.value as MuscleGroup | "")}
                aria-invalid={Boolean(fieldErrors.muscle)}
                aria-describedby={fieldErrors.muscle ? "exercise-muscle-error" : undefined}
              >
                <option value="">Choose a muscle group</option>
                {MUSCLE_GROUPS.map((muscle) => <option value={muscle} key={muscle}>{muscle}</option>)}
              </select>
              {fieldErrors.muscle && <small id="exercise-muscle-error" className="field-error">{fieldErrors.muscle}</small>}
            </label>

            <label>
              <span>Equipment</span>
              <select
                value={draft.equipment}
                onChange={(event) => updateDraft("equipment", event.target.value as Equipment | "")}
                aria-invalid={Boolean(fieldErrors.equipment)}
                aria-describedby={fieldErrors.equipment ? "exercise-equipment-error" : undefined}
              >
                <option value="">Choose equipment</option>
                {EQUIPMENT_TYPES.map((equipment) => <option value={equipment} key={equipment}>{equipment}</option>)}
              </select>
              {fieldErrors.equipment && <small id="exercise-equipment-error" className="field-error">{fieldErrors.equipment}</small>}
            </label>

            {formError && <p className="template-error" role="alert">{formError}</p>}
            <button type="submit" className="primary-button">
              {editingId === null ? "Create exercise" : "Save changes"}
            </button>
          </form>
        )}

        <section className="exercise-management-list" aria-labelledby="exercise-results-title">
          <div className="template-section-heading">
            <div><p className="eyebrow">Built-in and custom</p><h2 id="exercise-results-title">All exercises</h2></div>
            <span id="exercise-manager-result-count" aria-live="polite">{filteredExercises.length} matches</span>
          </div>

          <div className="management-filters">
            <div className="search-field">
              <label htmlFor={searchId}>Search exercises</label>
              <div className="search-box">
                <span aria-hidden="true">⌕</span>
                <input
                  id={searchId}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Exercise name"
                  aria-describedby="exercise-manager-result-count"
                />
              </div>
            </div>
            <div className="exercise-filter-grid">
              <label>
                <span>Muscle</span>
                <select value={muscleFilter} onChange={(event) => setMuscleFilter(event.target.value as MuscleGroup | "")}>
                  <option value="">All muscles</option>
                  {muscleOptions.map((muscle) => <option value={muscle} key={muscle}>{muscle}</option>)}
                </select>
              </label>
              <label>
                <span>Equipment</span>
                <select value={equipmentFilter} onChange={(event) => setEquipmentFilter(event.target.value as Equipment | "")}>
                  <option value="">All equipment</option>
                  {equipmentOptions.map((equipment) => <option value={equipment} key={equipment}>{equipment}</option>)}
                </select>
              </label>
            </div>
            <button type="button" className="reset-filter-button" onClick={resetFilters}>Reset filters</button>
          </div>

          {filteredExercises.length === 0 ? (
            <div className="template-exercises-empty">No exercises match the current search and filters.</div>
          ) : (
            <ul className="managed-exercise-list">
              {filteredExercises.map((exercise) => (
                <li key={exercise.id}>
                  <div className="managed-exercise-copy">
                    <span className="exercise-kind-label">{exercise.kind === "built-in" ? "Built-in" : "Custom"}</span>
                    <strong>{exercise.name}</strong>
                    <small>{exercise.muscle} · {exercise.equipment}</small>
                  </div>
                  {exercise.kind === "custom" && (
                    <div className="managed-exercise-actions">
                      <button type="button" onClick={() => openEditForm(exercise)} aria-label={`Edit ${exercise.name}`}>Edit</button>
                      <button type="button" className="danger-text-button" onClick={() => { clearOperationMessages(); setExerciseToDelete(exercise); }} aria-label={`Delete ${exercise.name}`}>Delete</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <ConfirmDialog
        open={exerciseToDelete !== null}
        title="Delete custom exercise?"
        description={exerciseToDelete ? `Delete ${exerciseToDelete.name}? Saved workouts and previous-set History will remain on this device.` : ""}
        confirmLabel="Delete exercise"
        destructive
        onCancel={() => setExerciseToDelete(null)}
        onConfirm={() => { if (exerciseToDelete) deleteExercise(exerciseToDelete); }}
      />
      <ConfirmDialog
        open={confirmCancelDraft}
        title="Discard exercise draft?"
        description="Your unsaved custom-exercise input will be discarded. Saved exercises will remain unchanged."
        confirmLabel="Discard draft"
        destructive
        onCancel={() => { setConfirmCancelDraft(false); setCancelThenBack(false); }}
        onConfirm={() => {
          setConfirmCancelDraft(false);
          closeForm();
          if (cancelThenBack) onBack();
          setCancelThenBack(false);
        }}
      />
    </main>
  );
}
