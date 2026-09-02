import { useEffect, useMemo, useState } from "react";
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

type Screen = "welcome" | "home" | "workout" | "history";
type SetEntry = { weight: string; reps: string; rpe: string; complete: boolean };
type Exercise = {
  id: string;
  name: string;
  muscle: string;
  equipment: string;
  previous: PreviousSet[];
};
type LoggedExercise = Exercise & { sessionId: string; sets: SetEntry[] };
type LocalWeekRange = { start: Date; endExclusive: Date; endDisplay: Date };
type DashboardSummary = {
  weekRange: LocalWeekRange;
  workoutsThisWeek: number;
  completedVolumeThisWeek: number;
  completedSetsThisWeek: number;
  latestWorkout: SavedWorkout | null;
};

const WORKOUT_NAME = "Upper body";

const EXERCISES: Exercise[] = [
  { id: "bench", name: "Barbell Bench Press", muscle: "Chest", equipment: "Barbell", previous: [{ weight: 70, reps: 8 }, { weight: 70, reps: 7 }] },
  { id: "incline-db", name: "Incline Dumbbell Press", muscle: "Chest", equipment: "Dumbbells", previous: [{ weight: 26, reps: 9 }, { weight: 26, reps: 8 }] },
  { id: "pull-up", name: "Weighted Pull-up", muscle: "Back", equipment: "Bodyweight", previous: [{ weight: 32, reps: 6 }, { weight: 32, reps: 5 }] },
  { id: "lat-pulldown", name: "Lat Pulldown", muscle: "Back", equipment: "Cable", previous: [] },
  { id: "cable-row", name: "Seated Cable Row", muscle: "Back", equipment: "Cable", previous: [{ weight: 68, reps: 10 }, { weight: 68, reps: 9 }] },
  { id: "ohp", name: "Overhead Press", muscle: "Shoulders", equipment: "Barbell", previous: [{ weight: 50, reps: 6 }, { weight: 50, reps: 5 }] },
  { id: "lateral", name: "Cable Lateral Raise", muscle: "Shoulders", equipment: "Cable", previous: [{ weight: 7.5, reps: 12 }, { weight: 7.5, reps: 11 }] },
  { id: "squat", name: "Back Squat", muscle: "Legs", equipment: "Barbell", previous: [{ weight: 100, reps: 6 }, { weight: 100, reps: 6 }] },
  { id: "rdl", name: "Romanian Deadlift", muscle: "Legs", equipment: "Barbell", previous: [{ weight: 95, reps: 8 }, { weight: 95, reps: 7 }] },
  { id: "split-squat", name: "Bulgarian Split Squat", muscle: "Legs", equipment: "Dumbbells", previous: [{ weight: 24, reps: 8 }, { weight: 24, reps: 8 }] },
  { id: "curl", name: "Cable Curl", muscle: "Arms", equipment: "Cable", previous: [{ weight: 20, reps: 10 }, { weight: 20, reps: 9 }] },
  { id: "triceps", name: "Overhead Triceps Extension", muscle: "Arms", equipment: "Cable", previous: [{ weight: 25, reps: 10 }, { weight: 25, reps: 9 }] },
  { id: "calf", name: "Standing Calf Raise", muscle: "Calves", equipment: "Machine", previous: [{ weight: 70, reps: 12 }, { weight: 70, reps: 11 }] },
];

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

export default function Home() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [seconds, setSeconds] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");
  const [loggedExercises, setLoggedExercises] = useState<LoggedExercise[]>([]);
  const [savedPrevious, setSavedPrevious] = useState<PreviousSetsByExercise>({});
  const [workoutStartedAt, setWorkoutStartedAt] = useState<number | null>(null);
  const [workoutHistory, setWorkoutHistory] = useState<SavedWorkout[]>([]);
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

  const filteredExercises = useMemo(() => {
    const term = search.trim().toLowerCase();
    return EXERCISES.filter((exercise) =>
      !term || [exercise.name, exercise.muscle, exercise.equipment].some((value) => value.toLowerCase().includes(term)),
    );
  }, [search]);

  const totalVolume = loggedExercises.reduce(
    (total, exercise) =>
      total + exercise.sets.reduce((setTotal, set) => setTotal + completedSetVolume(set), 0),
    0,
  );

  function startWorkout() {
    setWorkoutStartedAt(Date.now());
    setSeconds(0);
    setLoggedExercises([]);
    setWorkoutError("");
    setCompletedMessage("");
    setScreen("workout");
  }

  function selectExercise(exercise: Exercise) {
    const previous = savedPrevious[exercise.id] ?? exercise.previous;
    setLoggedExercises((current) => [
      ...current,
      { ...exercise, previous, sessionId: `${exercise.id}-${Date.now()}`, sets: [blankSet()] },
    ]);
    setShowPicker(false);
    setSearch("");
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
    setWorkoutStartedAt(null);
    setSeconds(0);
    setShowPicker(false);
    setSearch("");
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
      name: WORKOUT_NAME,
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
              <h1>{WORKOUT_NAME}</h1>
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
              <button className="primary-button add-exercise-button" onClick={() => setShowPicker(true)}>
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
              <button className="secondary-add-button" onClick={() => setShowPicker(true)}>＋ Add another exercise</button>
            </section>
          )}

          {loggedExercises.length === 0 && (
            <aside className="previous-hint">
              <span className="hint-icon" aria-hidden="true">↗</span>
              <div><strong>Previous performance appears here</strong><p>Lift Off shows your last sets beside every exercise.</p></div>
            </aside>
          )}
        </div>

        {showPicker && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowPicker(false)}>
            <section className="exercise-picker" role="dialog" aria-modal="true" aria-labelledby="picker-title" onMouseDown={(event) => event.stopPropagation()}>
              <div className="modal-handle" />
              <header className="picker-header">
                <div><p className="eyebrow">Exercise library</p><h2 id="picker-title">Add exercise</h2></div>
                <button className="modal-close" onClick={() => setShowPicker(false)} aria-label="Close exercise picker">×</button>
              </header>
              <label className="search-box">
                <span aria-hidden="true">⌕</span>
                <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search exercise, muscle or equipment" />
              </label>
              <div className="exercise-list">
                {filteredExercises.map((exercise) => (
                  <button key={exercise.id} className="exercise-option" onClick={() => selectExercise(exercise)}>
                    <span className="exercise-option-icon">{exercise.name.slice(0, 1)}</span>
                    <span><strong>{exercise.name}</strong><small>{exercise.muscle} · {exercise.equipment}</small></span>
                    <span className="option-plus">＋</span>
                  </button>
                ))}
                {filteredExercises.length === 0 && <p className="no-results">No matching exercise yet.</p>}
              </div>
            </section>
          </div>
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

        <button className="start-card" onClick={startWorkout}>
          <span className="start-icon" aria-hidden="true">▶</span>
          <span className="start-copy"><strong>Start workout</strong><small>Timer starts immediately</small></span>
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
