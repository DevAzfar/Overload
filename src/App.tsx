import { useEffect, useMemo, useState } from "react";

type Screen = "welcome" | "home" | "workout";
type SetEntry = { weight: string; reps: string; rpe: string; complete: boolean };
type PreviousSet = { weight: number; reps: number };
type Exercise = {
  id: string;
  name: string;
  muscle: string;
  equipment: string;
  previous: PreviousSet[];
};
type LoggedExercise = Exercise & { sessionId: string; sets: SetEntry[] };

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
  const [savedPrevious, setSavedPrevious] = useState<Record<string, PreviousSet[]>>({});
  const [completedMessage, setCompletedMessage] = useState("");

  useEffect(() => {
    if (screen !== "workout") return;
    const interval = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [screen]);

  useEffect(() => {
    const saved = window.localStorage.getItem("lift-off-previous-sets");
    if (saved) {
      try {
        setSavedPrevious(JSON.parse(saved) as Record<string, PreviousSet[]>);
      } catch {
        window.localStorage.removeItem("lift-off-previous-sets");
      }
    }
  }, []);

  const today = useMemo(
    () => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date()),
    [],
  );

  const filteredExercises = useMemo(() => {
    const term = search.trim().toLowerCase();
    return EXERCISES.filter((exercise) =>
      !term || [exercise.name, exercise.muscle, exercise.equipment].some((value) => value.toLowerCase().includes(term)),
    );
  }, [search]);

  const totalVolume = loggedExercises.reduce(
    (total, exercise) =>
      total + exercise.sets.reduce((setTotal, set) => setTotal + (Number(set.weight) || 0) * (Number(set.reps) || 0), 0),
    0,
  );

  function startWorkout() {
    setSeconds(0);
    setLoggedExercises([]);
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

  function finishWorkout() {
    const newPrevious = { ...savedPrevious };
    loggedExercises.forEach((exercise) => {
      const completed = exercise.sets
        .filter((set) => Number(set.weight) >= 0 && Number(set.reps) > 0)
        .map((set) => ({ weight: Number(set.weight), reps: Number(set.reps) }));
      if (completed.length) newPrevious[exercise.id] = completed;
    });
    setSavedPrevious(newPrevious);
    window.localStorage.setItem("lift-off-previous-sets", JSON.stringify(newPrevious));
    setCompletedMessage(`Workout saved · ${loggedExercises.length} exercises · ${Math.round(totalVolume).toLocaleString()} kg`);
    setScreen("home");
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

  if (screen === "workout") {
    return (
      <main className="app-shell">
        <div className="phone-layout workout-layout">
          <header className="workout-header">
            <button className="text-button" onClick={() => setScreen("home")}>Cancel</button>
            <div className="live-pill"><span /> Live workout</div>
            <button className="finish-button" onClick={finishWorkout}>Finish</button>
          </header>

          <section className="workout-title-block">
            <p className="eyebrow">{today}</p>
            <div className="workout-heading-row">
              <h1>Upper body</h1>
              {totalVolume > 0 && <span className="volume-pill">{Math.round(totalVolume).toLocaleString()} kg</span>}
            </div>
            <div className="timer" aria-label={`Workout duration ${formatTime(seconds)}`}>{formatTime(seconds)}</div>
          </section>

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
            <span className="week-chip">Aug 17–23</span>
          </div>
          <div className="stat-grid">
            <article className="stat-card"><span className="stat-symbol">✓</span><strong>3</strong><p>Workouts</p></article>
            <article className="stat-card"><span className="stat-symbol">↗</span><strong>12.8k</strong><p>Volume · kg</p></article>
            <article className="stat-card highlight-stat"><span className="stat-symbol">★</span><strong>2</strong><p>New records</p></article>
          </div>
        </section>

        <section className="insight-card">
          <div className="insight-topline"><span className="insight-badge">Lift Off insight</span><span aria-hidden="true">•••</span></div>
          <h2>Your weighted pull-up is climbing.</h2>
          <p>Estimated strength is up 4.2% across your last four sessions. Keep the same exercise order next time for a cleaner comparison.</p>
          <div className="mini-chart" aria-label="Upward strength trend illustration">
            {[28, 42, 38, 61, 74, 88].map((height) => <span key={height} style={{ height: `${height}%` }} />)}
          </div>
        </section>

        <nav className="bottom-nav" aria-label="Main navigation">
          <button className="nav-active"><span>⌂</span>Home</button>
          <button><span>◷</span>History</button>
          <button><span>⌁</span>Progress</button>
          <button><span>⚙</span>Settings</button>
        </nav>
      </div>
    </main>
  );
}
