import { useEffect, useMemo, useState } from "react";
import { EXERCISES, getExerciseById, type Exercise } from "./exercises";
import {
  createWorkoutId,
  loadPreviousSets,
  loadWorkoutHistory,
  savePreviousSets,
  saveWorkoutHistory,
  type PreviousSet,
  type PreviousSetsByExercise,
  type SavedWorkout,
  type SavedWorkoutExercise,
  type SavedWorkoutSet,
} from "./workoutHistory";
import {
  createTemplateId,
  getDefaultTemplate,
  loadWorkoutTemplates,
  saveWorkoutTemplates,
  type WorkoutTemplate,
} from "./workoutTemplates";

type Screen = "welcome" | "home" | "templates" | "template-editor" | "workout" | "history";
type SetEntry = { weight: string; reps: string; rpe: string; complete: boolean };
type LoggedExercise = Exercise & { sessionId: string; sets: SetEntry[] };
type LocalWeekRange = { start: Date; endExclusive: Date; endDisplay: Date };
type DashboardSummary = {
  weekRange: LocalWeekRange;
  workoutsThisWeek: number;
  completedVolumeThisWeek: number;
  completedSetsThisWeek: number;
  latestWorkout: SavedWorkout | null;
};

const blankSet = (): SetEntry => ({ weight: "", reps: "", rpe: "", complete: false });

function formatTime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function parseOptionalNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasValidOptionalRpe(value: string) {
  return value.trim() === "" || parseOptionalNumber(value) !== null;
}

function isValidCompletedSet(set: SetEntry) {
  const weight = parseOptionalNumber(set.weight);
  const reps = parseOptionalNumber(set.reps);

  return (
    set.complete &&
    weight !== null &&
    weight >= 0 &&
    reps !== null &&
    reps > 0 &&
    Number.isFinite(weight * reps) &&
    hasValidOptionalRpe(set.rpe)
  );
}

function toSavedSet(set: SetEntry): SavedWorkoutSet {
  return {
    weight: parseOptionalNumber(set.weight),
    reps: parseOptionalNumber(set.reps),
    rpe: parseOptionalNumber(set.rpe),
    complete: set.complete,
  };
}

function completedSetVolume(set: SetEntry) {
  if (!isValidCompletedSet(set)) return 0;
  return Number(set.weight) * Number(set.reps);
}

function formatHistoryDate(dateString: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

function formatSavedNumber(value: number | null) {
  return value === null ? "—" : value.toLocaleString();
}

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLocalWeekRange(referenceDate: Date): LocalWeekRange {
  const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);

  const endExclusive = new Date(start);
  endExclusive.setDate(endExclusive.getDate() + 7);

  const endDisplay = new Date(start);
  endDisplay.setDate(endDisplay.getDate() + 6);

  return { start, endExclusive, endDisplay };
}

function formatWeekRange({ start, endDisplay }: LocalWeekRange) {
  const startDay = start.getDate();
  const endDay = endDisplay.getDate();
  const startMonth = new Intl.DateTimeFormat("en-GB", { month: "short" }).format(start);
  const endMonth = new Intl.DateTimeFormat("en-GB", { month: "short" }).format(endDisplay);

  if (start.getFullYear() !== endDisplay.getFullYear()) {
    return `${startDay} ${startMonth} ${start.getFullYear()}–${endDay} ${endMonth} ${endDisplay.getFullYear()}`;
  }

  if (start.getMonth() !== endDisplay.getMonth()) {
    return `${startDay} ${startMonth}–${endDay} ${endMonth}`;
  }

  return `${startDay}–${endDay} ${endMonth}`;
}

function formatCompactVolume(volume: number) {
  const formatScaled = (value: number) =>
    new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(value);

  if (volume >= 1_000_000) return `${formatScaled(volume / 1_000_000)}M kg`;
  if (volume >= 1_000) return `${formatScaled(volume / 1_000)}k kg`;
  return `${formatScaled(volume)} kg`;
}

function formatFullVolume(volume: number) {
  return `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(volume)} kg`;
}

function formatCompactDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${safeSeconds}s`;
}

function formatRelativeWorkoutDate(dateString: string, referenceDate: Date) {
  const workoutDate = new Date(dateString);
  if (getLocalDateKey(workoutDate) === getLocalDateKey(referenceDate)) return "Today";

  const yesterday = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  yesterday.setDate(yesterday.getDate() - 1);
  if (getLocalDateKey(workoutDate) === getLocalDateKey(yesterday)) return "Yesterday";

  const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  if (workoutDate.getFullYear() !== referenceDate.getFullYear()) options.year = "numeric";
  return new Intl.DateTimeFormat("en-GB", options).format(workoutDate);
}

function pluralise(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function calculateDashboardSummary(history: SavedWorkout[], referenceDate: Date): DashboardSummary {
  const weekRange = getLocalWeekRange(referenceDate);
  const weeklyWorkouts = history.filter((workout) => {
    const startedAt = new Date(workout.startedAt).getTime();
    return startedAt >= weekRange.start.getTime() && startedAt < weekRange.endExclusive.getTime();
  });
  const latestWorkout = history.reduce<SavedWorkout | null>((latest, workout) => {
    if (latest === null || Date.parse(workout.startedAt) > Date.parse(latest.startedAt)) return workout;
    return latest;
  }, null);

  return {
    weekRange,
    workoutsThisWeek: weeklyWorkouts.length,
    completedVolumeThisWeek: weeklyWorkouts.reduce((total, workout) => total + workout.totalVolume, 0),
    completedSetsThisWeek: weeklyWorkouts.reduce((total, workout) => total + workout.completedSetCount, 0),
    latestWorkout,
  };
}

function RocketMark() {
  return (
    <span className="rocket-mark" aria-hidden="true">
      <span className="rocket-window" />
      <span className="rocket-flame" />
    </span>
  );
}

function createExerciseSessionId(exerciseId: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${exerciseId}-${crypto.randomUUID()}`;
  }

  return `${exerciseId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type ExercisePickerProps = {
  title: string;
  search: string;
  selectedExerciseIds?: string[];
  onSearchChange: (value: string) => void;
  onSelect: (exercise: Exercise) => void;
  onClose: () => void;
};

function ExercisePicker({
  title,
  search,
  selectedExerciseIds = [],
  onSearchChange,
  onSelect,
  onClose,
}: ExercisePickerProps) {
  const filteredExercises = useMemo(() => {
    const term = search.trim().toLowerCase();
    return EXERCISES.filter((exercise) =>
      !term || [exercise.name, exercise.muscle, exercise.equipment].some((value) => value.toLowerCase().includes(term)),
    );
  }, [search]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="exercise-picker" role="dialog" aria-modal="true" aria-labelledby="picker-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-handle" />
        <header className="picker-header">
          <div><p className="eyebrow">Exercise library</p><h2 id="picker-title">{title}</h2></div>
          <button className="modal-close" onClick={onClose} aria-label="Close exercise picker">×</button>
        </header>
        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <input autoFocus value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search exercise, muscle or equipment" />
        </label>
        <div className="exercise-list">
          {filteredExercises.map((exercise) => {
            const alreadySelected = selectedExerciseIds.includes(exercise.id);
            return (
              <button
                key={exercise.id}
                className="exercise-option"
                disabled={alreadySelected}
                aria-label={alreadySelected ? `${exercise.name} already added` : `Add ${exercise.name}`}
                onClick={() => onSelect(exercise)}
              >
                <span className="exercise-option-icon">{exercise.name.slice(0, 1)}</span>
                <span><strong>{exercise.name}</strong><small>{exercise.muscle} · {exercise.equipment}</small></span>
                <span className="option-plus">{alreadySelected ? "Added" : "＋"}</span>
              </button>
            );
          })}
          {filteredExercises.length === 0 && <p className="no-results">No matching exercise yet.</p>}
        </div>
      </section>
    </div>
  );
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [seconds, setSeconds] = useState(0);
  const [showWorkoutPicker, setShowWorkoutPicker] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [workoutExerciseSearch, setWorkoutExerciseSearch] = useState("");
  const [templateExerciseSearch, setTemplateExerciseSearch] = useState("");
  const [loggedExercises, setLoggedExercises] = useState<LoggedExercise[]>([]);
  const [workoutName, setWorkoutName] = useState("");
  const [savedPrevious, setSavedPrevious] = useState<PreviousSetsByExercise>({});
  const [workoutStartedAt, setWorkoutStartedAt] = useState<number | null>(null);
  const [workoutHistory, setWorkoutHistory] = useState<SavedWorkout[]>([]);
  const [workoutTemplates, setWorkoutTemplates] = useState<WorkoutTemplate[]>([]);
  const [templateDraft, setTemplateDraft] = useState<WorkoutTemplate | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState("");
  const [emptyWorkoutName, setEmptyWorkoutName] = useState("");
  const [templateSelectionError, setTemplateSelectionError] = useState("");
  const [expandedWorkoutIds, setExpandedWorkoutIds] = useState<string[]>([]);
  const [workoutError, setWorkoutError] = useState("");
  const [completedMessage, setCompletedMessage] = useState("");

  useEffect(() => {
    if (screen !== "workout" || workoutStartedAt === null) return;

    const updateElapsedTime = () => {
      setSeconds(Math.max(0, Math.floor((Date.now() - workoutStartedAt) / 1000)));
    };

    updateElapsedTime();
    const interval = window.setInterval(updateElapsedTime, 1000);
    return () => window.clearInterval(interval);
  }, [screen, workoutStartedAt]);

  useEffect(() => {
    setSavedPrevious(loadPreviousSets());
    setWorkoutHistory(loadWorkoutHistory());
    setWorkoutTemplates(loadWorkoutTemplates());
  }, []);

  const currentLocalDateKey = getLocalDateKey(new Date());
  const today = useMemo(
    () => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date()),
    [currentLocalDateKey],
  );
  const dashboardSummary = useMemo(
    () => calculateDashboardSummary(workoutHistory, new Date()),
    [workoutHistory, currentLocalDateKey],
  );
  const latestWorkoutDateLabel = useMemo(
    () => dashboardSummary.latestWorkout
      ? formatRelativeWorkoutDate(dashboardSummary.latestWorkout.startedAt, new Date())
      : "",
    [dashboardSummary.latestWorkout, currentLocalDateKey],
  );

  const totalVolume = loggedExercises.reduce(
    (total, exercise) =>
      total + exercise.sets.reduce((setTotal, set) => setTotal + completedSetVolume(set), 0),
    0,
  );

  function createLoggedExercise(exercise: Exercise): LoggedExercise {
    const previous = savedPrevious[exercise.id] ?? exercise.previous;
    return { ...exercise, previous, sessionId: createExerciseSessionId(exercise.id), sets: [blankSet()] };
  }

  function openTemplateSelection() {
    setTemplateSelectionError("");
    setEmptyWorkoutName("");
    setScreen("templates");
  }

  function beginWorkout(name: string, exerciseIds: string[]) {
    const trimmedName = name.trim();
    const exercises = exerciseIds
      .map(getExerciseById)
      .filter((exercise): exercise is Exercise => exercise !== undefined)
      .map(createLoggedExercise);

    setWorkoutName(trimmedName);
    setWorkoutStartedAt(Date.now());
    setSeconds(0);
    setLoggedExercises(exercises);
    setWorkoutError("");
    setCompletedMessage("");
    setScreen("workout");
  }

  function startEmptyWorkout() {
    const trimmedName = emptyWorkoutName.trim();
    if (!trimmedName) {
      setTemplateSelectionError("Enter a workout name before starting an empty workout.");
      return;
    }

    setTemplateSelectionError("");
    beginWorkout(trimmedName, []);
  }

  function addExerciseToWorkout(exercise: Exercise) {
    setLoggedExercises((current) => [...current, createLoggedExercise(exercise)]);
    setShowWorkoutPicker(false);
    setWorkoutExerciseSearch("");
  }

  function openCreateTemplate() {
    let templateId = createTemplateId();
    while (workoutTemplates.some((template) => template.id === templateId)) {
      templateId = createTemplateId();
    }

    setEditingTemplateId(null);
    setTemplateDraft({ id: templateId, name: "", exerciseIds: [], kind: "custom" });
    setTemplateError("");
    setTemplateExerciseSearch("");
    setShowTemplatePicker(false);
    setScreen("template-editor");
  }

  function openEditTemplate(template: WorkoutTemplate) {
    setEditingTemplateId(template.id);
    setTemplateDraft({ ...template, exerciseIds: [...template.exerciseIds] });
    setTemplateError("");
    setTemplateExerciseSearch("");
    setShowTemplatePicker(false);
    setScreen("template-editor");
  }

  function updateTemplateName(name: string) {
    setTemplateDraft((current) => current ? { ...current, name } : current);
    setTemplateError("");
  }

  function addExerciseToTemplateDraft(exercise: Exercise) {
    if (!templateDraft) return;
    if (templateDraft.exerciseIds.includes(exercise.id)) {
      setTemplateError(`${exercise.name} is already in this template.`);
      return;
    }

    setTemplateDraft({ ...templateDraft, exerciseIds: [...templateDraft.exerciseIds, exercise.id] });
    setTemplateError("");
    setShowTemplatePicker(false);
    setTemplateExerciseSearch("");
  }

  function removeExerciseFromTemplate(exerciseId: string) {
    setTemplateDraft((current) => current
      ? { ...current, exerciseIds: current.exerciseIds.filter((id) => id !== exerciseId) }
      : current);
    setTemplateError("");
  }

  function moveTemplateExercise(index: number, direction: -1 | 1) {
    setTemplateDraft((current) => {
      if (!current) return current;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.exerciseIds.length) return current;

      const exerciseIds = [...current.exerciseIds];
      [exerciseIds[index], exerciseIds[nextIndex]] = [exerciseIds[nextIndex], exerciseIds[index]];
      return { ...current, exerciseIds };
    });
    setTemplateError("");
  }

  function saveTemplateDraft() {
    if (!templateDraft) return;
    const trimmedName = templateDraft.name.trim();

    if (!trimmedName) {
      setTemplateError("Enter a template name before saving.");
      return;
    }
    if (templateDraft.exerciseIds.length === 0) {
      setTemplateError("Add at least one exercise before saving this template.");
      return;
    }
    if (new Set(templateDraft.exerciseIds).size !== templateDraft.exerciseIds.length) {
      setTemplateError("A template cannot contain the same exercise more than once.");
      return;
    }

    const savedTemplate = { ...templateDraft, name: trimmedName, exerciseIds: [...templateDraft.exerciseIds] };
    const nextTemplates = editingTemplateId === null
      ? [...workoutTemplates, savedTemplate]
      : workoutTemplates.map((template) => template.id === editingTemplateId ? savedTemplate : template);

    if (!saveWorkoutTemplates(nextTemplates)) {
      setTemplateError("Lift Off could not save this template on your device. Your unsaved edits are still here.");
      return;
    }

    setWorkoutTemplates(nextTemplates);
    setTemplateDraft(null);
    setEditingTemplateId(null);
    setTemplateError("");
    setScreen("templates");
  }

  function resetBuiltInTemplate() {
    if (!templateDraft || templateDraft.kind !== "built-in") return;
    const defaultTemplate = getDefaultTemplate(templateDraft.id);
    if (!defaultTemplate) return;
    if (!window.confirm(`Reset ${templateDraft.name} to its original exercises and name?`)) return;

    const nextTemplates = workoutTemplates.map((template) =>
      template.id === defaultTemplate.id ? defaultTemplate : template,
    );
    if (!saveWorkoutTemplates(nextTemplates)) {
      setTemplateError("Lift Off could not reset this template. Your current edits are still here.");
      return;
    }

    setWorkoutTemplates(nextTemplates);
    setTemplateDraft({ ...defaultTemplate, exerciseIds: [...defaultTemplate.exerciseIds] });
    setTemplateError("");
  }

  function deleteCustomTemplate() {
    if (!templateDraft || templateDraft.kind !== "custom" || editingTemplateId === null) return;
    if (!window.confirm(`Delete the ${templateDraft.name || "custom"} template? This cannot be undone.`)) return;

    const nextTemplates = workoutTemplates.filter((template) => template.id !== editingTemplateId);
    if (!saveWorkoutTemplates(nextTemplates)) {
      setTemplateError("Lift Off could not delete this template. The template and your edits are unchanged.");
      return;
    }

    setWorkoutTemplates(nextTemplates);
    setTemplateDraft(null);
    setEditingTemplateId(null);
    setTemplateError("");
    setScreen("templates");
  }

  function updateSet(sessionId: string, setIndex: number, field: keyof SetEntry, value: string | boolean) {
    setWorkoutError("");
    setLoggedExercises((current) =>
      current.map((exercise) =>
        exercise.sessionId !== sessionId
          ? exercise
          : {
              ...exercise,
              sets: exercise.sets.map((set, index) => index === setIndex ? { ...set, [field]: value } : set),
            },
      ),
    );
  }

  function hasMeaningfulWorkoutData() {
    return (
      loggedExercises.length > 0 ||
      loggedExercises.some((exercise) =>
        exercise.sets.some((set) => set.weight.trim() || set.reps.trim() || set.rpe.trim() || set.complete),
      )
    );
  }

  function cancelWorkout() {
    if (hasMeaningfulWorkoutData()) {
      const shouldDiscard = window.confirm("Discard this workout? Your entered exercises and sets will not be saved.");
      if (!shouldDiscard) return;
    }

    setLoggedExercises([]);
    setWorkoutName("");
    setWorkoutStartedAt(null);
    setSeconds(0);
    setShowWorkoutPicker(false);
    setWorkoutExerciseSearch("");
    setWorkoutError("");
    setScreen("home");
  }

  function finishWorkout() {
    const completedSets = loggedExercises.flatMap((exercise) => exercise.sets.filter(isValidCompletedSet));

    if (completedSets.length === 0) {
      setWorkoutError("Complete at least one set with a valid weight and more than zero repetitions before finishing.");
      return;
    }

    const hasInvalidCompletedSet = loggedExercises.some((exercise) =>
      exercise.sets.some((set) => set.complete && !isValidCompletedSet(set)),
    );

    if (hasInvalidCompletedSet) {
      setWorkoutError("One or more completed sets has invalid input. Use a non-negative weight, repetitions above zero and an optional numeric RPE.");
      return;
    }

    if (workoutStartedAt === null) {
      setWorkoutError("The workout start time is missing. Cancel this workout and start a new one.");
      return;
    }

    const finishedAt = Date.now();
    const savedExercises: SavedWorkoutExercise[] = loggedExercises.map((exercise) => ({
      exerciseId: exercise.id,
      name: exercise.name,
      muscle: exercise.muscle,
      equipment: exercise.equipment,
      sets: exercise.sets.map(toSavedSet),
    }));
    const savedWorkout: SavedWorkout = {
      id: createWorkoutId(),
      name: workoutName,
      startedAt: new Date(workoutStartedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      durationSeconds: Math.max(0, Math.floor((finishedAt - workoutStartedAt) / 1000)),
      exercises: savedExercises,
      totalVolume,
      exerciseCount: savedExercises.length,
      completedSetCount: completedSets.length,
    };
    const nextHistory = [savedWorkout, ...workoutHistory].sort(
      (first, second) => Date.parse(second.startedAt) - Date.parse(first.startedAt),
    );

    if (!saveWorkoutHistory(nextHistory)) {
      setWorkoutError("Lift Off could not save this workout on your device. Your workout is still open, so please try again.");
      return;
    }

    const newPrevious: PreviousSetsByExercise = { ...savedPrevious };
    loggedExercises.forEach((exercise) => {
      const completed: PreviousSet[] = exercise.sets.filter(isValidCompletedSet).map((set) => ({
        weight: Number(set.weight),
        reps: Number(set.reps),
      }));
      if (completed.length > 0) newPrevious[exercise.id] = completed;
    });

    setWorkoutHistory(nextHistory);
    setSavedPrevious(newPrevious);
    savePreviousSets(newPrevious);
    setCompletedMessage(`Workout saved · ${savedExercises.length} exercises · ${Math.round(totalVolume).toLocaleString()} kg`);
    setLoggedExercises([]);
    setWorkoutName("");
    setWorkoutStartedAt(null);
    setSeconds(0);
    setWorkoutError("");
    setScreen("home");
  }

  function toggleWorkoutExpanded(workoutId: string) {
    setExpandedWorkoutIds((current) =>
      current.includes(workoutId) ? current.filter((id) => id !== workoutId) : [...current, workoutId],
    );
  }

  if (screen === "welcome") {
    return (
      <main className="welcome-shell">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />
        <section className="welcome-card" aria-labelledby="welcome-title">
          <div className="brand-lockup"><RocketMark /><span>LIFT OFF</span></div>
          <div className="welcome-copy">
            <p className="eyebrow">Training, understood.</p>
            <h1 id="welcome-title">Your next set starts here.</h1>
            <p>Log every lift, understand your progress and turn training data into smarter sessions.</p>
          </div>
          <button className="primary-button enter-button" onClick={() => setScreen("home")}>
            Enter Lift Off <span aria-hidden="true">→</span>
          </button>
          <p className="prototype-note">Early access · Your data stays on this device</p>
        </section>
      </main>
    );
  }

  if (screen === "templates") {
    return (
      <main className="app-shell">
        <div className="phone-layout template-layout">
          <header className="history-header">
            <button className="text-button history-back-button" onClick={() => setScreen("home")}>
              <span aria-hidden="true">←</span> Home
            </button>
            <div className="brand-lockup compact"><RocketMark /><span>LIFT OFF</span></div>
          </header>

          <section className="template-intro" aria-labelledby="template-selection-title">
            <p className="eyebrow">Start workout</p>
            <h1 id="template-selection-title">Choose your session.</h1>
            <p>The timer starts only after you choose a template or name an empty workout.</p>
          </section>

          <section className="template-section" aria-labelledby="saved-templates-title">
            <div className="template-section-heading">
              <div><p className="eyebrow">Reusable workouts</p><h2 id="saved-templates-title">Templates</h2></div>
              <button className="compact-action-button" onClick={openCreateTemplate}>Create template</button>
            </div>

            <div className="template-grid">
              {workoutTemplates.map((template) => (
                <article className="template-card" key={template.id}>
                  <header>
                    <span className="template-kind">{template.kind === "built-in" ? "Built-in" : "Custom"}</span>
                    <h3>{template.name}</h3>
                    <p>{template.exerciseIds.length} {pluralise(template.exerciseIds.length, "exercise")}</p>
                  </header>
                  <ol className="template-preview-list">
                    {template.exerciseIds.map((exerciseId) => (
                      <li key={exerciseId}>{getExerciseById(exerciseId)?.name ?? exerciseId}</li>
                    ))}
                  </ol>
                  <div className="template-card-actions">
                    <button className="primary-button template-start-button" onClick={() => beginWorkout(template.name, template.exerciseIds)}>
                      Start {template.name}
                    </button>
                    <button className="template-edit-button" onClick={() => openEditTemplate(template)}>Edit template</button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="empty-template-card" aria-labelledby="empty-workout-title">
            <div>
              <p className="eyebrow">Start from scratch</p>
              <h2 id="empty-workout-title">Empty workout</h2>
              <p>This starts a one-off session and does not create a reusable template.</p>
            </div>
            <label className="template-name-field">
              <span>Workout name</span>
              <input
                value={emptyWorkoutName}
                onChange={(event) => {
                  setEmptyWorkoutName(event.target.value);
                  setTemplateSelectionError("");
                }}
                placeholder="e.g. Full body"
              />
            </label>
            {templateSelectionError && <p className="template-error" role="alert">{templateSelectionError}</p>}
            <button className="primary-button empty-workout-start" onClick={startEmptyWorkout}>Start empty workout</button>
          </section>
        </div>
      </main>
    );
  }

  if (screen === "template-editor" && templateDraft) {
    const isExistingCustomTemplate = templateDraft.kind === "custom" && editingTemplateId !== null;

    return (
      <main className="app-shell">
        <div className="phone-layout template-layout">
          <header className="history-header">
            <button
              className="text-button history-back-button"
              onClick={() => {
                setTemplateDraft(null);
                setEditingTemplateId(null);
                setTemplateError("");
                setShowTemplatePicker(false);
                setScreen("templates");
              }}
            >
              <span aria-hidden="true">←</span> Templates
            </button>
            <div className="brand-lockup compact"><RocketMark /><span>LIFT OFF</span></div>
          </header>

          <section className="template-intro compact-intro">
            <p className="eyebrow">{editingTemplateId === null ? "New template" : "Edit template"}</p>
            <h1>{editingTemplateId === null ? "Build a template." : `Edit ${templateDraft.name || "template"}.`}</h1>
            <p>Names and exercise order are copied into new workouts. Active workouts remain independent.</p>
          </section>

          <form className="template-editor" onSubmit={(event) => { event.preventDefault(); saveTemplateDraft(); }}>
            <label className="template-name-field">
              <span>Template name</span>
              <input value={templateDraft.name} onChange={(event) => updateTemplateName(event.target.value)} placeholder="e.g. Push day" />
            </label>

            <section className="template-exercises-editor" aria-labelledby="template-exercises-title">
              <div className="template-section-heading">
                <div><p className="eyebrow">Ordered list</p><h2 id="template-exercises-title">Exercises</h2></div>
                <span>{templateDraft.exerciseIds.length}</span>
              </div>

              {templateDraft.exerciseIds.length === 0 ? (
                <div className="template-exercises-empty">No exercises added yet.</div>
              ) : (
                <ol className="template-exercise-list">
                  {templateDraft.exerciseIds.map((exerciseId, index) => {
                    const exercise = getExerciseById(exerciseId);
                    if (!exercise) return null;

                    return (
                      <li key={exerciseId}>
                        <span className="template-order-number">{index + 1}</span>
                        <span className="template-exercise-name"><strong>{exercise.name}</strong><small>{exercise.muscle} · {exercise.equipment}</small></span>
                        <span className="template-order-actions">
                          <button type="button" disabled={index === 0} onClick={() => moveTemplateExercise(index, -1)} aria-label={`Move ${exercise.name} up`}>Move up</button>
                          <button type="button" disabled={index === templateDraft.exerciseIds.length - 1} onClick={() => moveTemplateExercise(index, 1)} aria-label={`Move ${exercise.name} down`}>Move down</button>
                          <button type="button" className="remove-template-exercise" onClick={() => removeExerciseFromTemplate(exercise.id)} aria-label={`Remove ${exercise.name}`}>Remove</button>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}

              <button
                className="secondary-add-button template-add-exercise"
                type="button"
                onClick={() => {
                  setTemplateError("");
                  setTemplateExerciseSearch("");
                  setShowTemplatePicker(true);
                }}
              >＋ Add exercise</button>
            </section>

            {templateError && <p className="template-error" role="alert">{templateError}</p>}

            <div className="template-editor-actions">
              <button className="primary-button save-template-button" type="submit">Save template</button>
              <button
                className="template-edit-button"
                type="button"
                onClick={() => {
                  setTemplateDraft(null);
                  setEditingTemplateId(null);
                  setTemplateError("");
                  setScreen("templates");
                }}
              >Cancel</button>
            </div>

            {templateDraft.kind === "built-in" && (
              <button className="template-destructive-button" type="button" onClick={resetBuiltInTemplate}>Reset to default</button>
            )}
            {isExistingCustomTemplate && (
              <button className="template-destructive-button" type="button" onClick={deleteCustomTemplate}>Delete template</button>
            )}
          </form>
        </div>

        {showTemplatePicker && (
          <ExercisePicker
            title="Add to template"
            search={templateExerciseSearch}
            selectedExerciseIds={templateDraft.exerciseIds}
            onSearchChange={setTemplateExerciseSearch}
            onSelect={addExerciseToTemplateDraft}
            onClose={() => {
              setShowTemplatePicker(false);
              setTemplateExerciseSearch("");
            }}
          />
        )}
      </main>
    );
  }

  if (screen === "history") {
    return (
      <main className="app-shell">
        <div className="phone-layout history-layout">
          <header className="history-header">
            <button className="text-button history-back-button" onClick={() => setScreen("home")}>
              <span aria-hidden="true">←</span> Home
            </button>
            <div className="brand-lockup compact"><RocketMark /><span>LIFT OFF</span></div>
          </header>

          <section className="history-intro" aria-labelledby="history-title">
            <p className="eyebrow">Training log</p>
            <h1 id="history-title">Workout history</h1>
            <p>Every completed session saved on this device, newest first.</p>
          </section>

          {workoutHistory.length === 0 ? (
            <section className="history-empty">
              <div className="empty-icon" aria-hidden="true">◷</div>
              <h2>No workouts saved yet</h2>
              <p>Finish at least one valid completed set and your workout will appear here.</p>
              <button className="primary-button" onClick={() => setScreen("home")}>Return home</button>
            </section>
          ) : (
            <ol className="history-list" aria-label="Saved workouts">
              {workoutHistory.map((workout) => {
                const expanded = expandedWorkoutIds.includes(workout.id);
                const detailsId = `workout-details-${workout.id}`;

                return (
                  <li key={workout.id}>
                    <article className="history-card">
                      <button
                        className="history-summary"
                        aria-expanded={expanded}
                        aria-controls={detailsId}
                        onClick={() => toggleWorkoutExpanded(workout.id)}
                      >
                        <span className="history-summary-heading">
                          <span>
                            <strong>{workout.name}</strong>
                            <small>{formatHistoryDate(workout.startedAt)}</small>
                          </span>
                          <span className={expanded ? "history-chevron expanded" : "history-chevron"} aria-hidden="true">⌄</span>
                        </span>
                        <span className="history-metrics">
                          <span><strong>{formatTime(workout.durationSeconds)}</strong><small>Duration</small></span>
                          <span><strong>{workout.exerciseCount}</strong><small>Exercises</small></span>
                          <span><strong>{workout.completedSetCount}</strong><small>Completed sets</small></span>
                          <span><strong>{Math.round(workout.totalVolume).toLocaleString()} kg</strong><small>Volume</small></span>
                        </span>
                      </button>

                      {expanded && (
                        <div className="history-details" id={detailsId}>
                          {workout.exercises.map((exercise, exerciseIndex) => (
                            <section className="history-exercise" key={`${exercise.exerciseId}-${exerciseIndex}`}>
                              <header>
                                <span className="muscle-label">{exercise.muscle}</span>
                                <h2>{exercise.name}</h2>
                                <p>{exercise.equipment}</p>
                              </header>
                              <div className="history-set-table-wrap">
                                <table className="history-set-table">
                                  <caption className="sr-only">Sets for {exercise.name}</caption>
                                  <thead>
                                    <tr><th>Set</th><th>kg</th><th>Reps</th><th>RPE</th><th>Status</th></tr>
                                  </thead>
                                  <tbody>
                                    {exercise.sets.map((set, setIndex) => (
                                      <tr className={set.complete ? "history-set-complete" : "history-set-incomplete"} key={setIndex}>
                                        <td>{setIndex + 1}</td>
                                        <td>{formatSavedNumber(set.weight)}</td>
                                        <td>{formatSavedNumber(set.reps)}</td>
                                        <td>{formatSavedNumber(set.rpe)}</td>
                                        <td><span className="set-status">{set.complete ? "Completed" : "Incomplete"}</span></td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </section>
                          ))}
                        </div>
                      )}
                    </article>
                  </li>
                );
              })}
            </ol>
          )}

          <nav className="bottom-nav" aria-label="Main navigation">
            <button onClick={() => setScreen("home")}><span>⌂</span>Home</button>
            <button className="nav-active" aria-current="page"><span>◷</span>History</button>
            <button><span>⌁</span>Progress</button>
            <button><span>⚙</span>Settings</button>
          </nav>
        </div>
      </main>
    );
  }

  if (screen === "workout") {
    return (
      <main className="app-shell">
        <div className="phone-layout workout-layout">
          <header className="workout-header">
            <button className="text-button" onClick={cancelWorkout}>Cancel</button>
            <div className="live-pill"><span /> Live workout</div>
            <button className="finish-button" onClick={finishWorkout}>Finish</button>
          </header>

          <section className="workout-title-block">
            <p className="eyebrow">{today}</p>
            <div className="workout-heading-row">
              <h1>{workoutName}</h1>
              {totalVolume > 0 && <span className="volume-pill">{Math.round(totalVolume).toLocaleString()} kg</span>}
            </div>
            <div className="timer" aria-label={`Workout duration ${formatTime(seconds)}`}>{formatTime(seconds)}</div>
          </section>

          {workoutError && <div className="workout-alert" role="alert">{workoutError}</div>}

          {loggedExercises.length === 0 ? (
            <section className="empty-workout-card">
              <div className="empty-icon" aria-hidden="true">＋</div>
              <h2>Build this workout</h2>
              <p>Add your first exercise, then record weight, reps and effort as you train.</p>
              <button className="primary-button add-exercise-button" onClick={() => {
                setWorkoutExerciseSearch("");
                setShowWorkoutPicker(true);
              }}>
                <span aria-hidden="true">＋</span> Add exercise
              </button>
            </section>
          ) : (
            <section className="exercise-stack" aria-label="Exercises in this workout">
              {loggedExercises.map((exercise) => (
                <article className="exercise-card" key={exercise.sessionId}>
                  <header className="exercise-card-header">
                    <div>
                      <span className="muscle-label">{exercise.muscle}</span>
                      <h2>{exercise.name}</h2>
                    </div>
                    <button
                      className="more-button"
                      aria-label={`Remove ${exercise.name}`}
                      onClick={() => setLoggedExercises((current) => current.filter((item) => item.sessionId !== exercise.sessionId))}
                    >×</button>
                  </header>

                  <div className="set-table">
                    <div className="set-row set-labels">
                      <span>Set</span><span>Previous</span><span>kg</span><span>Reps</span><span>RPE</span><span />
                    </div>
                    {exercise.sets.map((set, index) => {
                      const previous = exercise.previous[index];
                      return (
                        <div className="set-row" key={index}>
                          <span className="set-number">{index + 1}</span>
                          <span className="previous-value">{previous ? `${previous.weight} × ${previous.reps}` : "—"}</span>
                          <input
                            inputMode="decimal"
                            aria-label={`${exercise.name} set ${index + 1} weight in kilograms`}
                            value={set.weight}
                            placeholder={previous ? String(previous.weight) : "0"}
                            onChange={(event) => updateSet(exercise.sessionId, index, "weight", event.target.value)}
                          />
                          <input
                            inputMode="numeric"
                            aria-label={`${exercise.name} set ${index + 1} repetitions`}
                            value={set.reps}
                            placeholder={previous ? String(previous.reps) : "0"}
                            onChange={(event) => updateSet(exercise.sessionId, index, "reps", event.target.value)}
                          />
                          <input
                            inputMode="decimal"
                            aria-label={`${exercise.name} set ${index + 1} RPE`}
                            value={set.rpe}
                            placeholder="—"
                            onChange={(event) => updateSet(exercise.sessionId, index, "rpe", event.target.value)}
                          />
                          <button
                            className={set.complete ? "set-check complete" : "set-check"}
                            aria-label={set.complete ? "Mark set incomplete" : "Mark set complete"}
                            onClick={() => updateSet(exercise.sessionId, index, "complete", !set.complete)}
                          >✓</button>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    className="add-set-button"
                    onClick={() =>
                      setLoggedExercises((current) =>
                        current.map((item) => item.sessionId === exercise.sessionId ? { ...item, sets: [...item.sets, blankSet()] } : item),
                      )
                    }
                  >＋ Add set</button>
                </article>
              ))}
              <button className="secondary-add-button" onClick={() => {
                setWorkoutExerciseSearch("");
                setShowWorkoutPicker(true);
              }}>＋ Add another exercise</button>
            </section>
          )}

          {loggedExercises.length === 0 && (
            <aside className="previous-hint">
              <span className="hint-icon" aria-hidden="true">↗</span>
              <div><strong>Previous performance appears here</strong><p>Lift Off shows your last sets beside every exercise.</p></div>
            </aside>
          )}
        </div>

        {showWorkoutPicker && (
          <ExercisePicker
            title="Add exercise"
            search={workoutExerciseSearch}
            onSearchChange={setWorkoutExerciseSearch}
            onSelect={addExerciseToWorkout}
            onClose={() => {
              setShowWorkoutPicker(false);
              setWorkoutExerciseSearch("");
            }}
          />
        )}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="phone-layout dashboard">
        <header className="topbar">
          <div className="brand-lockup compact"><RocketMark /><span>LIFT OFF</span></div>
          <button className="profile-button" aria-label="Profile">AS</button>
        </header>

        <section className="greeting">
          <p className="eyebrow">{today}</p>
          <h1>Ready to lift?</h1>
          <p>Make today&apos;s numbers count.</p>
        </section>

        {completedMessage && <div className="saved-banner"><span>✓</span>{completedMessage}</div>}

        <button className="start-card" onClick={openTemplateSelection}>
          <span className="start-icon" aria-hidden="true">▶</span>
          <span className="start-copy"><strong>Start workout</strong><small>Choose a template or start empty</small></span>
          <span className="start-arrow" aria-hidden="true">→</span>
        </button>

        <section className="section-block">
          <div className="section-heading">
            <div><p className="eyebrow">At a glance</p><h2>Your week</h2></div>
            <span className="week-chip">{formatWeekRange(dashboardSummary.weekRange)}</span>
          </div>
          <div className="stat-grid">
            <article className="stat-card">
              <span className="stat-symbol">◷</span>
              <strong>{dashboardSummary.workoutsThisWeek}</strong>
              <p>Workouts</p>
            </article>
            <article className="stat-card">
              <span className="stat-symbol">Σ</span>
              <strong>{formatCompactVolume(dashboardSummary.completedVolumeThisWeek)}</strong>
              <p>Volume</p>
            </article>
            <article className="stat-card highlight-stat">
              <span className="stat-symbol">✓</span>
              <strong>{dashboardSummary.completedSetsThisWeek}</strong>
              <p>Completed sets</p>
            </article>
          </div>
        </section>

        <section className="insight-card">
          <div className="insight-topline"><span className="insight-badge">Latest session</span></div>
          {dashboardSummary.latestWorkout ? (
            <>
              <h2>{dashboardSummary.latestWorkout.name} · {latestWorkoutDateLabel}</h2>
              <p className="latest-session-line">
                {dashboardSummary.latestWorkout.exerciseCount} {pluralise(dashboardSummary.latestWorkout.exerciseCount, "exercise")} ·{" "}
                {dashboardSummary.latestWorkout.completedSetCount} completed {pluralise(dashboardSummary.latestWorkout.completedSetCount, "set")}
              </p>
              <p className="latest-session-total">
                {formatFullVolume(dashboardSummary.latestWorkout.totalVolume)} across {formatCompactDuration(dashboardSummary.latestWorkout.durationSeconds)}
              </p>
            </>
          ) : (
            <>
              <h2>Your first session starts here.</h2>
              <p>Complete a workout to see a factual summary of your latest training session.</p>
            </>
          )}
        </section>

        <nav className="bottom-nav" aria-label="Main navigation">
          <button className="nav-active" aria-current="page"><span>⌂</span>Home</button>
          <button onClick={() => setScreen("history")}><span>◷</span>History</button>
          <button><span>⌁</span>Progress</button>
          <button><span>⚙</span>Settings</button>
        </nav>
      </div>
    </main>
  );
}
