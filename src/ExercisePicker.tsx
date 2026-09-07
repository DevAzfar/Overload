import { useId, useMemo, useRef } from "react";
import type { Equipment, Exercise, MuscleGroup } from "./exercises";
import { useDialogFocus } from "./useDialogFocus";

type ExercisePickerProps = {
  title: string;
  exercises: readonly Exercise[];
  search: string;
  muscleFilter: MuscleGroup | "";
  equipmentFilter: Equipment | "";
  selectedExerciseIds?: readonly string[];
  onSearchChange: (value: string) => void;
  onMuscleFilterChange: (value: MuscleGroup | "") => void;
  onEquipmentFilterChange: (value: Equipment | "") => void;
  onResetFilters: () => void;
  onSelect: (exercise: Exercise) => void;
  onClose: () => void;
};

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((first, second) =>
    first.localeCompare(second, "en-GB", { sensitivity: "base" }),
  );
}

export default function ExercisePicker({
  title,
  exercises,
  search,
  muscleFilter,
  equipmentFilter,
  selectedExerciseIds = [],
  onSearchChange,
  onMuscleFilterChange,
  onEquipmentFilterChange,
  onResetFilters,
  onSelect,
  onClose,
}: ExercisePickerProps) {
  const titleId = useId();
  const resultCountId = useId();
  const searchId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useDialogFocus(true, dialogRef, searchRef, onClose);
  const muscleOptions = useMemo(() => uniqueSorted(exercises.map((exercise) => exercise.muscle)), [exercises]);
  const equipmentOptions = useMemo(() => uniqueSorted(exercises.map((exercise) => exercise.equipment)), [exercises]);
  const filteredExercises = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("en-GB");
    return exercises.filter((exercise) => {
      const matchesSearch = !term || [exercise.name, exercise.muscle, exercise.equipment]
        .some((value) => value.toLocaleLowerCase("en-GB").includes(term));
      return matchesSearch &&
        (!muscleFilter || exercise.muscle === muscleFilter) &&
        (!equipmentFilter || exercise.equipment === equipmentFilter);
    });
  }, [equipmentFilter, exercises, muscleFilter, search]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        ref={dialogRef}
        className="exercise-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={resultCountId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-handle" />
        <header className="picker-header">
          <div><p className="eyebrow">Exercise library</p><h2 id={titleId}>{title}</h2></div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close exercise picker">×</button>
        </header>

        <div className="search-field">
          <label htmlFor={searchId}>Search exercises</label>
          <div className="search-box">
            <span aria-hidden="true">⌕</span>
            <input
              id={searchId}
              ref={searchRef}
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Exercise, muscle or equipment"
              aria-describedby={resultCountId}
            />
          </div>
        </div>

        <div className="exercise-filter-grid">
          <label>
            <span>Muscle</span>
            <select value={muscleFilter} onChange={(event) => onMuscleFilterChange(event.target.value as MuscleGroup | "")}>
              <option value="">All muscles</option>
              {muscleOptions.map((muscle) => <option value={muscle} key={muscle}>{muscle}</option>)}
            </select>
          </label>
          <label>
            <span>Equipment</span>
            <select value={equipmentFilter} onChange={(event) => onEquipmentFilterChange(event.target.value as Equipment | "")}>
              <option value="">All equipment</option>
              {equipmentOptions.map((equipment) => <option value={equipment} key={equipment}>{equipment}</option>)}
            </select>
          </label>
        </div>

        <div className="exercise-filter-summary">
          <p id={resultCountId} aria-live="polite">
            {filteredExercises.length} {filteredExercises.length === 1 ? "exercise" : "exercises"}
          </p>
          <button type="button" onClick={onResetFilters}>Reset filters</button>
        </div>

        <div className="exercise-list">
          {filteredExercises.map((exercise) => {
            const alreadySelected = selectedExerciseIds.includes(exercise.id);
            return (
              <button
                type="button"
                key={exercise.id}
                className="exercise-option"
                disabled={alreadySelected}
                aria-label={alreadySelected ? `${exercise.name} already added` : `Add ${exercise.name}`}
                onClick={() => onSelect(exercise)}
              >
                <span className="exercise-option-icon">{exercise.name.slice(0, 1)}</span>
                <span>
                  <strong>{exercise.name}</strong>
                  <small>{exercise.muscle} · {exercise.equipment} · {exercise.kind === "built-in" ? "Built-in" : "Custom"}</small>
                </span>
                <span className="option-plus">{alreadySelected ? "Added" : "＋"}</span>
              </button>
            );
          })}
          {filteredExercises.length === 0 && (
            <p className="no-results">No exercises match the current search and filters.</p>
          )}
        </div>
      </section>
    </div>
  );
}
