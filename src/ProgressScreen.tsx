import { useEffect, useId, useMemo, useState } from "react";
import BrandLogo from "./BrandLogo";
import ConfirmDialog from "./ConfirmDialog";
import { DEMO_PROFILES, getDemoProfile, type DemoChartMetric } from "./demoProfiles";
import type { DemoMetadata, DemoProfileId } from "./demoMetadata";
import {
  buildExerciseChoices,
  calculateTimeAxisPositions,
  calculateExerciseProgress,
  createEstimatedOneRepMaxSeries,
  filterRecordedExerciseChoices,
  type ExerciseSessionProgress,
  type ExerciseMetricBest,
  type PersonalRecordAchievement,
  type VolumeTrendPoint,
} from "./progressAnalytics";
import type { Exercise } from "./exercises";
import type { SavedWorkout } from "./workoutHistory";
import { createWorkoutCsvFilename, serializeWorkoutHistoryToCsv } from "./workoutCsv";
import type { ActionResult } from "./storageTypes";
import {
  formatVolumeFromKilograms,
  formatWeightFromKilograms,
  type WeightUnit,
} from "./weightUnits";

type ProgressScreenProps = {
  workoutHistory: SavedWorkout[];
  exerciseLibrary: readonly Exercise[];
  weightUnit: WeightUnit;
  storageWarning?: string;
  activeDemo: DemoMetadata | null;
  demoStorageWarning?: string;
  onActivateDemo: (profileId: DemoProfileId) => ActionResult;
  onExitDemo: () => ActionResult;
  onNavigateHome: () => void;
  onNavigateHistory: () => void;
  onNavigateSettings: () => void;
};

function formatNumber(value: number, maximumFractionDigits = 2) {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1_000_000_000) return value.toExponential(Math.min(maximumFractionDigits, 2));
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits }).format(value);
}

function formatEstimatedOneRepMax(value: number | null, weightUnit: WeightUnit) {
  return value === null ? "Not available" : formatWeightFromKilograms(value, weightUnit, 1);
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

function formatShortDate(dateString: string, includeYear = false) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", ...(includeYear ? { year: "numeric" } : {}) }).format(new Date(dateString));
}

function formatBestDetail(best: ExerciseMetricBest | null) {
  return best ? `${best.workoutName} · ${formatShortDate(best.startedAt, true)}` : "No eligible sets";
}

