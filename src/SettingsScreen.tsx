import { useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import {
  DISPLAY_NAME_MAX_LENGTH,
  getResolvedDisplayName,
  type AppSettings,
} from "./appSettings";
import {
  WORKOUT_CSV_MAX_FILE_SIZE,
  analyseWorkoutImport,
  createWorkoutCsvFilename,
  mergeWorkoutHistory,
  parseWorkoutCsv,
  serializeWorkoutHistoryToCsv,
  type WorkoutCsvImport,
} from "./workoutCsv";
import type { SavedWorkout } from "./workoutHistory";
import type { WeightUnit } from "./weightUnits";

export type SettingsActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

type SettingsScreenProps = {
  settings: AppSettings;
  workoutHistory: SavedWorkout[];
  settingsLoadError: string;
  historyRecoveryWarning?: string;
  hasActiveWorkout: boolean;
  onSaveSettings: (settings: AppSettings) => SettingsActionResult;
  onApplyWorkoutHistory: (history: SavedWorkout[]) => SettingsActionResult;
  onClearWorkoutData: () => SettingsActionResult;
  onResetAllData: () => SettingsActionResult;
  onNavigateHome: () => void;
  onNavigateHistory: () => void;
  onNavigateProgress: () => void;
  onDraftStateChange?: (hasDraft: boolean) => void;
};

function formatImportDate(dateString: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(dateString));
}

