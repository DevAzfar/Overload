import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import type { ActionResult, StorageLoadStatus } from "./storageTypes";
import type { SavedWorkout } from "./workoutHistory";
import {
  formatDisplayNumber,
  formatVolumeFromKilograms,
  kilogramsToDisplayWeight,
  type WeightUnit,
} from "./weightUnits";

type HistoryScreenProps = {
  history: SavedWorkout[];
  weightUnit: WeightUnit;
  expandedWorkoutIds: string[];
  loadStatus: StorageLoadStatus;
  loadMessage: string;
  actionMessage: string;
  actionError: string;
  recoveredHistoryWillBeSaved: boolean;
  onToggleExpanded: (workoutId: string) => void;
  onEdit: (workout: SavedWorkout) => void;
  onDelete: (workoutId: string) => ActionResult;
  onClearNotices: () => void;
  onNavigateHome: () => void;
  onNavigateProgress: () => void;
  onNavigateSettings: () => void;
};

function formatTime(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
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
  return value === null ? "—" : value.toLocaleString("en-GB", { maximumFractionDigits: 12 });
}

export default function HistoryScreen({
  history,
  weightUnit,
  expandedWorkoutIds,
  loadStatus,
  loadMessage,
  actionMessage,
  actionError,
  recoveredHistoryWillBeSaved,
  onToggleExpanded,
  onEdit,
  onDelete,
  onClearNotices,
  onNavigateHome,
  onNavigateProgress,
  onNavigateSettings,
}: HistoryScreenProps) {
  const [workoutToDelete, setWorkoutToDelete] = useState<SavedWorkout | null>(null);
  const seriousLoadFailure = loadStatus === "unavailable" || loadStatus === "recovery-failed";

  function requestDelete(workout: SavedWorkout) {
    onClearNotices();
    setWorkoutToDelete(workout);
  }

  function confirmDelete() {
    if (!workoutToDelete) return;
    onDelete(workoutToDelete.id);
    setWorkoutToDelete(null);
  }

  const deleteDescription = workoutToDelete
    ? `Delete “${workoutToDelete.name || "Unnamed workout"}” from ${formatHistoryDate(workoutToDelete.startedAt)}? Dashboard totals, Progress analytics, personal records and previous-set comparisons will be recalculated.${recoveredHistoryWillBeSaved ? " This successful deletion will also permanently discard the duplicate or unreadable records that were ignored during History recovery." : ""}`
    : "";

  return (
    <main className="app-shell">
      <div className="phone-layout history-layout">
        <header className="history-header">
          <button className="text-button history-back-button" onClick={onNavigateHome}>
            <span aria-hidden="true">←</span> Home
          </button>
          <span className="progress-header-mark">LIFT OFF</span>
        </header>

        <section className="history-intro" aria-labelledby="history-title">
          <p className="eyebrow">Training log</p>
          <h1 id="history-title" tabIndex={-1}>Workout history</h1>
          <p>Every completed session saved on this device, newest first.</p>
        </section>

        {loadMessage && <p className={seriousLoadFailure ? "history-notice error" : "history-notice warning"} role={seriousLoadFailure ? "alert" : "status"}>{loadMessage}</p>}
        {actionError && <p className="history-notice error" role="alert">{actionError}</p>}
        {actionMessage && <p className="history-notice success" role="status">{actionMessage}</p>}

        {history.length === 0 ? (
          <section className="history-empty">
            <div className="empty-icon" aria-hidden="true">◷</div>
            <h2>{seriousLoadFailure ? "Workout history could not be read" : "No workouts saved yet"}</h2>
            <p>{seriousLoadFailure ? "Your device data was not treated as empty. Resolve storage access and reload before making History changes." : "Finish at least one valid completed set and your workout will appear here."}</p>
            <button className="primary-button" onClick={onNavigateHome}>Return home</button>
          </section>
        ) : (
          <ol className="history-list" aria-label="Saved workouts">
            {history.map((workout, workoutIndex) => {
              const expanded = expandedWorkoutIds.includes(workout.id);
              const detailsId = `workout-details-${workoutIndex}`;
              return (
                <li key={`${workout.id}-${workout.startedAt}`}>
                  <article className="history-card">
                    <button
                      className="history-summary"
                      aria-expanded={expanded}
                      aria-controls={detailsId}
                      onClick={() => onToggleExpanded(workout.id)}
                    >
                      <span className="history-summary-heading">
                        <span>
                          <strong>{workout.name || "Unnamed workout"}</strong>
                          <small>{formatHistoryDate(workout.startedAt)}</small>
                        </span>
                        <span className={expanded ? "history-chevron expanded" : "history-chevron"} aria-hidden="true">⌄</span>
                      </span>
                      <span className="history-metrics">
                        <span><strong>{formatTime(workout.durationSeconds)}</strong><small>Duration</small></span>
                        <span><strong>{workout.exerciseCount}</strong><small>Exercises</small></span>
                        <span><strong>{workout.completedSetCount}</strong><small>Completed sets</small></span>
                        <span><strong>{formatVolumeFromKilograms(workout.totalVolume, weightUnit)}</strong><small>Volume</small></span>
                      </span>
                    </button>
                    <div className="history-card-actions" aria-label={`Actions for ${workout.name || "unnamed workout"}`}>
                      <button type="button" onClick={() => { onClearNotices(); onEdit(workout); }} aria-label={`Edit ${workout.name || "unnamed workout"}`}>Edit</button>
                      <button type="button" className="history-delete-button" onClick={() => requestDelete(workout)} aria-label={`Delete ${workout.name || "unnamed workout"}`}>Delete</button>
                    </div>

                    {expanded && (
                      <div className="history-details" id={detailsId}>
                        {workout.exercises.map((exercise, exerciseIndex) => (
                          <section className="history-exercise" key={`${exercise.exerciseId}-${exerciseIndex}`}>
                            <header>
                              <span className="muscle-label">{exercise.muscle || "Unspecified muscle"}</span>
                              <h2>{exercise.name || "Unnamed exercise"}</h2>
                              <p>{exercise.equipment || "Unspecified equipment"}</p>
                            </header>
                            <div className="history-set-table-wrap" tabIndex={0} aria-label={`Scrollable sets for ${exercise.name || "unnamed exercise"}`}>
                              <table className="history-set-table">
                                <caption className="sr-only">Sets for {exercise.name || "unnamed exercise"}</caption>
                                <thead><tr><th>Set</th><th>{weightUnit}</th><th>Reps</th><th>RPE</th><th>Status</th></tr></thead>
                                <tbody>
                                  {exercise.sets.map((set, setIndex) => (
                                    <tr className={set.complete ? "history-set-complete" : "history-set-incomplete"} key={setIndex}>
                                      <td>{setIndex + 1}</td>
                                      <td>{set.weight === null ? "—" : formatDisplayNumber(kilogramsToDisplayWeight(set.weight, weightUnit), 12)}</td>
                                      <td>{formatSavedNumber(set.reps)}</td>
                                      <td>{formatSavedNumber(set.rpe)}{set.rpe !== null && (set.rpe < 1 || set.rpe > 10) ? <span className="legacy-value-label">Legacy value</span> : null}</td>
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
          <button onClick={onNavigateHome}><span>⌂</span>Home</button>
          <button className="nav-active" aria-current="page"><span>◷</span>History</button>
          <button onClick={onNavigateProgress}><span>⌁</span>Progress</button>
          <button onClick={onNavigateSettings}><span>⚙</span>Settings</button>
        </nav>
      </div>

      <ConfirmDialog
        open={workoutToDelete !== null}
        title="Delete workout?"
        description={deleteDescription}
        confirmLabel="Delete workout"
        destructive
        onCancel={() => setWorkoutToDelete(null)}
        onConfirm={confirmDelete}
      />
    </main>
  );
}