function recordLabel(achievement: PersonalRecordAchievement, weightUnit: WeightUnit) {
  if (achievement.category === "weight") return `Heaviest weight · ${formatWeightFromKilograms(achievement.value, weightUnit)}`;
  if (achievement.category === "repetitions") return `Highest repetitions · ${formatNumber(achievement.value)}`;
  return `Estimated 1RM · ${formatEstimatedOneRepMax(achievement.value, weightUnit)}`;
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

function ProgressTrendChart({
  sessions,
  series,
  metric,
  weightUnit,
  onMetricChange,
}: {
  sessions: ExerciseSessionProgress[];
  series: VolumeTrendPoint[];
  metric: DemoChartMetric;
  weightUnit: WeightUnit;
  onMetricChange: (metric: DemoChartMetric) => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const width = 100;
  const height = 48;
  const padding = 5;
  const estimateSeries = createEstimatedOneRepMaxSeries(sessions);
  const points = metric === "volume"
    ? series.map((point) => ({ ...point, value: point.volume }))
    : estimateSeries.map((point) => ({ ...point, value: point.estimatedOneRepMax }));
  const values = points.map((point) => point.value);
  const spansYears = points.length > 1 && new Date(points[0].startedAt).getFullYear() !== new Date(points[points.length - 1].startedAt).getFullYear();
  const formatValue = (value: number) => metric === "volume"
    ? formatVolumeFromKilograms(value, weightUnit)
    : formatEstimatedOneRepMax(value, weightUnit);
  const metricLabel = metric === "volume" ? "Volume" : "Estimated 1RM";
  const metricExplanation = metric === "volume"
    ? "Exercise volume for each session, shown oldest to newest."
    : "Best Epley estimated 1RM from eligible 1–30 repetition sets in each session.";

  if (points.length === 0) {
    return (
      <section className="progress-panel" aria-labelledby={titleId}>
        <div className="progress-section-heading">
          <div><p className="eyebrow">Training trend</p><h2 id={titleId}>{metricLabel}</h2></div>
          <MetricSelector value={metric} onChange={onMetricChange} />
        </div>
        <p className="progress-section-copy">{metricExplanation}</p>
        <p className="progress-inline-empty">Estimated 1RM is unavailable because this exercise has no eligible completed sets between 1 and 30 repetitions.</p>
      </section>
    );
  }
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum;
  const xPositions = calculateTimeAxisPositions(points, width, padding);
  const coordinates = points.map((point, index) => {
    const x = xPositions[index];
    const y = range === 0 ? height / 2 : padding + ((maximum - point.value) / range) * (height - padding * 2);
    return {
      ...point,
      x: Number.isFinite(x) ? x : width / 2,
      y: Number.isFinite(y) ? y : height / 2,
    };
  });
  const accessibleValues = points
    .map((point) => `${formatShortDate(point.startedAt, spansYears)}: ${formatValue(point.value)}`)
    .join("; ");

  return (
    <section className="progress-panel" aria-labelledby={titleId}>
        <div className="progress-section-heading trend-heading">
          <div><p className="eyebrow">Training trend</p><h2 id={titleId}>{metricLabel}</h2></div>
          <MetricSelector value={metric} onChange={onMetricChange} />
      </div>
      <p className="progress-section-copy">{metricExplanation} {points.length} {points.length === 1 ? "session" : "sessions"}.</p>
      <dl className="trend-range-summary" aria-label={`${metricLabel} recorded range`}>
        <div><dt>Low</dt><dd>{formatValue(minimum)}</dd></div>
        <div><dt>High</dt><dd>{formatValue(maximum)}</dd></div>
      </dl>
      <div className="volume-chart-shell">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={titleId} aria-describedby={descriptionId}>
          <desc id={descriptionId}>{metricLabel} by session, oldest to newest: {accessibleValues}.</desc>
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
              <title>{formatShortDate(point.startedAt, spansYears)} · {formatValue(point.value)}</title>
            </circle>
          ))}
        </svg>
        <div className="volume-chart-labels" aria-hidden="true">
          <span>{formatShortDate(points[0].startedAt, spansYears)}<strong>{formatValue(points[0].value)}</strong></span>
          {points.length > 1 && <span>{formatShortDate(points[points.length - 1].startedAt, spansYears)}<strong>{formatValue(points[points.length - 1].value)}</strong></span>}
        </div>
      </div>
      <p className="sr-only">Horizontal axis: session date from oldest to newest. Vertical axis: {metricLabel}. Recorded values: {accessibleValues}</p>
    </section>
  );
}

function MetricSelector({ value, onChange }: { value: DemoChartMetric; onChange: (metric: DemoChartMetric) => void }) {
  return (
    <div className="metric-selector" role="group" aria-label="Progress chart metric">
      <button type="button" aria-pressed={value === "volume"} onClick={() => onChange("volume")}>Volume</button>
      <button type="button" aria-pressed={value === "estimated-one-rep-max"} onClick={() => onChange("estimated-one-rep-max")}>Estimated 1RM</button>
    </div>
  );
}

