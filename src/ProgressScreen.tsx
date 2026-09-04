import { useId, useMemo, useState } from "react";
import {
  buildExerciseChoices,
  calculateExerciseProgress,
  type ExerciseMetricBest,
  type PersonalRecordAchievement,
  type VolumeTrendPoint,
} from "./progressAnalytics";
import type { SavedWorkout } from "./workoutHistory";

type ProgressScreenProps = {
  workoutHistory: SavedWorkout[];
  onNavigateHome: () => void;
  onNavigateHistory: () => void;
};

function formatNumber(value: number, maximumFractionDigits = 2) {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1_000_000_000) return value.toExponential(Math.min(maximumFractionDigits, 2));
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits }).format(value);
}

function formatWeight(value: number) {
  return `${formatNumber(value)} kg`;
}

function formatEstimatedOneRepMax(value: number | null) {
  return value === null ? "Not available" : `${formatNumber(value, 1)} kg`;
}

function formatProgressDate(dateString: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

function formatShortDate(dateString: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(dateString));
}

function formatBestDetail(best: ExerciseMetricBest | null) {
  return best ? `${best.workoutName} · ${formatShortDate(best.startedAt)}` : "No eligible sets";
}

function recordLabel(achievement: PersonalRecordAchievement) {
  if (achievement.category === "weight") return `Heaviest weight · ${formatWeight(achievement.value)}`;
  if (achievement.category === "repetitions") return `Highest repetitions · ${formatNumber(achievement.value)}`;
  return `Estimated 1RM · ${formatEstimatedOneRepMax(achievement.value)}`;
}

type MetricCardProps = {
  label: string;
  value: string;
  detail: string;
  highlighted?: boolean;
};