export default function SettingsScreen({
  settings,
  workoutHistory,
  settingsLoadError,
  historyRecoveryWarning,
  hasActiveWorkout,
  onSaveSettings,
  onApplyWorkoutHistory,
  onClearWorkoutData,
  onResetAllData,
  onNavigateHome,
  onNavigateHistory,
  onNavigateProgress,
  onDraftStateChange,
}: SettingsScreenProps) {
  const [displayNameDraft, setDisplayNameDraft] = useState(settings.displayName);
  const [profileError, setProfileError] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [importData, setImportData] = useState<WorkoutCsvImport | null>(null);
  const [importError, setImportError] = useState("");
  const [allowConflictSkips, setAllowConflictSkips] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [confirmation, setConfirmation] = useState<"replace" | "clear" | "reset" | null>(null);
  const [navigationTarget, setNavigationTarget] = useState<"home" | "history" | "progress" | null>(null);
  const hasSettingsDraft = displayNameDraft !== settings.displayName || importData !== null;
  const destructiveDataActionsBlocked = hasActiveWorkout || hasSettingsDraft;

  useEffect(() => { headingRef.current?.focus(); }, []);
  useEffect(() => { onDraftStateChange?.(hasSettingsDraft); }, [hasSettingsDraft, onDraftStateChange]);
  useEffect(() => () => onDraftStateChange?.(false), [onDraftStateChange]);

  useEffect(() => {
    setDisplayNameDraft(settings.displayName);
  }, [settings.displayName]);

  const conflicts = useMemo(
    () => importData ? analyseWorkoutImport(importData.workouts, workoutHistory) : null,
    [importData, workoutHistory],
  );

  function showActionResult(result: SettingsActionResult) {
    if (result.ok) {
      setSettingsError("");
      setSettingsMessage(result.message);
    } else {
      setSettingsMessage("");
      setSettingsError(result.message);
    }
  }

  function saveDisplayName() {
    const trimmedName = displayNameDraft.trim();
    if (trimmedName.length > DISPLAY_NAME_MAX_LENGTH) {
      setProfileError(`Display name must be ${DISPLAY_NAME_MAX_LENGTH} characters or fewer.`);
      return;
    }

    const result = onSaveSettings({ ...settings, displayName: trimmedName });
    if (!result.ok) {
      setProfileError(result.message);
      return;
    }
    setProfileError("");
    showActionResult(result);
  }

  function selectWeightUnit(weightUnit: WeightUnit) {
    if (weightUnit === settings.weightUnit) return;
    showActionResult(onSaveSettings({ ...settings, weightUnit }));
  }

  function exportWorkoutHistory() {
    if (workoutHistory.length === 0) return;
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
      setSettingsError("");
      setSettingsMessage(`Exported ${workoutHistory.length} ${workoutHistory.length === 1 ? "workout" : "workouts"} in canonical kilograms.`);
    } catch (error) {
      setSettingsMessage("");
      setSettingsError(error instanceof Error ? error.message : "Workout history could not be exported.");
    }
  }

  function resetImportSelection() {
    setImportData(null);
    setImportError("");
    setAllowConflictSkips(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function navigate(target: "home" | "history" | "progress") {
    if (target === "home") onNavigateHome();
    else if (target === "history") onNavigateHistory();
    else onNavigateProgress();
  }

  function requestNavigation(target: "home" | "history" | "progress") {
    if (hasSettingsDraft) setNavigationTarget(target);
    else navigate(target);
  }

  async function selectImportFile(file: File | undefined) {
    setSettingsMessage("");
    setSettingsError("");
    setImportData(null);
    setAllowConflictSkips(false);
    setImportError("");
    if (!file) return;
    if (file.size > WORKOUT_CSV_MAX_FILE_SIZE) {
      setImportError(`The selected CSV exceeds the ${WORKOUT_CSV_MAX_FILE_SIZE / 1024 / 1024} MiB limit.`);
      return;
    }

    try {
      const result = parseWorkoutCsv(await file.text());
      if (!result.ok) {
        setImportError(result.error);
        return;
      }
      setImportData(result.data);
    } catch {
      setImportError("Lift Off could not read the selected CSV file.");
    }
  }

  function applyMerge() {
    if (!importData || !conflicts) return;
    if (conflicts.conflictingIds.length > 0 && !allowConflictSkips) {
      setImportError("Acknowledge that existing versions of conflicting workout IDs will be kept before merging.");
      return;
    }

    try {
      const mergedHistory = mergeWorkoutHistory(workoutHistory, importData.workouts, allowConflictSkips);
      const result = onApplyWorkoutHistory(mergedHistory);
      if (result.ok) {
        const mergeDetails = [
          `${conflicts.newWorkoutCount} added`,
          `${conflicts.exactDuplicateIds.length} already present`,
          `${conflicts.conflictingIds.length} ${conflicts.conflictingIds.length === 1 ? "conflict" : "conflicts"} kept as existing`,
        ].join(" · ");
        showActionResult({ ok: true, message: `${result.message} Merge result: ${mergeDetails}.` });
        resetImportSelection();
      } else {
        showActionResult(result);
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "The validated CSV could not be merged.");
    }
  }

  function applyReplace() {
    if (!importData) return;
    const result = onApplyWorkoutHistory(importData.workouts);
    showActionResult(result);
    setConfirmation(null);
    if (result.ok) {
      resetImportSelection();
    }
  }

  function clearWorkoutData() {
    if (destructiveDataActionsBlocked) {
      setSettingsError("Finish or cancel the active workout, settings draft or pending CSV import before clearing data.");
      return;
    }
    const result = onClearWorkoutData();
    showActionResult(result);
    setConfirmation(null);
    if (result.ok) {
      resetImportSelection();
    }
  }

  function resetAllData() {
    if (destructiveDataActionsBlocked) {
      setSettingsError("Finish or cancel the active workout, settings draft or pending CSV import before resetting data.");
      return;
    }
    const result = onResetAllData();
    showActionResult(result);
    setConfirmation(null);
    if (result.ok) {
      resetImportSelection();
    }
  }

  return (
    <main className="app-shell">
      <div className="phone-layout settings-layout">
        <header className="progress-header">
          <button className="text-button history-back-button" onClick={() => requestNavigation("home")}><span aria-hidden="true">←</span> Home</button>
          <span className="progress-header-mark">LIFT OFF</span>
        </header>

        <section className="settings-intro" aria-labelledby="settings-title">
          <p className="eyebrow">Device preferences</p>
          <h1 id="settings-title" ref={headingRef} tabIndex={-1}>Settings</h1>
          <p>Personalise Lift Off and control the workout data stored on this device.</p>
        </section>

        {settingsLoadError && <p className="settings-alert" role="alert">{settingsLoadError}</p>}
        {historyRecoveryWarning && <p className="settings-alert" role="status">{historyRecoveryWarning}</p>}
        {settingsError && <p className="settings-alert" role="alert">{settingsError}</p>}
        {settingsMessage && <p className="settings-success" role="status">{settingsMessage}</p>}
        {hasActiveWorkout && <p className="settings-alert" role="alert">Finish or cancel the active workout before importing, changing units or deleting data.</p>}

        <section className="settings-panel" aria-labelledby="profile-settings-title">
          <div className="settings-section-heading"><p className="eyebrow">Profile</p><h2 id="profile-settings-title">Display name</h2></div>
          <p className="settings-copy">Used in your dashboard greeting. Leaving it blank resets the greeting to {getResolvedDisplayName({ ...settings, displayName: "" })}.</p>
          <form onSubmit={(event) => { event.preventDefault(); saveDisplayName(); }}>
            <label className="settings-field">
              <span>Name</span>
              <input
                value={displayNameDraft}
                maxLength={DISPLAY_NAME_MAX_LENGTH + 1}
                onChange={(event) => { setDisplayNameDraft(event.target.value); setProfileError(""); }}
                aria-invalid={Boolean(profileError)}
                aria-describedby={profileError ? "display-name-error" : "display-name-help"}
              />
              <small id="display-name-help">{displayNameDraft.length}/{DISPLAY_NAME_MAX_LENGTH} characters</small>
              {profileError && <small className="field-error" id="display-name-error" role="alert">{profileError}</small>}
            </label>
            <button className="primary-button settings-save-button" type="submit">Save display name</button>
          </form>
        </section>

        <section className="settings-panel" aria-labelledby="unit-settings-title">
          <div className="settings-section-heading"><p className="eyebrow">Units</p><h2 id="unit-settings-title">Weight display</h2></div>
          <p className="settings-copy">Stored workout data always remains in kilograms. This setting changes workout input and presentation only.</p>
          <fieldset className="unit-options" disabled={hasActiveWorkout}>
            <legend className="sr-only">Weight unit</legend>
            <label><input type="radio" name="weight-unit" checked={settings.weightUnit === "kg"} onChange={() => selectWeightUnit("kg")} /> Kilograms (kg)</label>
            <label><input type="radio" name="weight-unit" checked={settings.weightUnit === "lb"} onChange={() => selectWeightUnit("lb")} /> Pounds (lb)</label>
          </fieldset>
        </section>

        <section className="settings-panel" aria-labelledby="export-settings-title">
          <div className="settings-section-heading"><p className="eyebrow">Workout history only</p><h2 id="export-settings-title">Export CSV</h2></div>
          <p className="settings-copy">Exports completed workout history and every saved set. Templates, custom exercises and settings are not included. Numerical weights use canonical kilograms for reliable restoration.</p>
          {workoutHistory.length === 0 && <p className="settings-inline-empty">Complete a workout before exporting.</p>}
          <button className="secondary-settings-button" type="button" disabled={workoutHistory.length === 0} onClick={exportWorkoutHistory}>Export workout history</button>
        </section>

        <section className="settings-panel" aria-labelledby="import-settings-title">
          <div className="settings-section-heading"><p className="eyebrow">Workout history only</p><h2 id="import-settings-title">Import or restore CSV</h2></div>
          <p className="settings-copy">Imports canonical kilogram workout data. It does not restore templates, custom exercises or settings.</p>
          <label className="settings-file-field">
            <span>Choose Lift Off CSV</span>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" disabled={hasActiveWorkout} onChange={(event) => { void selectImportFile(event.target.files?.[0]); }} />
          </label>
          {importError && <p className="settings-alert compact" role="alert">{importError}</p>}

          {importData && conflicts && (
            <div className="import-summary" aria-labelledby="import-summary-title">
              <h3 id="import-summary-title">Validated import summary</h3>
              <dl>
                <div><dt>Workouts</dt><dd>{importData.workoutCount}</dd></div>
                <div><dt>Exercises</dt><dd>{importData.exerciseCount}</dd></div>
                <div><dt>Sets</dt><dd>{importData.setCount}</dd></div>
                <div><dt>Date range</dt><dd>{formatImportDate(importData.earliestStartedAt)}–{formatImportDate(importData.latestStartedAt)}</dd></div>
                <div><dt>New to device</dt><dd>{conflicts.newWorkoutCount}</dd></div>
                <div><dt>Already present</dt><dd>{conflicts.exactDuplicateIds.length}</dd></div>
                <div><dt>ID conflicts</dt><dd>{conflicts.conflictingIds.length}</dd></div>
              </dl>
              {importData.legacyRpeCount > 0 && (
                <p className="settings-alert compact" role="status">
                  {importData.legacyRpeCount} legacy RPE {importData.legacyRpeCount === 1 ? "value is" : "values are"} outside 1–10. Schema-v1 compatibility preserves these values; edit them before saving that workout again.
                </p>
              )}
              {conflicts.conflictingIds.length > 0 && (
                <label className="conflict-confirmation">
                  <input type="checkbox" checked={allowConflictSkips} onChange={(event) => setAllowConflictSkips(event.target.checked)} />
                  Keep the existing workout for each conflicting ID and skip its imported version.
                </label>
              )}
              <div className="import-actions">
                <button type="button" className="primary-button" disabled={hasActiveWorkout} onClick={applyMerge}>Merge with existing</button>
                <button type="button" className="secondary-settings-button destructive-outline" disabled={hasActiveWorkout} onClick={() => { setSettingsError(""); setSettingsMessage(""); setConfirmation("replace"); }}>Replace workout history</button>
                <button type="button" className="text-button" onClick={resetImportSelection}>Cancel import</button>
              </div>
            </div>
          )}
        </section>

        <section className="settings-panel danger-panel" aria-labelledby="delete-settings-title">
          <div className="settings-section-heading"><p className="eyebrow">Data deletion</p><h2 id="delete-settings-title">Clear device data</h2></div>
          <div className="danger-action">
            <div><h3>Clear workout data</h3><p>Deletes History and previous-set comparisons. Preserves settings, templates and custom exercises.</p></div>
            <button type="button" disabled={destructiveDataActionsBlocked} onClick={() => { setSettingsError(""); setSettingsMessage(""); setConfirmation("clear"); }}>Clear workout data</button>
          </div>
          <div className="danger-action">
            <div><h3>Reset all app data</h3><p>Deletes every Lift Off-owned localStorage record and restores source defaults. Unrelated website data is preserved.</p></div>
            <button type="button" disabled={destructiveDataActionsBlocked} onClick={() => { setSettingsError(""); setSettingsMessage(""); setConfirmation("reset"); }}>Reset all app data</button>
          </div>
        </section>

        <nav className="bottom-nav" aria-label="Main navigation">
          <button onClick={() => requestNavigation("home")}><span>⌂</span>Home</button>
          <button onClick={() => requestNavigation("history")}><span>▷</span>History</button>
          <button onClick={() => requestNavigation("progress")}><span>⌁</span>Progress</button>
          <button className="nav-active" aria-current="page"><span>⚙</span>Settings</button>
        </nav>
      </div>
      <ConfirmDialog
        open={confirmation === "replace"}
        title="Replace workout History?"
        description="Replace all current workout History with this validated CSV? Previous-set comparisons will be rebuilt. Templates, custom exercises and settings will be preserved."
        confirmLabel="Replace workout History"
        destructive
        onCancel={() => setConfirmation(null)}
        onConfirm={applyReplace}
      />
      <ConfirmDialog
        open={confirmation === "clear"}
        title="Clear workout data?"
        description="This deletes workout History and previous-set comparisons. Settings, templates and custom exercises will be preserved."
        confirmLabel="Clear workout data"
        destructive
        onCancel={() => setConfirmation(null)}
        onConfirm={clearWorkoutData}
      />
      <ConfirmDialog
        open={confirmation === "reset"}
        title="Reset all Lift Off data?"
        description="This deletes every Lift Off-owned workout, previous-set, template, custom-exercise and settings record. Unrelated website storage is not touched."
        confirmLabel="Reset all app data"
        destructive
        onCancel={() => setConfirmation(null)}
        onConfirm={resetAllData}
      />
      <ConfirmDialog
        open={navigationTarget !== null}
        title="Discard Settings work?"
        description="Your unsaved display-name draft or validated pending CSV import will be discarded. Saved device data will remain unchanged."
        confirmLabel="Discard and leave"
        destructive
        onCancel={() => setNavigationTarget(null)}
        onConfirm={() => {
          const target = navigationTarget;
          setNavigationTarget(null);
          if (target) navigate(target);
        }}
      />
    </main>
  );
}