export default function ProgressScreen({
  exerciseLibrary,
  workoutHistory,
  weightUnit,
  storageWarning,
  activeDemo,
  demoStorageWarning,
  onActivateDemo,
  onExitDemo,
  onNavigateHome,
  onNavigateHistory,
  onNavigateSettings,
}: ProgressScreenProps) {
  const choices = useMemo(
    () => buildExerciseChoices(workoutHistory, exerciseLibrary),
    [exerciseLibrary, workoutHistory],
  );
  const [exerciseSearch, setExerciseSearch] = useState("");
  const filteredChoices = useMemo(
    () => filterRecordedExerciseChoices(choices, exerciseSearch),
    [choices, exerciseSearch],
  );
  const [selectedExerciseId, setSelectedExerciseId] = useState("");
  const [chartMetric, setChartMetric] = useState<DemoChartMetric>("volume");
  const [expandedSessionIds, setExpandedSessionIds] = useState<string[]>([]);
  const [pendingDemoAction, setPendingDemoAction] = useState<{ type: "activate"; profileId: DemoProfileId } | { type: "exit" } | null>(null);
  const [demoMessage, setDemoMessage] = useState("");
  const [demoError, setDemoError] = useState("");
  const activeDemoProfile = activeDemo ? getDemoProfile(activeDemo.profileId) : null;
  const selectedStillExists = filteredChoices.some((choice) => choice.exerciseId === selectedExerciseId);
  const automaticSelection = filteredChoices.find((choice) => choice.hasValidPerformance)?.exerciseId ?? filteredChoices[0]?.exerciseId ?? "";
  const activeExerciseId = selectedStillExists ? selectedExerciseId : automaticSelection;
  const hasAnyValidPerformance = filteredChoices.some((choice) => choice.hasValidPerformance);
  const analytics = useMemo(
    () => activeExerciseId ? calculateExerciseProgress(workoutHistory, activeExerciseId, exerciseLibrary) : null,
    [activeExerciseId, exerciseLibrary, workoutHistory],
  );

  useEffect(() => {
    if (!activeDemoProfile) return;
    setSelectedExerciseId(activeDemoProfile.featuredExerciseId);
    setChartMetric(activeDemoProfile.preferredMetric);
  }, [activeDemoProfile?.id]);

  function toggleSession(sessionId: string) {
    setExpandedSessionIds((current) =>
      current.includes(sessionId) ? current.filter((id) => id !== sessionId) : [...current, sessionId],
    );
  }

  function confirmDemoAction() {
    if (!pendingDemoAction) return;
    const profile = pendingDemoAction.type === "activate" ? getDemoProfile(pendingDemoAction.profileId) : null;
    const result = pendingDemoAction.type === "activate"
      ? onActivateDemo(pendingDemoAction.profileId)
      : onExitDemo();
    setPendingDemoAction(null);
    if (!result.ok) {
      setDemoMessage("");
      setDemoError(result.message);
      return;
    }
    if (profile) {
      setSelectedExerciseId(profile.featuredExerciseId);
      setChartMetric(profile.preferredMetric);
    }
    setDemoError("");
    setDemoMessage(result.message);
  }

  function exportActiveDemo() {
    try {
      const csv = serializeWorkoutHistoryToCsv(workoutHistory);
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = createWorkoutCsvFilename();
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setDemoError("");
      setDemoMessage("Synthetic-history CSV download requested in canonical kilograms. Confirm the file exists before relying on it as a backup.");
    } catch (error) {
      setDemoMessage("");
      setDemoError(error instanceof Error ? error.message : "Demo workout history could not be exported.");
    }
  }

  return (
    <main className="app-shell">
      {activeDemoProfile && <div className="demo-data-pill" role="status">Demo data · {activeDemoProfile.name}</div>}
      <div className="phone-layout progress-layout">
        <header className="progress-header">
          <button className="text-button history-back-button" onClick={onNavigateHome}><span aria-hidden="true">←</span> Home</button>
          <span className="progress-header-mark"><BrandLogo size="compact" /><span>OVERLOAD</span></span>
        </header>

        <section className="progress-intro" aria-labelledby="progress-title">
          <p className="eyebrow">Exercise analytics</p>
          <h1 id="progress-title">Progress</h1>
          <p>Factual performance calculated from your valid completed sets.</p>
        </section>

        {storageWarning && <p className="history-notice error" role="alert">{storageWarning}</p>}
        {demoStorageWarning && <p className="history-notice error" role="alert">{demoStorageWarning}</p>}
        {demoError && <p className="history-notice error" role="alert">{demoError}</p>}
        {demoMessage && <p className="settings-success" role="status">{demoMessage}</p>}

        {activeDemoProfile && (
          <section className="active-demo-banner" aria-labelledby="active-demo-title">
            <div>
              <p className="eyebrow">Demo data · fictional athlete</p>
              <h2 id="active-demo-title">{activeDemoProfile.name}</h2>
              <p>{activeDemoProfile.description}</p>
            </div>
            <div className="active-demo-actions">
              <button type="button" onClick={exportActiveDemo}>Export synthetic history</button>
              <button type="button" className="destructive-outline" onClick={() => setPendingDemoAction({ type: "exit" })}>Exit demo and clear demo workouts</button>
            </div>
          </section>
        )}

        <section className="demo-explorer" aria-labelledby="demo-explorer-title">
          <div className="progress-section-heading standalone-heading">
            <div><p className="eyebrow">Fictional training data</p><h2 id="demo-explorer-title">Explore demo athletes</h2></div>
          </div>
          <p className="progress-section-copy">Each profile uses the same CSV validation, History and analytics pipeline as your own workouts.</p>
          <div className="demo-profile-grid">
            {DEMO_PROFILES.map((profile) => (
              <article className={activeDemo?.profileId === profile.id ? "demo-profile-card active" : "demo-profile-card"} key={profile.id}>
                <p className="eyebrow">{activeDemo?.profileId === profile.id ? "Active demo" : "Synthetic profile"}</p>
                <h3>{profile.name}</h3>
                <p>{profile.description}</p>
                <small>Featured: {profile.featuredExerciseName}</small>
                <button type="button" onClick={() => setPendingDemoAction({ type: "activate", profileId: profile.id })}>
                  {activeDemo?.profileId === profile.id ? "Reload profile" : "Review and load"}
                </button>
              </article>
            ))}
          </div>
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
            <div className="progress-recorded-controls">
              <label className="progress-recorded-search">
                <span>Search recorded exercises</span>
                <input
                  type="search"
                  value={exerciseSearch}
                  onChange={(event) => setExerciseSearch(event.target.value)}
                  placeholder="e.g. Bench press"
                  aria-describedby="progress-recorded-search-help"
                  aria-controls="progress-recorded-results"
                />
              </label>
              <p id="progress-recorded-search-help">Only exercises contained in saved workouts appear here.</p>
            </div>

            {filteredChoices.length === 0 ? (
              <section id="progress-recorded-results" className="progress-empty compact-progress-empty" role="status">
                <h2>No recorded exercises match</h2>
                <p>Try a different exercise name or clear the search. An exercise appears after a workout containing it is saved.</p>
                <button type="button" className="text-button" onClick={() => setExerciseSearch("")}>Clear search</button>
              </section>
            ) : (
              <div id="progress-recorded-results">
                <label className="progress-exercise-selector">
                  <span>Recorded exercises</span>
                  <select value={activeExerciseId} onChange={(event) => {
                    setSelectedExerciseId(event.target.value);
                    setExpandedSessionIds([]);
                  }}>
                    {filteredChoices.map((choice) => (
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
                    <MetricCard label="Best weight" value={formatWeightFromKilograms(analytics.allTimeBests.bestWeight!.value, weightUnit)} detail={formatBestDetail(analytics.allTimeBests.bestWeight)} />
                    <MetricCard label="Best repetitions" value={formatNumber(analytics.allTimeBests.bestRepetitions!.value)} detail={formatBestDetail(analytics.allTimeBests.bestRepetitions)} />
                    <MetricCard
                      label="Estimated 1RM"
                      value={formatEstimatedOneRepMax(analytics.allTimeBests.bestEstimatedOneRepMax?.value ?? null, weightUnit)}
                      detail={formatBestDetail(analytics.allTimeBests.bestEstimatedOneRepMax)}
                      highlighted
                    />
                    <MetricCard label="Recorded volume" value={formatVolumeFromKilograms(analytics.allTimeBests.totalVolume, weightUnit)} detail="Valid completed sets" />
                    <MetricCard label="Sessions" value={formatNumber(analytics.allTimeBests.sessionCount)} detail="With valid completed sets" />
                  </div>
                  <p className="estimate-explanation">Estimated 1RM uses the Epley formula for sets of 1–30 repetitions. It is an estimate, not an actual tested maximum. For bodyweight movements entered as 0 {weightUnit}, zero volume and estimated 1RM reflect only the entered external weight, not the athlete&apos;s complete performance.</p>
                </section>

                <ProgressTrendChart
                  sessions={analytics.sessionsNewestFirst}
                  series={analytics.volumeSeries}
                  metric={chartMetric}
                  weightUnit={weightUnit}
                  onMetricChange={setChartMetric}
                />

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
                                <li key={achievement.category}>{recordLabel(achievement, weightUnit)}</li>
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
                              <span>{formatVolumeFromKilograms(session.volume, weightUnit)}</span>
                              <span>Est. 1RM {formatEstimatedOneRepMax(session.bestEstimatedOneRepMax, weightUnit)}</span>
                            </span>
                            <span className={expanded ? "history-chevron expanded" : "history-chevron"} aria-hidden="true">⌄</span>
                          </button>
                          {expanded && (
                            <div className="progress-session-details" id={detailsId}>
                              <div className="progress-set-table-wrap" tabIndex={0} aria-label={`Scrollable performance sets for ${session.workoutName}`}>
                                <table className="progress-set-table">
                                  <caption className="sr-only">Valid completed sets from {session.workoutName}</caption>
                                  <thead><tr><th>Set</th><th>Performance</th><th>RPE</th><th>Volume</th><th>Estimated 1RM</th></tr></thead>
                                  <tbody>
                                    {session.sets.map((set, index) => (
                                      <tr key={index}>
                                        <td>{index + 1}</td>
                                        <td>{formatWeightFromKilograms(set.weight, weightUnit)} × {formatNumber(set.reps)}</td>
                                        <td>{set.rpe === null ? "—" : formatNumber(set.rpe)}</td>
                                        <td>{formatVolumeFromKilograms(set.volume, weightUnit)}</td>
                                        <td>{formatEstimatedOneRepMax(set.estimatedOneRepMax, weightUnit)}</td>
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
              </div>
            )}
          </>
        )}

        <nav className="bottom-nav" aria-label="Main navigation">
          <button onClick={onNavigateHome}><span>⌂</span>Home</button>
          <button onClick={onNavigateHistory}><span>◷</span>History</button>
          <button className="nav-active" aria-current="page"><span>⌁</span>Progress</button>
          <button onClick={onNavigateSettings}><span>⚙</span>Settings</button>
        </nav>
      </div>
      <ConfirmDialog
        open={pendingDemoAction?.type === "activate"}
        title={`Load ${pendingDemoAction?.type === "activate" ? getDemoProfile(pendingDemoAction.profileId).name : "demo profile"}?`}
        description={workoutHistory.length > 0
          ? "This fictional profile will replace the current workout history, which will not be restored automatically. Exporting a CSV first is recommended. Templates, custom exercises and Settings are unaffected."
          : "This loads fictional synthetic workout history. Templates, custom exercises and Settings are unaffected."}
        confirmLabel="Load fictional profile"
        destructive={workoutHistory.length > 0}
        onCancel={() => setPendingDemoAction(null)}
        onConfirm={confirmDemoAction}
      />
      <ConfirmDialog
        open={pendingDemoAction?.type === "exit"}
        title="Exit demo and clear demo workouts?"
        description="This removes the currently loaded synthetic workout history, rebuilt previous-set data and demo label. Settings, templates and custom exercises stay unchanged. History from before demo activation cannot be restored automatically."
        confirmLabel="Exit and clear demo workouts"
        destructive
        onCancel={() => setPendingDemoAction(null)}
        onConfirm={confirmDemoAction}
      />
    </main>
  );
}