function MetricCard({ label, value, detail, highlighted = false }: MetricCardProps) {
  return (
    <article className={highlighted ? "progress-metric-card highlighted" : "progress-metric-card"}>
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function VolumeTrendChart({ series }: { series: VolumeTrendPoint[] }) {
  const titleId = useId();
  const descriptionId = useId();
  const width = 100;
  const height = 48;
  const padding = 5;
  const values = series.map((point) => point.volume);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum;
  const coordinates = series.map((point, index) => {
    const x = series.length === 1 ? width / 2 : padding + (index / (series.length - 1)) * (width - padding * 2);
    const y = range === 0 ? height / 2 : padding + ((maximum - point.volume) / range) * (height - padding * 2);
    return {
      ...point,
      x: Number.isFinite(x) ? x : width / 2,
      y: Number.isFinite(y) ? y : height / 2,
    };
  });
  const accessibleValues = series
    .map((point) => `${formatShortDate(point.startedAt)}: ${formatWeight(point.volume)}`)
    .join("; ");

  return (
    <section className="progress-panel" aria-labelledby={titleId}>
      <div className="progress-section-heading">
        <div><p className="eyebrow">Completed-set volume</p><h2 id={titleId}>Volume trend</h2></div>
        <span>{series.length} {series.length === 1 ? "session" : "sessions"}</span>
      </div>
      <p className="progress-section-copy">Exercise volume for each session, shown oldest to newest.</p>
      <div className="volume-chart-shell">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
          <desc id={descriptionId}>Recorded session volumes: {accessibleValues}.</desc>
          <line className="volume-chart-guide" x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} />
          {coordinates.length > 1 && (
            <polyline
              className="volume-chart-line"
              points={coordinates.map((point) => `${point.x},${point.y}`).join(" ")}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {coordinates.map((point) => (
            <circle className="volume-chart-point" key={`${point.workoutId}-${point.startedAt}`} cx={point.x} cy={point.y} r="2.2">
              <title>{formatShortDate(point.startedAt)} · {formatWeight(point.volume)}</title>
            </circle>
          ))}
        </svg>
        <div className="volume-chart-labels" aria-hidden="true">
          <span>{formatShortDate(series[0].startedAt)}<strong>{formatWeight(series[0].volume)}</strong></span>
          {series.length > 1 && <span>{formatShortDate(series[series.length - 1].startedAt)}<strong>{formatWeight(series[series.length - 1].volume)}</strong></span>}
        </div>
      </div>
      <p className="sr-only">{accessibleValues}</p>
    </section>
  );
}

export default function ProgressScreen({ workoutHistory, onNavigateHome, onNavigateHistory }: ProgressScreenProps) {
  const choices = useMemo(() => buildExerciseChoices(workoutHistory), [workoutHistory]);
  const [selectedExerciseId, setSelectedExerciseId] = useState("");
  const [expandedSessionIds, setExpandedSessionIds] = useState<string[]>([]);
  const selectedStillExists = choices.some((choice) => choice.exerciseId === selectedExerciseId);
  const automaticSelection = choices.find((choice) => choice.hasValidPerformance)?.exerciseId ?? choices[0]?.exerciseId ?? "";
  const activeExerciseId = selectedStillExists ? selectedExerciseId : automaticSelection;
  const hasAnyValidPerformance = choices.some((choice) => choice.hasValidPerformance);
  const analytics = useMemo(
    () => activeExerciseId ? calculateExerciseProgress(workoutHistory, activeExerciseId) : null,
    [activeExerciseId, workoutHistory],
  );

  function toggleSession(sessionId: string) {
    setExpandedSessionIds((current) =>
      current.includes(sessionId) ? current.filter((id) => id !== sessionId) : [...current, sessionId],
    );
  }

  return (
    <main className="app-shell">
      <div className="phone-layout progress-layout">
        <header className="progress-header">
          <button className="text-button history-back-button" onClick={onNavigateHome}><span aria-hidden="true">←</span> Home</button>
          <span className="progress-header-mark">LIFT OFF</span>
        </header>

        <section className="progress-intro" aria-labelledby="progress-title">
          <p className="eyebrow">Exercise analytics</p>
          <h1 id="progress-title">Progress</h1>
          <p>Factual performance calculated from your valid completed sets.</p>
        </section>

        {choices.length === 0 ? (
          <section className="progress-empty">
            <div className="empty-icon" aria-hidden="true">↗</div>
            <h2>No exercises recorded yet</h2>
            <p>Complete your first workout to build an exercise progress history.</p>
            <button className="primary-button" onClick={onNavigateHome}>Return home</button>
          </section>
        ) : (
          <>
            <label className="progress-exercise-selector">
              <span>Select exercise</span>
              <select value={activeExerciseId} onChange={(event) => {
                setSelectedExerciseId(event.target.value);
                setExpandedSessionIds([]);
              }}>
                {choices.map((choice) => (
                  <option value={choice.exerciseId} key={choice.exerciseId}>{choice.displayName}</option>
                ))}
              </select>
            </label>

            {!hasAnyValidPerformance ? (
              <section className="progress-empty compact-progress-empty">
                <h2>No usable completed sets</h2>
                <p>Your history contains exercises, but none has a completed set with valid weight and repetitions.</p>
              </section>
            ) : analytics && analytics.sessionsNewestFirst.length === 0 ? (
              <section className="progress-empty compact-progress-empty">
                <h2>No usable sets for {analytics.displayName}</h2>
                <p>This exercise appears in History, but it has no valid completed performance to analyse.</p>
              </section>
            ) : analytics ? (
              <>
                <section className="progress-title-row">
                  <div><p className="eyebrow">Selected exercise</p><h2>{analytics.displayName}</h2></div>
                  <span>{analytics.allTimeBests.sessionCount} {analytics.allTimeBests.sessionCount === 1 ? "session" : "sessions"}</span>
                </section>

                <section aria-labelledby="all-time-bests-title">
                  <div className="progress-section-heading standalone-heading">
                    <div><p className="eyebrow">Current maximums</p><h2 id="all-time-bests-title">All-time bests</h2></div>
                  </div>
                  <div className="progress-metric-grid">
                    <MetricCard label="Best weight" value={formatWeight(analytics.allTimeBests.bestWeight!.value)} detail={formatBestDetail(analytics.allTimeBests.bestWeight)} />
                    <MetricCard label="Best repetitions" value={formatNumber(analytics.allTimeBests.bestRepetitions!.value)} detail={formatBestDetail(analytics.allTimeBests.bestRepetitions)} />
                    <MetricCard
                      label="Estimated 1RM"
                      value={formatEstimatedOneRepMax(analytics.allTimeBests.bestEstimatedOneRepMax?.value ?? null)}
                      detail={formatBestDetail(analytics.allTimeBests.bestEstimatedOneRepMax)}
                      highlighted
                    />
                    <MetricCard label="Recorded volume" value={formatWeight(analytics.allTimeBests.totalVolume)} detail="Valid completed sets" />
                    <MetricCard label="Sessions" value={formatNumber(analytics.allTimeBests.sessionCount)} detail="With valid completed sets" />
                  </div>
                  <p className="estimate-explanation">Estimated 1RM uses the Epley formula for sets of 1–30 repetitions. It is an estimate, not an actual tested maximum.</p>
                </section>

                <VolumeTrendChart series={analytics.volumeSeries} />

                <section className="progress-panel" aria-labelledby="personal-records-title">
                  <div className="progress-section-heading">
                    <div><p className="eyebrow">Chronological milestones</p><h2 id="personal-records-title">Personal-record history</h2></div>
                  </div>
                  {analytics.personalRecords.length === 0 ? (
                    <p className="progress-inline-empty">No record events can be calculated for this exercise.</p>
                  ) : (
                    <ol className="record-timeline">
                      {analytics.personalRecords.map((event) => (
                        <li key={`${event.workoutId}-${event.startedAt}`}>
                          <div className="record-marker" aria-hidden="true" />
                          <div>
                            <p>{formatProgressDate(event.startedAt)}</p>
                            <h3>{event.workoutName}</h3>
                            <ul>
                              {event.achievements.map((achievement) => (
                                <li key={achievement.category}>{recordLabel(achievement)}</li>
                              ))}
                            </ul>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>

                <section className="progress-history" aria-labelledby="performance-history-title">
                  <div className="progress-section-heading standalone-heading">
                    <div><p className="eyebrow">Newest first</p><h2 id="performance-history-title">Performance history</h2></div>
                  </div>
                  <div className="progress-session-list">
                    {analytics.sessionsNewestFirst.map((session) => {
                      const expanded = expandedSessionIds.includes(session.id);
                      const detailsId = `progress-session-${session.id}`;
                      return (
                        <article className="progress-session-card" key={session.id}>
                          <button className="progress-session-summary" aria-expanded={expanded} aria-controls={detailsId} onClick={() => toggleSession(session.id)}>
                            <span><strong>{session.workoutName}</strong><small>{formatProgressDate(session.startedAt)}</small></span>
                            <span className="progress-session-facts">
                              <span>{session.sets.length} {session.sets.length === 1 ? "set" : "sets"}</span>
                              <span>{formatWeight(session.volume)}</span>
                              <span>Est. 1RM {formatEstimatedOneRepMax(session.bestEstimatedOneRepMax)}</span>
                            </span>
                            <span className={expanded ? "history-chevron expanded" : "history-chevron"} aria-hidden="true">⌄</span>
                          </button>
                          {expanded && (
                            <div className="progress-session-details" id={detailsId}>
                              <div className="progress-set-table-wrap">
                                <table className="progress-set-table">
                                  <caption className="sr-only">Valid completed sets from {session.workoutName}</caption>
                                  <thead><tr><th>Set</th><th>Performance</th><th>RPE</th><th>Volume</th><th>Estimated 1RM</th></tr></thead>
                                  <tbody>
                                    {session.sets.map((set, index) => (
                                      <tr key={index}>
                                        <td>{index + 1}</td>
                                        <td>{formatWeight(set.weight)} × {formatNumber(set.reps)}</td>
                                        <td>{set.rpe === null ? "—" : formatNumber(set.rpe)}</td>
                                        <td>{formatWeight(set.volume)}</td>
                                        <td>{formatEstimatedOneRepMax(set.estimatedOneRepMax)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              </>
            ) : null}
          </>
        )}

        <nav className="bottom-nav" aria-label="Main navigation">
          <button onClick={onNavigateHome}><span>⌂</span>Home</button>
          <button onClick={onNavigateHistory}><span>◷</span>History</button>
          <button className="nav-active" aria-current="page"><span>⌁</span>Progress</button>
          <button><span>⚙</span>Settings</button>
        </nav>
      </div>
    </main>
  );
}
