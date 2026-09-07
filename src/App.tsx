import { useEffect, useMemo, useRef, useState } from "react";
import ActiveWorkoutRecoveryDialog from "./ActiveWorkoutRecoveryDialog";
import BrandLogo from "./BrandLogo";
import { alignDemoProfileToReferenceDate, getDemoProfile } from "./demoProfiles";
import {
  DEMO_METADATA_KEY,
  loadDemoMetadata,
  serialiseDemoMetadata,
  type DemoMetadata,
  type DemoProfileId,
} from "./demoMetadata";
import ConfirmDialog from "./ConfirmDialog";
import ExerciseManager from "./ExerciseManager";
import ExercisePicker from "./ExercisePicker";
import HistoricalWorkoutEditor from "./HistoricalWorkoutEditor";
import HistoryScreen from "./HistoryScreen";
import SettingsScreen, { type SettingsActionResult } from "./SettingsScreen";
import {
  APP_SETTINGS_KEY,
  getDefaultAppSettings,
  getResolvedDisplayName,
  loadAppSettings,
  normaliseAppSettings,
  saveAppSettings,
  type AppSettings,
} from "./appSettings";
import {
  combineExerciseLibrary,
  createExerciseLookup,
  getExerciseById,
  type CustomExercise,
  type Equipment,
  type Exercise,
  type ExerciseKind,
  type MuscleGroup,
} from "./exercises";
import ProgressScreen from "./ProgressScreen";
import {
  CUSTOM_EXERCISES_KEY,
  loadCustomExercises,
  saveCustomExercises,
} from "./customExercises";
import {
  createWorkoutId,
  calculateSavedWorkoutSummary,
  loadPreviousSetsResult,
  loadWorkoutHistoryResult,
  type PreviousSet,
  type PreviousSetsByExercise,
  type SavedWorkout,
  type SavedWorkoutExercise,
  type SavedWorkoutSet,
} from "./workoutHistory";
import {
  WORKOUT_TEMPLATES_KEY,
  createTemplateId,
  getDefaultTemplate,
  getDefaultTemplates,
  loadWorkoutTemplatesResult,
  saveWorkoutTemplates,
  type WorkoutTemplate,
} from "./workoutTemplates";
import {
  ALL_APP_STORAGE_KEYS,
  WORKOUT_DATA_KEYS,
  WORKOUT_AND_DEMO_DATA_KEYS,
  rebuildPreviousSetsFromHistory,
  removeStorageKeysWithRollback,
  readStorageSnapshot,
  writeWorkoutDataWithRollback,
} from "./workoutDataControls";
import { deleteWorkoutFromHistory, replaceWorkoutInHistory } from "./historyMutations";
import { type StorageLoadStatus } from "./storageTypes";
import {
  hasSetFieldErrors,
  validateEditableSet,
  validateTemplateName,
  validateWorkoutName,
  type SetFieldErrors,
  type SetFieldName,
} from "./workoutValidation";
import {
  ACTIVE_WORKOUT_DRAFT_KEY,
  activeDraftHasEnteredData,
  activeDraftIsMeaningful,
  calculateActiveWorkoutElapsedSeconds,
  loadActiveWorkoutDraft,
  removeActiveWorkoutDraft,
  removeDraftExercise,
  removeDraftSet,
  saveActiveWorkoutDraft,
  serialiseActiveWorkoutDraft,
  type ActiveWorkoutDraft,
  type ActiveWorkoutDraftExercise,
  type ActiveWorkoutDraftSet,
} from "./activeWorkoutDraft";
import {
  WORKOUT_CSV_MAX_EXERCISES_PER_WORKOUT,
  WORKOUT_CSV_MAX_SETS_PER_EXERCISE,
} from "./workoutCsv";
import {
  formatCompactVolumeFromKilograms,
  formatDisplayNumber,
  formatVolumeFromKilograms,
  formatWeightFromKilograms,
  formatWeightInputFromKilograms,
  type WeightUnit,
} from "./weightUnits";

type Screen = "welcome" | "home" | "templates" | "template-editor" | "exercise-manager" | "workout" | "history" | "history-editor" | "progress" | "settings";
type SetEntry = ActiveWorkoutDraftSet;
type LoggedExercise = {
  id: string;
  name: string;
  muscle: string;
  equipment: string;
  kind: ExerciseKind;
  previous: PreviousSet[];
  sessionId: string;
  sets: SetEntry[];
};
type LocalWeekRange = { start: Date; endExclusive: Date; endDisplay: Date };
type DashboardSummary = {
  weekRange: LocalWeekRange;
  workoutsThisWeek: number;
  completedVolumeThisWeek: number;
  completedSetsThisWeek: number;
  latestWorkout: SavedWorkout | null;
};

function createActiveEntryId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const blankSet = (): SetEntry => ({ id: createActiveEntryId("set"), weight: "", reps: "", rpe: "", complete: false });

function setHasEnteredData(set: SetEntry) {
  return set.complete || Boolean(set.weight.trim() || set.reps.trim() || set.rpe.trim());
}

function activeFieldId(sessionId: string, setId: string, field: SetFieldName) {
  return `active-${sessionId}-${setId}-${field}`;
}

function formatTime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function isValidCompletedSet(set: SetEntry, weightUnit: WeightUnit) {
  const result = validateEditableSet(set, weightUnit);
  return result.canonicalSet?.complete === true;
}

function toSavedSet(set: SetEntry, weightUnit: WeightUnit): SavedWorkoutSet {
  const result = validateEditableSet(set, weightUnit);
  if (!result.canonicalSet) throw new Error("Attempted to save an invalid workout set.");
  return result.canonicalSet;
}

function completedSetVolume(set: SetEntry, weightUnit: WeightUnit) {
  if (!isValidCompletedSet(set, weightUnit)) return 0;
  return Number(set.weight) * Number(set.reps);
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

function getDisplayInitials(displayName: string) {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("en-GB"))
    .join("") || "A";
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

function createExerciseSessionId(exerciseId: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${exerciseId}-${crypto.randomUUID()}`;
  }

  return `${exerciseId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [seconds, setSeconds] = useState(0);
  const [showWorkoutPicker, setShowWorkoutPicker] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [workoutExerciseSearch, setWorkoutExerciseSearch] = useState("");
  const [workoutMuscleFilter, setWorkoutMuscleFilter] = useState<MuscleGroup | "">("");
  const [workoutEquipmentFilter, setWorkoutEquipmentFilter] = useState<Equipment | "">("");
  const [templateExerciseSearch, setTemplateExerciseSearch] = useState("");
  const [templateMuscleFilter, setTemplateMuscleFilter] = useState<MuscleGroup | "">("");
  const [templateEquipmentFilter, setTemplateEquipmentFilter] = useState<Equipment | "">("");
  const [customExercises, setCustomExercises] = useState<CustomExercise[]>([]);
  const [customExerciseStorageError, setCustomExerciseStorageError] = useState("");
  const [appSettings, setAppSettings] = useState<AppSettings>(() => getDefaultAppSettings());
  const [settingsLoadError, setSettingsLoadError] = useState("");
  const [loggedExercises, setLoggedExercises] = useState<LoggedExercise[]>([]);
  const [workoutName, setWorkoutName] = useState("");
  const [savedPrevious, setSavedPrevious] = useState<PreviousSetsByExercise>({});
  const [workoutStartedAt, setWorkoutStartedAt] = useState<number | null>(null);
  const [workoutInputUnit, setWorkoutInputUnit] = useState<WeightUnit | null>(null);
  const [activeSetErrors, setActiveSetErrors] = useState<Record<string, SetFieldErrors>>({});
  const [activeDraftStorageError, setActiveDraftStorageError] = useState("");
  const [recoverableActiveDraft, setRecoverableActiveDraft] = useState<ActiveWorkoutDraft | null>(null);
  const [activeDraftLoadStatus, setActiveDraftLoadStatus] = useState<StorageLoadStatus | "unsupported">("missing");
  const [activeDraftLoadMessage, setActiveDraftLoadMessage] = useState("");
  const [workoutHistory, setWorkoutHistory] = useState<SavedWorkout[]>([]);
  const [workoutTemplates, setWorkoutTemplates] = useState<WorkoutTemplate[]>([]);
  const [templateDraft, setTemplateDraft] = useState<WorkoutTemplate | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState("");
  const [emptyWorkoutName, setEmptyWorkoutName] = useState("");
  const [templateSelectionError, setTemplateSelectionError] = useState("");
  const [templateStorageMessage, setTemplateStorageMessage] = useState("");
  const [expandedWorkoutIds, setExpandedWorkoutIds] = useState<string[]>([]);
  const [workoutError, setWorkoutError] = useState("");
  const [completedMessage, setCompletedMessage] = useState("");
  const [historyLoadStatus, setHistoryLoadStatus] = useState<StorageLoadStatus>("missing");
  const [historyLoadMessage, setHistoryLoadMessage] = useState("");
  const [historyNeedsSanitisedSave, setHistoryNeedsSanitisedSave] = useState(false);
  const [historyActionMessage, setHistoryActionMessage] = useState("");
  const [historyActionError, setHistoryActionError] = useState("");
  const [historyDraft, setHistoryDraft] = useState<SavedWorkout | null>(null);
  const [historyDraftUnit, setHistoryDraftUnit] = useState<WeightUnit>("kg");
  const [pendingConfirmation, setPendingConfirmation] = useState<"reset-template" | "delete-template" | "discard-template" | "cancel-workout" | "discard-recovered-workout" | "discard-unreadable-workout" | null>(null);
  const [activeRemovalTarget, setActiveRemovalTarget] = useState<
    | { type: "set"; sessionId: string; setId: string; exerciseName: string; setNumber: number }
    | { type: "exercise"; sessionId: string; exerciseName: string }
    | null
  >(null);
  const [customExerciseDraftOpen, setCustomExerciseDraftOpen] = useState(false);
  const [settingsDraftOpen, setSettingsDraftOpen] = useState(false);
  const [activeDemo, setActiveDemo] = useState<DemoMetadata | null>(null);
  const [demoStorageWarning, setDemoStorageWarning] = useState("");
  const [crossTabConflict, setCrossTabConflict] = useState("");
  const expectedRawValuesRef = useRef<ReadonlyMap<string, string | null>>(new Map());
  const storageSnapshotReadyRef = useRef(false);
  const unsafeStorageKeysRef = useRef<Set<string>>(new Set());
  const unsafeWorkRef = useRef(false);
  const lastPersistedActiveDraftRef = useRef<string | null>(null);

  function createCurrentActiveDraft(): ActiveWorkoutDraft | null {
    if (workoutStartedAt === null || workoutInputUnit === null) return null;
    return {
      version: 1,
      workoutName,
      startedAt: workoutStartedAt,
      weightUnit: workoutInputUnit,
      exercises: loggedExercises.map((exercise) => ({
        id: exercise.id,
        sessionId: exercise.sessionId,
        name: exercise.name,
        muscle: exercise.muscle,
        equipment: exercise.equipment,
        kind: exercise.kind,
        sets: exercise.sets.map((set) => ({ ...set })),
      })),
    };
  }

  useEffect(() => {
    if (screen !== "workout" || workoutStartedAt === null) return;

    const updateElapsedTime = () => {
      setSeconds(calculateActiveWorkoutElapsedSeconds(workoutStartedAt));
    };

    updateElapsedTime();
    const interval = window.setInterval(updateElapsedTime, 1000);
    return () => window.clearInterval(interval);
  }, [screen, workoutStartedAt]);

  useEffect(() => {
    const draft = createCurrentActiveDraft();
    if (!draft) return;
    let serialised: string;
    try {
      serialised = serialiseActiveWorkoutDraft(draft);
    } catch (error) {
      setActiveDraftStorageError(error instanceof Error ? error.message : "The latest workout draft could not be validated for recovery.");
      return;
    }
    if (serialised === lastPersistedActiveDraftRef.current) return;

    const result = saveActiveWorkoutDraft(draft, lastPersistedActiveDraftRef.current);
    if (!result.ok) {
      setActiveDraftStorageError(result.message);
      if (result.conflict) setCrossTabConflict("The active workout draft changed in another tab. This local workout remains open and will not overwrite it.");
      return;
    }
    lastPersistedActiveDraftRef.current = result.rawValue;
    recordExpectedRawValues(new Map([[ACTIVE_WORKOUT_DRAFT_KEY, result.rawValue]]));
    setActiveDraftStorageError("");
  }, [loggedExercises, workoutInputUnit, workoutName, workoutStartedAt]);

  useEffect(() => {
    const draft = createCurrentActiveDraft();
    if (!draft || !activeDraftIsMeaningful(draft)) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [loggedExercises, workoutInputUnit, workoutName, workoutStartedAt]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>("main h1");
      if (!heading) return;
      if (!heading.hasAttribute("tabindex")) heading.tabIndex = -1;
      heading.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [screen]);

  useEffect(() => {
    const settingsLoad = loadAppSettings();
    setAppSettings(settingsLoad.settings);
    if (settingsLoad.error) setSettingsLoadError(settingsLoad.error);
    const customExerciseLoad = loadCustomExercises();
    setCustomExercises(customExerciseLoad.exercises);
    if (customExerciseLoad.error) setCustomExerciseStorageError(customExerciseLoad.error);
    const previousLoad = loadPreviousSetsResult();
    const historyLoad = loadWorkoutHistoryResult();
    setSavedPrevious(previousLoad.data);
    setWorkoutHistory(historyLoad.data);
    setHistoryLoadStatus(
      previousLoad.status === "unavailable" || previousLoad.status === "recovery-failed"
        ? previousLoad.status
        : historyLoad.status,
    );
    setHistoryLoadMessage([historyLoad.message, previousLoad.message].filter(Boolean).join(" "));
    setHistoryNeedsSanitisedSave((historyLoad.discardedItemCount ?? 0) > 0);
    const templateLoad = loadWorkoutTemplatesResult();
    setWorkoutTemplates(templateLoad.templates);
    setTemplateStorageMessage(templateLoad.message);
    const demoLoad = loadDemoMetadata();
    setActiveDemo(historyLoad.data.length > 0 ? demoLoad.metadata : null);
    setDemoStorageWarning([
      demoLoad.message,
      demoLoad.metadata && historyLoad.data.length === 0 ? "Demo metadata was ignored because no readable demo workout history is present." : "",
    ].filter(Boolean).join(" "));
    const activeDraftLoad = loadActiveWorkoutDraft();
    setRecoverableActiveDraft(activeDraftLoad.draft);
    setActiveDraftLoadStatus(activeDraftLoad.status);
    setActiveDraftLoadMessage(activeDraftLoad.message);
    lastPersistedActiveDraftRef.current = activeDraftLoad.rawValue;
    unsafeStorageKeysRef.current = new Set([
      ...(historyLoad.status === "unavailable" || historyLoad.status === "recovery-failed" ? [WORKOUT_DATA_KEYS[0]] : []),
      ...(previousLoad.status === "unavailable" || previousLoad.status === "recovery-failed" ? [WORKOUT_DATA_KEYS[1]] : []),
      ...(settingsLoad.status === "unavailable" || settingsLoad.status === "recovery-failed" ? [APP_SETTINGS_KEY] : []),
      ...(customExerciseLoad.status === "unavailable" || customExerciseLoad.status === "recovery-failed" ? [CUSTOM_EXERCISES_KEY] : []),
      ...(templateLoad.status === "unavailable" || templateLoad.status === "recovery-failed" ? [WORKOUT_TEMPLATES_KEY] : []),
      ...(demoLoad.status === "unavailable" || demoLoad.status === "recovery-failed" ? [DEMO_METADATA_KEY] : []),
      ...(activeDraftLoad.status === "unavailable" || activeDraftLoad.status === "corrupt" || activeDraftLoad.status === "unsupported" ? [ACTIVE_WORKOUT_DRAFT_KEY] : []),
    ]);
    try {
      expectedRawValuesRef.current = readStorageSnapshot(ALL_APP_STORAGE_KEYS);
      storageSnapshotReadyRef.current = true;
    } catch {
      setCrossTabConflict("Overload could not establish a reliable device-storage snapshot. Reload before changing saved data.");
    }
  }, []);

  unsafeWorkRef.current = workoutStartedAt !== null || historyDraft !== null || templateDraft !== null ||
    customExerciseDraftOpen || settingsDraftOpen;

  useEffect(() => {
    function handleStorageChange(event: StorageEvent) {
      if (event.key !== null && !ALL_APP_STORAGE_KEYS.includes(event.key as (typeof ALL_APP_STORAGE_KEYS)[number])) return;
      if (unsafeWorkRef.current) {
        setCrossTabConflict("Overload data changed in another tab while you have unsaved work. Reload and discard this draft, or keep working locally without overwriting the other tab.");
        return;
      }

      const historyLoad = loadWorkoutHistoryResult();
      const previousLoad = loadPreviousSetsResult();
      const settingsLoad = loadAppSettings();
      const customLoad = loadCustomExercises();
      const demoLoad = loadDemoMetadata();
      const activeDraftLoad = loadActiveWorkoutDraft();
      setWorkoutHistory(historyLoad.data);
      setSavedPrevious(previousLoad.data);
      const templateLoad = loadWorkoutTemplatesResult();
      setWorkoutTemplates(templateLoad.templates);
      setTemplateStorageMessage(templateLoad.message);
      setCustomExercises(customLoad.exercises);
      setActiveDemo(historyLoad.data.length > 0 ? demoLoad.metadata : null);
      setDemoStorageWarning([
        demoLoad.message,
        demoLoad.metadata && historyLoad.data.length === 0 ? "Demo metadata was ignored because no readable demo workout history is present." : "",
      ].filter(Boolean).join(" "));
      setAppSettings(settingsLoad.settings);
      setRecoverableActiveDraft(activeDraftLoad.draft);
      setActiveDraftLoadStatus(activeDraftLoad.status);
      setActiveDraftLoadMessage(activeDraftLoad.message);
      lastPersistedActiveDraftRef.current = activeDraftLoad.rawValue;
      setHistoryLoadStatus(
        previousLoad.status === "unavailable" || previousLoad.status === "recovery-failed"
          ? previousLoad.status
          : historyLoad.status,
      );
      setHistoryLoadMessage([historyLoad.message, previousLoad.message].filter(Boolean).join(" "));
      setHistoryNeedsSanitisedSave((historyLoad.discardedItemCount ?? 0) > 0);
      setSettingsLoadError(settingsLoad.error);
      setCustomExerciseStorageError(customLoad.error);
      unsafeStorageKeysRef.current = new Set([
        ...(historyLoad.status === "unavailable" || historyLoad.status === "recovery-failed" ? [WORKOUT_DATA_KEYS[0]] : []),
        ...(previousLoad.status === "unavailable" || previousLoad.status === "recovery-failed" ? [WORKOUT_DATA_KEYS[1]] : []),
        ...(settingsLoad.status === "unavailable" || settingsLoad.status === "recovery-failed" ? [APP_SETTINGS_KEY] : []),
        ...(customLoad.status === "unavailable" || customLoad.status === "recovery-failed" ? [CUSTOM_EXERCISES_KEY] : []),
        ...(templateLoad.status === "unavailable" || templateLoad.status === "recovery-failed" ? [WORKOUT_TEMPLATES_KEY] : []),
        ...(demoLoad.status === "unavailable" || demoLoad.status === "recovery-failed" ? [DEMO_METADATA_KEY] : []),
        ...(activeDraftLoad.status === "unavailable" || activeDraftLoad.status === "corrupt" || activeDraftLoad.status === "unsupported" ? [ACTIVE_WORKOUT_DRAFT_KEY] : []),
      ]);
      setExpandedWorkoutIds([]);
      setHistoryActionMessage("Saved Overload data was reloaded after a change in another tab.");
      setHistoryActionError("");
      setCrossTabConflict("");
      try {
        expectedRawValuesRef.current = readStorageSnapshot(ALL_APP_STORAGE_KEYS);
        storageSnapshotReadyRef.current = true;
      } catch {
        setCrossTabConflict("The other-tab change was loaded, but Overload could not refresh its storage snapshot. Reload before changing saved data.");
      }
    }

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const exerciseLibrary = useMemo(() => combineExerciseLibrary(customExercises), [customExercises]);
  const exerciseLookup = useMemo(() => createExerciseLookup(exerciseLibrary), [exerciseLibrary]);

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
  const resolvedDisplayName = getResolvedDisplayName(appSettings);
  const displayInitials = getDisplayInitials(resolvedDisplayName);
  const activeWeightUnit = workoutInputUnit ?? appSettings.weightUnit;

  const liveDisplayVolume = loggedExercises.reduce(
    (total, exercise) =>
      total + exercise.sets.reduce((setTotal, set) => setTotal + completedSetVolume(set, activeWeightUnit), 0),
    0,
  );

  function expectedValuesFor(keys: readonly string[]) {
    return new Map(keys.map((key) => [key, expectedRawValuesRef.current.get(key) ?? null]));
  }

  function storageKeyStillExpected(key: string): boolean {
    if (!storageSnapshotReadyRef.current || unsafeStorageKeysRef.current.has(key)) return false;
    try {
      return window.localStorage.getItem(key) === (expectedRawValuesRef.current.get(key) ?? null);
    } catch {
      return false;
    }
  }

  function storageKeyCouldNotBeLoaded(key: string) {
    return !storageSnapshotReadyRef.current || unsafeStorageKeysRef.current.has(key);
  }

  function recordExpectedRawValues(values: ReadonlyMap<string, string | null>) {
    const next = new Map(expectedRawValuesRef.current);
    values.forEach((value, key) => next.set(key, value));
    expectedRawValuesRef.current = next;
    const unsafeKeys = new Set(unsafeStorageKeysRef.current);
    values.forEach((_, key) => unsafeKeys.delete(key));
    unsafeStorageKeysRef.current = unsafeKeys;
  }

  function workoutStorageIsSafe() {
    return storageSnapshotReadyRef.current && WORKOUT_AND_DEMO_DATA_KEYS.every((key) => !unsafeStorageKeysRef.current.has(key));
  }

  function historyMutationOptions(demoMetadataRaw: string | null = null) {
    return {
      expectedRawValues: expectedValuesFor(WORKOUT_AND_DEMO_DATA_KEYS),
      additionalChanges: new Map([[DEMO_METADATA_KEY, demoMetadataRaw]]),
    };
  }

  function captureExpectedKey(key: string) {
    try {
      recordExpectedRawValues(new Map([[key, window.localStorage.getItem(key)]]));
    } catch {
      setCrossTabConflict("The change was saved, but Overload could not refresh its storage snapshot. Reload before making another saved-data change.");
    }
  }

  function renderGlobalStatus() {
    return (
      <>
        {activeDemo && <div className="demo-data-pill" role="status">Demo data · {getDemoProfile(activeDemo.profileId).name}</div>}
        {crossTabConflict && (
          <aside className="cross-tab-conflict" role="alert">
            <strong>Another tab changed Overload data</strong>
            <p>{crossTabConflict}</p>
            <div>
              <button type="button" onClick={() => window.location.reload()}>Reload and discard local work</button>
              <button type="button" onClick={() => setCrossTabConflict("")}>Keep local draft</button>
            </div>
          </aside>
        )}
      </>
    );
  }

  function createLoggedExercise(exercise: Exercise): LoggedExercise {
    const previous = (savedPrevious[exercise.id] ?? []).map((set) => ({ ...set }));
    return { ...exercise, previous, sessionId: createExerciseSessionId(exercise.id), sets: [blankSet()] };
  }

  function loggedExerciseFromDraft(exercise: ActiveWorkoutDraftExercise): LoggedExercise {
    return {
      ...exercise,
      previous: (savedPrevious[exercise.id] ?? []).map((set) => ({ ...set })),
      sets: exercise.sets.map((set) => ({ ...set })),
    };
  }

  function resumeRecoveredWorkout() {
    if (!recoverableActiveDraft) return;
    setWorkoutName(recoverableActiveDraft.workoutName);
    setWorkoutStartedAt(recoverableActiveDraft.startedAt);
    setWorkoutInputUnit(recoverableActiveDraft.weightUnit);
    setLoggedExercises(recoverableActiveDraft.exercises.map(loggedExerciseFromDraft));
    setActiveSetErrors({});
    setActiveDraftStorageError("");
    setRecoverableActiveDraft(null);
    setCompletedMessage("");
    setWorkoutError("");
    setScreen("workout");
  }

  function discardStoredActiveDraft() {
    const result = removeActiveWorkoutDraft(lastPersistedActiveDraftRef.current);
    setPendingConfirmation(null);
    if (!result.ok) {
      setActiveDraftLoadMessage(result.message);
      if (result.conflict) setCrossTabConflict("The active workout draft changed in another tab and was not discarded.");
      return false;
    }
    lastPersistedActiveDraftRef.current = null;
    recordExpectedRawValues(new Map([[ACTIVE_WORKOUT_DRAFT_KEY, null]]));
    unsafeStorageKeysRef.current.delete(ACTIVE_WORKOUT_DRAFT_KEY);
    setRecoverableActiveDraft(null);
    setActiveDraftLoadStatus("missing");
    setActiveDraftLoadMessage("");
    return true;
  }

  function requestDiscardRecoveredDraft() {
    if (!recoverableActiveDraft) return;
    if (activeDraftHasEnteredData(recoverableActiveDraft)) setPendingConfirmation("discard-recovered-workout");
    else discardStoredActiveDraft();
  }

  function requestDiscardUnreadableDraft() {
    setPendingConfirmation("discard-unreadable-workout");
  }

  function openTemplateSelection() {
    if (recoverableActiveDraft) {
      setTemplateSelectionError("Resume or discard the saved workout draft before starting another workout.");
      return;
    }
    if (activeDraftLoadStatus === "unavailable" || activeDraftLoadStatus === "corrupt" || activeDraftLoadStatus === "unsupported") {
      setTemplateSelectionError("Resolve or discard the unreadable saved workout draft before starting another workout.");
      return;
    }
    setTemplateSelectionError("");
    setEmptyWorkoutName("");
    setScreen("templates");
  }

  function resetWorkoutExerciseFilters() {
    setWorkoutExerciseSearch("");
    setWorkoutMuscleFilter("");
    setWorkoutEquipmentFilter("");
  }

  function resetTemplateExerciseFilters() {
    setTemplateExerciseSearch("");
    setTemplateMuscleFilter("");
    setTemplateEquipmentFilter("");
  }

  function commitCustomExercises(nextExercises: CustomExercise[]): boolean {
    if (!storageKeyStillExpected(CUSTOM_EXERCISES_KEY)) {
      const couldNotLoad = storageKeyCouldNotBeLoaded(CUSTOM_EXERCISES_KEY);
      setCustomExerciseStorageError(couldNotLoad
        ? "Custom exercises could not be read reliably. Reload before saving this draft; your input is still here."
        : "Custom exercises changed in another tab. Reload before saving this draft; your input is still here.");
      if (!couldNotLoad) setCrossTabConflict("Custom exercises changed in another tab. This local draft has not overwritten them.");
      return false;
    }
    if (!saveCustomExercises(nextExercises)) {
      setCustomExerciseStorageError("Overload could not write custom exercises to device storage.");
      return false;
    }

    setCustomExercises(nextExercises);
    setCustomExerciseStorageError("");
    captureExpectedKey(CUSTOM_EXERCISES_KEY);
    return true;
  }

  function commitAppSettings(nextSettings: AppSettings): SettingsActionResult {
    const normalised = normaliseAppSettings(nextSettings);
    if (!normalised) return { ok: false, message: "Settings contain an invalid display name or weight unit." };
    if ((workoutStartedAt !== null || historyDraft !== null) && normalised.weightUnit !== appSettings.weightUnit) {
      return { ok: false, message: "Finish or cancel the active workout or historical edit before changing weight units." };
    }
    if (!storageKeyStillExpected(APP_SETTINGS_KEY)) {
      const couldNotLoad = storageKeyCouldNotBeLoaded(APP_SETTINGS_KEY);
      if (!couldNotLoad) setCrossTabConflict("Settings changed in another tab. This local draft has not overwritten them.");
      return { ok: false, message: couldNotLoad
        ? "Settings could not be read reliably. Reload before saving; your entered values are still available."
        : "Settings changed in another tab. Reload before saving; your entered values are still available." };
    }
    if (!saveAppSettings(normalised)) {
      return { ok: false, message: "Overload could not save settings on this device. Your entered values are still available." };
    }

    const unitChanged = normalised.weightUnit !== appSettings.weightUnit;
    setAppSettings(normalised);
    setSettingsLoadError("");
    captureExpectedKey(APP_SETTINGS_KEY);
    return {
      ok: true,
      message: unitChanged
        ? `Weight display changed to ${normalised.weightUnit === "kg" ? "kilograms" : "pounds"}. Stored workout data remains in kilograms.`
        : normalised.displayName
          ? `Display name saved as ${normalised.displayName}.`
          : "Display name cleared. Athlete will be used in the dashboard greeting.",
    };
  }

  function applyImportedWorkoutHistory(nextHistory: SavedWorkout[]): SettingsActionResult {
    if (workoutStartedAt !== null || historyDraft !== null || templateDraft !== null || customExerciseDraftOpen) {
      return { ok: false, message: "Finish or cancel all other active drafts before importing workout data." };
    }
    if (!workoutStorageIsSafe()) {
      return { ok: false, message: "Overload could not verify current device data. Reload before importing; the validated import is still available." };
    }

    const rebuiltPrevious = rebuildPreviousSetsFromHistory(nextHistory);
    const result = writeWorkoutDataWithRollback(nextHistory, rebuiltPrevious, historyMutationOptions());
    if (!result.ok) {
      if (result.conflict) setCrossTabConflict("Workout data changed in another tab. The validated import is still available and was not applied.");
      return { ok: false, message: result.message };
    }

    setWorkoutHistory(nextHistory);
    setSavedPrevious(rebuiltPrevious);
    setActiveDemo(null);
    recordExpectedRawValues(result.rawValues);
    setExpandedWorkoutIds([]);
    setCompletedMessage("");
    setHistoryLoadStatus("loaded");
    setHistoryLoadMessage("");
    setHistoryNeedsSanitisedSave(false);
    return {
      ok: true,
      message: `Workout history restored with ${nextHistory.length} ${nextHistory.length === 1 ? "workout" : "workouts"}. Previous-set comparisons were rebuilt.`,
    };
  }

  function clearWorkoutData(): SettingsActionResult {
    if (workoutStartedAt !== null || historyDraft !== null || templateDraft !== null || customExerciseDraftOpen || settingsDraftOpen) {
      return { ok: false, message: "Finish or cancel every active draft or pending import before clearing workout data." };
    }
    if (!workoutStorageIsSafe()) return { ok: false, message: "Overload could not verify current workout data. Reload before clearing anything." };

    const result = removeStorageKeysWithRollback(WORKOUT_AND_DEMO_DATA_KEYS, "Clear workout data", {
      expectedRawValues: expectedValuesFor(WORKOUT_AND_DEMO_DATA_KEYS),
    });
    if (!result.ok) {
      if (result.conflict) setCrossTabConflict("Workout data changed in another tab, so nothing was cleared.");
      return { ok: false, message: result.message };
    }
    recordExpectedRawValues(result.rawValues);
    setWorkoutHistory([]);
    setSavedPrevious({});
    setActiveDemo(null);
    setExpandedWorkoutIds([]);
    setCompletedMessage("");
    setHistoryLoadStatus("missing");
    setHistoryLoadMessage("");
    setHistoryNeedsSanitisedSave(false);
    return { ok: true, message: "Workout history, previous-set comparisons and demo metadata were cleared. Settings, templates and custom exercises were preserved." };
  }

  function activateDemoProfile(profileId: DemoProfileId): SettingsActionResult {
    if (workoutStartedAt !== null || historyDraft !== null || templateDraft !== null || customExerciseDraftOpen || settingsDraftOpen) {
      return { ok: false, message: "Finish or cancel every active workout, editor, form or import draft before loading demo data." };
    }
    if (!workoutStorageIsSafe()) {
      return { ok: false, message: "Overload could not verify current workout and demo data. Reload before loading a fictional profile." };
    }

    let aligned;
    let metadata: DemoMetadata;
    try {
      const activatedAt = new Date();
      aligned = alignDemoProfileToReferenceDate(getDemoProfile(profileId), activatedAt);
      metadata = { version: 1, profileId, activatedAt: activatedAt.toISOString() };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "The fictional profile could not be validated." };
    }

    const rebuiltPrevious = rebuildPreviousSetsFromHistory(aligned.data.workouts);
    const result = writeWorkoutDataWithRollback(
      aligned.data.workouts,
      rebuiltPrevious,
      historyMutationOptions(serialiseDemoMetadata(metadata)),
    );
    if (!result.ok) {
      if (result.conflict) setCrossTabConflict("Workout or demo data changed in another tab. The fictional profile was not loaded.");
      return { ok: false, message: result.message };
    }

    setWorkoutHistory(aligned.data.workouts);
    setSavedPrevious(rebuiltPrevious);
    setActiveDemo(metadata);
    setDemoStorageWarning("");
    recordExpectedRawValues(result.rawValues);
    setExpandedWorkoutIds([]);
    setCompletedMessage("");
    setHistoryLoadStatus("loaded");
    setHistoryLoadMessage("");
    setHistoryNeedsSanitisedSave(false);
    setScreen("progress");
    return {
      ok: true,
      message: `${aligned.profile.name} loaded with ${aligned.data.workoutCount} fictional workouts. Its featured exercise and estimated 1RM trend are selected.`,
    };
  }

  function exitDemoProfile(): SettingsActionResult {
    if (!activeDemo) return { ok: false, message: "No named demo profile is currently active." };
    if (workoutStartedAt !== null || historyDraft !== null || templateDraft !== null || customExerciseDraftOpen || settingsDraftOpen) {
      return { ok: false, message: "Finish or cancel every active draft before exiting demo mode." };
    }
    if (!workoutStorageIsSafe()) {
      return { ok: false, message: "Overload could not verify current workout and demo data. Reload before clearing the demo." };
    }

    const result = removeStorageKeysWithRollback(WORKOUT_AND_DEMO_DATA_KEYS, "Exit demo and clear demo workouts", {
      expectedRawValues: expectedValuesFor(WORKOUT_AND_DEMO_DATA_KEYS),
    });
    if (!result.ok) {
      if (result.conflict) setCrossTabConflict("Workout or demo data changed in another tab. The active demo was not cleared.");
      return { ok: false, message: result.message };
    }

    recordExpectedRawValues(result.rawValues);
    setWorkoutHistory([]);
    setSavedPrevious({});
    setActiveDemo(null);
    setDemoStorageWarning("");
    setExpandedWorkoutIds([]);
    setHistoryLoadStatus("missing");
    setHistoryLoadMessage("");
    setHistoryNeedsSanitisedSave(false);
    return { ok: true, message: "Demo workouts and rebuilt previous-set data were cleared. Settings, templates and custom exercises were preserved." };
  }

  function resetAllAppData(): SettingsActionResult {
    if (workoutStartedAt !== null || historyDraft !== null || templateDraft !== null || customExerciseDraftOpen || settingsDraftOpen) {
      return { ok: false, message: "Finish or cancel every active draft or pending import before resetting app data." };
    }
    if (!storageSnapshotReadyRef.current || unsafeStorageKeysRef.current.size > 0) return { ok: false, message: "Overload could not verify all current device data. Reload before resetting anything." };

    const result = removeStorageKeysWithRollback(ALL_APP_STORAGE_KEYS, "Reset all app data", {
      expectedRawValues: expectedValuesFor(ALL_APP_STORAGE_KEYS),
    });
    if (!result.ok) {
      if (result.conflict) setCrossTabConflict("Overload data changed in another tab, so nothing was reset.");
      return { ok: false, message: result.message };
    }
    recordExpectedRawValues(result.rawValues);

    setWorkoutHistory([]);
    setSavedPrevious({});
    setWorkoutTemplates(getDefaultTemplates());
    setCustomExercises([]);
    setAppSettings(getDefaultAppSettings());
    setActiveDemo(null);
    setRecoverableActiveDraft(null);
    setActiveDraftLoadStatus("missing");
    setActiveDraftLoadMessage("");
    setActiveDraftStorageError("");
    setWorkoutInputUnit(null);
    setActiveSetErrors({});
    lastPersistedActiveDraftRef.current = null;
    setDemoStorageWarning("");
    setExpandedWorkoutIds([]);
    setTemplateDraft(null);
    setEditingTemplateId(null);
    setTemplateError("");
    setTemplateSelectionError("");
    setTemplateStorageMessage("");
    setCustomExerciseStorageError("");
    setCustomExerciseDraftOpen(false);
    setSettingsDraftOpen(false);
    setHistoryDraft(null);
    setPendingConfirmation(null);
    setSettingsLoadError("");
    setCompletedMessage("");
    setHistoryLoadStatus("missing");
    setHistoryLoadMessage("");
    setHistoryNeedsSanitisedSave(false);
    return { ok: true, message: "All Overload data was reset. Source templates, built-in exercises and kilogram defaults are active." };
  }

  function beginWorkout(name: string, exerciseIds: string[]) {
    const trimmedName = name.trim();
    const nameError = validateWorkoutName(name);
    if (nameError) {
      setTemplateSelectionError(nameError);
      return;
    }
    const unavailableExerciseIds = exerciseIds.filter((exerciseId) => !getExerciseById(exerciseLookup, exerciseId));
    if (unavailableExerciseIds.length > 0) {
      setTemplateSelectionError(
        `This template contains ${unavailableExerciseIds.length} unavailable ${unavailableExerciseIds.length === 1 ? "exercise" : "exercises"}. Edit the template and remove every unavailable entry before starting.`,
      );
      return;
    }
    if (exerciseIds.length > WORKOUT_CSV_MAX_EXERCISES_PER_WORKOUT) {
      setTemplateSelectionError(`A workout can contain at most ${WORKOUT_CSV_MAX_EXERCISES_PER_WORKOUT} exercise occurrences so it remains exportable.`);
      return;
    }
    if (!storageKeyStillExpected(ACTIVE_WORKOUT_DRAFT_KEY)) {
      setTemplateSelectionError("Overload could not safely verify the saved active-workout draft. Reload before starting another workout.");
      return;
    }

    const exercises = exerciseIds.map((exerciseId) =>
      createLoggedExercise(getExerciseById(exerciseLookup, exerciseId)!),
    );
    const startedAt = Date.now();
    const draft: ActiveWorkoutDraft = {
      version: 1,
      workoutName: trimmedName,
      startedAt,
      weightUnit: appSettings.weightUnit,
      exercises: exercises.map((exercise) => ({
        id: exercise.id,
        sessionId: exercise.sessionId,
        name: exercise.name,
        muscle: exercise.muscle,
        equipment: exercise.equipment,
        kind: exercise.kind,
        sets: exercise.sets.map((set) => ({ ...set })),
      })),
    };
    const draftResult = saveActiveWorkoutDraft(draft, lastPersistedActiveDraftRef.current);
    if (!draftResult.ok) {
      setTemplateSelectionError(draftResult.message);
      if (draftResult.conflict) setCrossTabConflict("An active workout draft changed in another tab. A new workout was not started.");
      return;
    }
    lastPersistedActiveDraftRef.current = draftResult.rawValue;
    recordExpectedRawValues(new Map([[ACTIVE_WORKOUT_DRAFT_KEY, draftResult.rawValue]]));

    setTemplateSelectionError("");
    setWorkoutName(trimmedName);
    setWorkoutStartedAt(startedAt);
    setWorkoutInputUnit(appSettings.weightUnit);
    setSeconds(0);
    setLoggedExercises(exercises);
    setActiveSetErrors({});
    setActiveDraftStorageError("");
    setWorkoutError("");
    setCompletedMessage("");
    setScreen("workout");
  }

  function startEmptyWorkout() {
    const trimmedName = emptyWorkoutName.trim();
    const nameError = validateWorkoutName(emptyWorkoutName);
    if (nameError) {
      setTemplateSelectionError(nameError);
      return;
    }

    setTemplateSelectionError("");
    beginWorkout(trimmedName, []);
  }

  function addExerciseToWorkout(exercise: Exercise) {
    if (loggedExercises.length >= WORKOUT_CSV_MAX_EXERCISES_PER_WORKOUT) {
      setWorkoutError(`A workout can contain at most ${WORKOUT_CSV_MAX_EXERCISES_PER_WORKOUT} exercise occurrences so it remains exportable.`);
      setShowWorkoutPicker(false);
      return;
    }
    setLoggedExercises((current) => [...current, createLoggedExercise(exercise)]);
    setWorkoutError("");
    setShowWorkoutPicker(false);
    resetWorkoutExerciseFilters();
  }

  function openCreateTemplate() {
    let templateId = createTemplateId();
    while (workoutTemplates.some((template) => template.id === templateId)) {
      templateId = createTemplateId();
    }

    setEditingTemplateId(null);
    setTemplateDraft({ id: templateId, name: "", exerciseIds: [], kind: "custom" });
    setTemplateError("");
    resetTemplateExerciseFilters();
    setShowTemplatePicker(false);
    setScreen("template-editor");
  }

  function openEditTemplate(template: WorkoutTemplate) {
    setEditingTemplateId(template.id);
    setTemplateDraft({ ...template, exerciseIds: [...template.exerciseIds] });
    setTemplateError("");
    resetTemplateExerciseFilters();
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
    resetTemplateExerciseFilters();
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
    const nameValidationError = validateTemplateName(templateDraft.name);

    if (nameValidationError) {
      setTemplateError(nameValidationError);
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
    if (templateDraft.exerciseIds.some((exerciseId) => !getExerciseById(exerciseLookup, exerciseId))) {
      setTemplateError("Remove every unavailable exercise before saving this template.");
      return;
    }

    const savedTemplate = { ...templateDraft, name: trimmedName, exerciseIds: [...templateDraft.exerciseIds] };
    const nextTemplates = editingTemplateId === null
      ? [...workoutTemplates, savedTemplate]
      : workoutTemplates.map((template) => template.id === editingTemplateId ? savedTemplate : template);

    if (!storageKeyStillExpected(WORKOUT_TEMPLATES_KEY)) {
      const couldNotLoad = storageKeyCouldNotBeLoaded(WORKOUT_TEMPLATES_KEY);
      if (!couldNotLoad) setCrossTabConflict("Templates changed in another tab. This local template draft has not overwritten them.");
      setTemplateError(couldNotLoad
        ? "Templates could not be read reliably. Reload before saving; your complete draft is still here."
        : "Templates changed in another tab. Reload before saving; your complete draft is still here.");
      return;
    }
    if (!saveWorkoutTemplates(nextTemplates)) {
      setTemplateError("Overload could not save this template on your device. Your unsaved edits are still here.");
      return;
    }

    setWorkoutTemplates(nextTemplates);
    setTemplateStorageMessage("");
    captureExpectedKey(WORKOUT_TEMPLATES_KEY);
    setTemplateDraft(null);
    setEditingTemplateId(null);
    setTemplateError("");
    setScreen("templates");
  }

  function resetBuiltInTemplate() {
    if (!templateDraft || templateDraft.kind !== "built-in") return;
    const defaultTemplate = getDefaultTemplate(templateDraft.id);
    if (!defaultTemplate) return;
    const nextTemplates = workoutTemplates.map((template) =>
      template.id === defaultTemplate.id ? defaultTemplate : template,
    );
    if (!storageKeyStillExpected(WORKOUT_TEMPLATES_KEY)) {
      const couldNotLoad = storageKeyCouldNotBeLoaded(WORKOUT_TEMPLATES_KEY);
      if (!couldNotLoad) setCrossTabConflict("Templates changed in another tab. The built-in template was not reset.");
      setTemplateError(couldNotLoad
        ? "Templates could not be read reliably. Reload before resetting; your current edits are still here."
        : "Templates changed in another tab. Reload before resetting; your current edits are still here.");
      setPendingConfirmation(null);
      return;
    }
    if (!saveWorkoutTemplates(nextTemplates)) {
      setTemplateError("Overload could not reset this template. Your current edits are still here.");
      setPendingConfirmation(null);
      return;
    }

    setWorkoutTemplates(nextTemplates);
    setTemplateStorageMessage("");
    captureExpectedKey(WORKOUT_TEMPLATES_KEY);
    setTemplateDraft({ ...defaultTemplate, exerciseIds: [...defaultTemplate.exerciseIds] });
    setTemplateError("");
    setPendingConfirmation(null);
  }

  function deleteCustomTemplate() {
    if (!templateDraft || templateDraft.kind !== "custom" || editingTemplateId === null) return;
    const nextTemplates = workoutTemplates.filter((template) => template.id !== editingTemplateId);
    if (!storageKeyStillExpected(WORKOUT_TEMPLATES_KEY)) {
      const couldNotLoad = storageKeyCouldNotBeLoaded(WORKOUT_TEMPLATES_KEY);
      if (!couldNotLoad) setCrossTabConflict("Templates changed in another tab. This custom template was not deleted.");
      setTemplateError(couldNotLoad
        ? "Templates could not be read reliably. Reload before deleting; the template and draft are unchanged."
        : "Templates changed in another tab. Reload before deleting; the template and draft are unchanged.");
      setPendingConfirmation(null);
      return;
    }
    if (!saveWorkoutTemplates(nextTemplates)) {
      setTemplateError("Overload could not delete this template. The template and your edits are unchanged.");
      setPendingConfirmation(null);
      return;
    }

    setWorkoutTemplates(nextTemplates);
    setTemplateStorageMessage("");
    captureExpectedKey(WORKOUT_TEMPLATES_KEY);
    setTemplateDraft(null);
    setEditingTemplateId(null);
    setTemplateError("");
    setScreen("templates");
    setPendingConfirmation(null);
  }

  function discardTemplateDraft() {
    setTemplateDraft(null);
    setEditingTemplateId(null);
    setTemplateError("");
    setShowTemplatePicker(false);
    setPendingConfirmation(null);
    setScreen("templates");
  }

  function updateSet(sessionId: string, setIndex: number, field: SetFieldName | "complete", value: string | boolean) {
    setWorkoutError("");
    const currentSet = loggedExercises.find((exercise) => exercise.sessionId === sessionId)?.sets[setIndex];
    if (!currentSet) return;
    const updatedSet = { ...currentSet, [field]: value } as SetEntry;
    const validation = validateEditableSet(updatedSet, workoutInputUnit ?? appSettings.weightUnit);
    setActiveSetErrors((errors) => {
      const next = { ...errors };
      if (hasSetFieldErrors(validation.errors)) next[currentSet.id] = validation.errors;
      else delete next[currentSet.id];
      return next;
    });
    setLoggedExercises((current) =>
      current.map((exercise) =>
        exercise.sessionId !== sessionId
          ? exercise
          : {
              ...exercise,
              sets: exercise.sets.map((set, index) => index === setIndex ? updatedSet : set),
            },
      ),
    );
  }

  function performSetRemoval(sessionId: string, setId: string) {
    setLoggedExercises((current) => removeDraftSet(current, sessionId, setId) as LoggedExercise[]);
    setActiveSetErrors((current) => {
      const next = { ...current };
      delete next[setId];
      return next;
    });
    setActiveRemovalTarget(null);
    setWorkoutError("");
  }

  function requestSetRemoval(exercise: LoggedExercise, set: SetEntry, setIndex: number) {
    if (exercise.sets.length <= 1) return;
    if (!setHasEnteredData(set)) {
      performSetRemoval(exercise.sessionId, set.id);
      return;
    }
    setActiveRemovalTarget({
      type: "set",
      sessionId: exercise.sessionId,
      setId: set.id,
      exerciseName: exercise.name,
      setNumber: setIndex + 1,
    });
  }

  function performExerciseRemoval(sessionId: string) {
    const removedSetIds = loggedExercises.find((exercise) => exercise.sessionId === sessionId)?.sets.map((set) => set.id) ?? [];
    setLoggedExercises((current) => removeDraftExercise(current, sessionId) as LoggedExercise[]);
    setActiveSetErrors((current) => {
      const next = { ...current };
      removedSetIds.forEach((setId) => delete next[setId]);
      return next;
    });
    setActiveRemovalTarget(null);
    setWorkoutError("");
  }

  function requestExerciseRemoval(exercise: LoggedExercise) {
    const hasMoreThanInitialBlankState = exercise.sets.length > 1 || exercise.sets.some(setHasEnteredData);
    if (!hasMoreThanInitialBlankState) {
      performExerciseRemoval(exercise.sessionId);
      return;
    }
    setActiveRemovalTarget({ type: "exercise", sessionId: exercise.sessionId, exerciseName: exercise.name });
  }

  function addSetToExercise(exercise: LoggedExercise) {
    if (exercise.sets.length >= WORKOUT_CSV_MAX_SETS_PER_EXERCISE) {
      setWorkoutError(`${exercise.name} can contain at most ${WORKOUT_CSV_MAX_SETS_PER_EXERCISE} sets so the workout remains exportable.`);
      return;
    }
    setLoggedExercises((current) => current.map((item) => item.sessionId === exercise.sessionId
      ? { ...item, sets: [...item.sets, blankSet()] }
      : item));
    setWorkoutError("");
  }

  function hasMeaningfulWorkoutData() {
    return loggedExercises.length > 0 || loggedExercises.some((exercise) => exercise.sets.some(setHasEnteredData));
  }

  function cancelWorkout() {
    const removal = removeActiveWorkoutDraft(lastPersistedActiveDraftRef.current);
    if (!removal.ok) {
      setPendingConfirmation(null);
      setWorkoutError(`${removal.message} The workout remains open.`);
      if (removal.conflict) setCrossTabConflict("The saved active workout changed in another tab. This local workout remains open.");
      return;
    }
    lastPersistedActiveDraftRef.current = null;
    recordExpectedRawValues(new Map([[ACTIVE_WORKOUT_DRAFT_KEY, null]]));
    setLoggedExercises([]);
    setWorkoutName("");
    setWorkoutStartedAt(null);
    setWorkoutInputUnit(null);
    setActiveSetErrors({});
    setActiveDraftStorageError("");
    setSeconds(0);
    setShowWorkoutPicker(false);
    resetWorkoutExerciseFilters();
    setWorkoutError("");
    setPendingConfirmation(null);
    setScreen("home");
  }

  function requestCancelWorkout() {
    setWorkoutError("");
    if (hasMeaningfulWorkoutData()) setPendingConfirmation("cancel-workout");
    else cancelWorkout();
  }

  function finishWorkout() {
    setWorkoutError("");
    if (!workoutStorageIsSafe()) {
      setWorkoutError("Overload could not verify current device data. Your workout is still open; reload only after preserving the values you need.");
      return;
    }
    const workoutNameError = validateWorkoutName(workoutName);
    if (workoutNameError) {
      setWorkoutError(workoutNameError);
      return;
    }
    const inputUnit = workoutInputUnit ?? appSettings.weightUnit;
    const validatedSets = loggedExercises.flatMap((exercise) => exercise.sets.map((set) => ({
      set,
      result: validateEditableSet(set, inputUnit),
      sessionId: exercise.sessionId,
    })));
    const nextErrors: Record<string, SetFieldErrors> = {};
    let firstInvalidFieldId = "";
    let invalidFieldCount = 0;
    validatedSets.forEach(({ set, result, sessionId }) => {
      if (!hasSetFieldErrors(result.errors)) return;
      nextErrors[set.id] = result.errors;
      (["weight", "reps", "rpe"] as SetFieldName[]).forEach((field) => {
        if (!result.errors[field]) return;
        invalidFieldCount += 1;
        if (!firstInvalidFieldId) firstInvalidFieldId = activeFieldId(sessionId, set.id, field);
      });
    });
    setActiveSetErrors(nextErrors);
    if (invalidFieldCount > 0) {
      setWorkoutError(`Correct ${invalidFieldCount} invalid ${invalidFieldCount === 1 ? "field" : "fields"} before finishing. Your entered values are unchanged.`);
      window.requestAnimationFrame(() => document.getElementById(firstInvalidFieldId)?.focus());
      return;
    }
    const completedSets = validatedSets.filter(({ result }) => result.canonicalSet?.complete);
    if (completedSets.length === 0) {
      setWorkoutError("Complete at least one set with a valid weight and more than zero repetitions before finishing.");
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
      sets: exercise.sets.map((set) => toSavedSet(set, inputUnit)),
    }));
    const savedSummary = calculateSavedWorkoutSummary(savedExercises);
    const savedWorkout: SavedWorkout = {
      id: createWorkoutId(),
      name: workoutName,
      startedAt: new Date(workoutStartedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      durationSeconds: Math.max(0, Math.floor((finishedAt - workoutStartedAt) / 1000)),
      exercises: savedExercises,
      ...savedSummary,
    };
    const nextHistory = [savedWorkout, ...workoutHistory].sort(
      (first, second) => Date.parse(second.startedAt) - Date.parse(first.startedAt),
    );

    const newPrevious = rebuildPreviousSetsFromHistory(nextHistory);

    const finishKeys = [...WORKOUT_AND_DEMO_DATA_KEYS, ACTIVE_WORKOUT_DRAFT_KEY];
    const storageResult = writeWorkoutDataWithRollback(nextHistory, newPrevious, {
      expectedRawValues: expectedValuesFor(finishKeys),
      additionalChanges: new Map([
        [DEMO_METADATA_KEY, null],
        [ACTIVE_WORKOUT_DRAFT_KEY, null],
      ]),
    });
    if (!storageResult.ok) {
      if (storageResult.conflict) setCrossTabConflict("Workout data changed in another tab. Your active workout is still open and has not overwritten it.");
      setWorkoutError(`${storageResult.message} Your workout is still open, so please try again.`);
      return;
    }

    setWorkoutHistory(nextHistory);
    setSavedPrevious(newPrevious);
    setActiveDemo(null);
    recordExpectedRawValues(storageResult.rawValues);
    lastPersistedActiveDraftRef.current = null;
    setHistoryLoadStatus("loaded");
    setHistoryLoadMessage("");
    setHistoryNeedsSanitisedSave(false);
    setCompletedMessage(`Workout saved · ${savedExercises.length} exercises · ${formatVolumeFromKilograms(savedSummary.totalVolume, appSettings.weightUnit)}`);
    setLoggedExercises([]);
    setWorkoutName("");
    setWorkoutStartedAt(null);
    setWorkoutInputUnit(null);
    setActiveSetErrors({});
    setActiveDraftStorageError("");
    setSeconds(0);
    setWorkoutError("");
    setScreen("home");
  }

  function toggleWorkoutExpanded(workoutId: string) {
    setExpandedWorkoutIds((current) =>
      current.includes(workoutId) ? current.filter((id) => id !== workoutId) : [...current, workoutId],
    );
  }

  function clearHistoryNotices() {
    setHistoryActionMessage("");
    setHistoryActionError("");
  }

  function openHistoryEditor(workout: SavedWorkout) {
    clearHistoryNotices();
    setHistoryDraft(workout);
    setHistoryDraftUnit(appSettings.weightUnit);
    setScreen("history-editor");
  }

  function saveHistoricalWorkout(editedWorkout: SavedWorkout) {
    clearHistoryNotices();
    if (!workoutStorageIsSafe()) return { ok: false as const, message: "Overload could not verify current workout data. Reload before saving; this draft remains open." };
    let nextHistory: SavedWorkout[];
    try {
      nextHistory = replaceWorkoutInHistory(workoutHistory, editedWorkout);
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : "This workout could not be edited safely." };
    }
    const rebuiltPrevious = rebuildPreviousSetsFromHistory(nextHistory);
    const result = writeWorkoutDataWithRollback(nextHistory, rebuiltPrevious, historyMutationOptions());
    if (!result.ok) {
      if (result.conflict) setCrossTabConflict("Workout data changed in another tab. Your historical draft remains open and has not overwritten it.");
      return { ok: false as const, message: result.message };
    }

    setWorkoutHistory(nextHistory);
    setSavedPrevious(rebuiltPrevious);
    setActiveDemo(null);
    recordExpectedRawValues(result.rawValues);
    setHistoryDraft(null);
    setHistoryLoadStatus("loaded");
    setHistoryLoadMessage("");
    setHistoryNeedsSanitisedSave(false);
    setHistoryActionMessage(`“${editedWorkout.name}” was updated. Dashboard, Progress and previous-set comparisons were recalculated.`);
    setScreen("history");
    return { ok: true as const, message: "Workout updated." };
  }

  function deleteHistoricalWorkout(workoutId: string) {
    clearHistoryNotices();
    if (!workoutStorageIsSafe()) {
      const message = "Overload could not verify current device data. Reload before deleting anything.";
      setHistoryActionError(message);
      return { ok: false as const, message };
    }
    let nextHistory: SavedWorkout[];
    try {
      nextHistory = deleteWorkoutFromHistory(workoutHistory, workoutId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "This workout could not be deleted safely.";
      setHistoryActionError(message);
      return { ok: false as const, message };
    }
    const rebuiltPrevious = rebuildPreviousSetsFromHistory(nextHistory);
    const result = writeWorkoutDataWithRollback(nextHistory, rebuiltPrevious, historyMutationOptions());
    if (!result.ok) {
      if (result.conflict) setCrossTabConflict("Workout data changed in another tab. The selected workout was not deleted.");
      setHistoryActionError(result.message);
      return { ok: false as const, message: result.message };
    }

    setWorkoutHistory(nextHistory);
    setSavedPrevious(rebuiltPrevious);
    setActiveDemo(null);
    recordExpectedRawValues(result.rawValues);
    setExpandedWorkoutIds((current) => current.filter((id) => id !== workoutId));
    setHistoryLoadStatus("loaded");
    setHistoryLoadMessage("");
    setHistoryNeedsSanitisedSave(false);
    setHistoryActionMessage("Workout deleted. Dashboard, Progress and previous-set comparisons were recalculated.");
    return { ok: true as const, message: "Workout deleted." };
  }

  if (workoutStartedAt === null && recoverableActiveDraft) {
    return (
      <main className="welcome-shell recovery-shell">
        {pendingConfirmation !== "discard-recovered-workout" && (
          <ActiveWorkoutRecoveryDialog
            draft={recoverableActiveDraft}
            onResume={resumeRecoveredWorkout}
            onDiscard={requestDiscardRecoveredDraft}
          />
        )}
        <ConfirmDialog
          open={pendingConfirmation === "discard-recovered-workout"}
          title="Discard saved workout draft?"
          description={`Discard ${recoverableActiveDraft.workoutName} and all of its unsaved entered or completed sets? Saved History will not change.`}
          confirmLabel="Discard workout draft"
          destructive
          onCancel={() => setPendingConfirmation(null)}
          onConfirm={discardStoredActiveDraft}
        />
      </main>
    );
  }

  if (workoutStartedAt === null && (activeDraftLoadStatus === "corrupt" || activeDraftLoadStatus === "unsupported" || activeDraftLoadStatus === "unavailable")) {
    return (
      <main className="welcome-shell recovery-shell">
        <section className="welcome-card unreadable-draft-card" aria-labelledby="unreadable-draft-title">
          <div className="brand-lockup"><BrandLogo /><span>OVERLOAD</span></div>
          <div className="welcome-copy">
            <p className="eyebrow">Workout recovery</p>
            <h1 id="unreadable-draft-title">Saved draft needs attention.</h1>
            <p role="alert">{activeDraftLoadMessage}</p>
          </div>
          {activeDraftLoadStatus === "unavailable" ? (
            <button className="primary-button" type="button" onClick={() => window.location.reload()}>Retry storage access</button>
          ) : (
            <button className="primary-button" type="button" onClick={requestDiscardUnreadableDraft}>Discard unreadable draft</button>
          )}
        </section>
        <ConfirmDialog
          open={pendingConfirmation === "discard-unreadable-workout"}
          title="Discard unreadable workout draft?"
          description="The saved draft cannot be safely restored. Discard only this active-workout draft so a new workout can be started. Saved History and other Overload data will not change."
          confirmLabel="Discard unreadable draft"
          destructive
          onCancel={() => setPendingConfirmation(null)}
          onConfirm={discardStoredActiveDraft}
        />
      </main>
    );
  }

  if (screen === "welcome") {
    return (
      <main className="welcome-shell">
        {renderGlobalStatus()}
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />
        <section className="welcome-card" aria-labelledby="welcome-title">
          <div className="brand-lockup"><BrandLogo /><span>OVERLOAD</span></div>
          <div className="welcome-copy">
            <p className="eyebrow">Training, understood.</p>
            <h1 id="welcome-title">Your next set starts here.</h1>
            <p>Log every lift, understand your progress and turn training data into smarter sessions.</p>
          </div>
          <button className="primary-button enter-button" onClick={() => setScreen("home")}>
            Enter Overload <span aria-hidden="true">→</span>
          </button>
          <p className="prototype-note">Early access · Your data stays on this device</p>
        </section>
      </main>
    );
  }

  if (screen === "templates") {
    return (
      <main className="app-shell">
        {renderGlobalStatus()}
        <div className="phone-layout template-layout">
          <header className="history-header">
            <button className="text-button history-back-button" onClick={() => setScreen("home")}>
              <span aria-hidden="true">←</span> Home
            </button>
            <div className="brand-lockup compact"><BrandLogo size="compact" /><span>OVERLOAD</span></div>
          </header>

          <section className="template-intro" aria-labelledby="template-selection-title">
            <p className="eyebrow">Start workout</p>
            <h1 id="template-selection-title">Choose your session.</h1>
            <p>The timer starts only after you choose a template or name an empty workout.</p>
          </section>

          {templateSelectionError && <p className="template-error template-selection-error" role="alert">{templateSelectionError}</p>}
          {templateStorageMessage && <p className="template-error template-selection-error" role="alert">{templateStorageMessage}</p>}

          <section className="template-section" aria-labelledby="saved-templates-title">
            <div className="template-section-heading template-management-heading">
              <div><p className="eyebrow">Reusable workouts</p><h2 id="saved-templates-title">Templates</h2></div>
              <div className="template-heading-actions">
                <button className="compact-action-button" onClick={() => setScreen("exercise-manager")}>Manage exercises</button>
                <button className="compact-action-button" onClick={openCreateTemplate}>Create template</button>
              </div>
            </div>

            <div className="template-grid">
              {workoutTemplates.map((template) => {
                const unavailableCount = template.exerciseIds.filter((exerciseId) => !getExerciseById(exerciseLookup, exerciseId)).length;
                return (
                  <article className="template-card" key={template.id}>
                    <header>
                      <span className="template-kind">{template.kind === "built-in" ? "Built-in" : "Custom"}</span>
                      <h3>{template.name}</h3>
                      <p>{template.exerciseIds.length} {pluralise(template.exerciseIds.length, "exercise")}</p>
                    </header>
                    <ol className="template-preview-list">
                      {template.exerciseIds.map((exerciseId) => {
                        const exercise = getExerciseById(exerciseLookup, exerciseId);
                        return (
                          <li className={exercise ? undefined : "unavailable-exercise"} key={exerciseId}>
                            {exercise?.name ?? "Unavailable exercise"}
                          </li>
                        );
                      })}
                    </ol>
                    {unavailableCount > 0 && (
                      <p className="template-availability-warning" role="status">
                        Remove {unavailableCount} unavailable {pluralise(unavailableCount, "exercise")} before starting.
                      </p>
                    )}
                    <div className="template-card-actions">
                      <button className="primary-button template-start-button" onClick={() => beginWorkout(template.name, template.exerciseIds)}>
                        Start {template.name}
                      </button>
                      <button className="template-edit-button" onClick={() => openEditTemplate(template)}>Edit template</button>
                    </div>
                  </article>
                );
              })}
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
                maxLength={101}
                onChange={(event) => {
                  setEmptyWorkoutName(event.target.value);
                  setTemplateSelectionError("");
                }}
                placeholder="e.g. Full body"
              />
            </label>
            <button className="primary-button empty-workout-start" onClick={startEmptyWorkout}>Start empty workout</button>
          </section>
        </div>
      </main>
    );
  }

  if (screen === "exercise-manager") {
    return (
      <>
        {renderGlobalStatus()}
        <ExerciseManager
          exercises={exerciseLibrary}
          customExercises={customExercises}
          workoutTemplates={workoutTemplates}
          storageError={customExerciseStorageError}
          onCommit={commitCustomExercises}
          onBack={() => setScreen("templates")}
          onDraftStateChange={setCustomExerciseDraftOpen}
        />
      </>
    );
  }

  if (screen === "template-editor" && templateDraft) {
    const isExistingCustomTemplate = templateDraft.kind === "custom" && editingTemplateId !== null;

    return (
      <main className="app-shell">
        {renderGlobalStatus()}
        <div className="phone-layout template-layout">
          <header className="history-header">
            <button
              className="text-button history-back-button"
              onClick={() => setPendingConfirmation("discard-template")}
            >
              <span aria-hidden="true">←</span> Templates
            </button>
            <div className="brand-lockup compact"><BrandLogo size="compact" /><span>OVERLOAD</span></div>
          </header>

          <section className="template-intro compact-intro">
            <p className="eyebrow">{editingTemplateId === null ? "New template" : "Edit template"}</p>
            <h1>{editingTemplateId === null ? "Build a template." : `Edit ${templateDraft.name || "template"}.`}</h1>
            <p>Names and exercise order are copied into new workouts. Active workouts remain independent.</p>
          </section>

          <form className="template-editor" onSubmit={(event) => { event.preventDefault(); saveTemplateDraft(); }}>
            <label className="template-name-field">
              <span>Template name</span>
              <input value={templateDraft.name} maxLength={101} onChange={(event) => updateTemplateName(event.target.value)} placeholder="e.g. Push day" />
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
                    const exercise = getExerciseById(exerciseLookup, exerciseId);
                    const displayName = exercise?.name ?? "Unavailable exercise";

                    return (
                      <li className={exercise ? undefined : "unavailable-exercise"} key={exerciseId}>
                        <span className="template-order-number">{index + 1}</span>
                        <span className="template-exercise-name">
                          <strong>{displayName}</strong>
                          <small>{exercise ? `${exercise.muscle} · ${exercise.equipment}` : `Missing ID: ${exerciseId}`}</small>
                        </span>
                        <span className="template-order-actions">
                          <button type="button" disabled={index === 0} onClick={() => moveTemplateExercise(index, -1)} aria-label={`Move ${displayName} up`}>Move up</button>
                          <button type="button" disabled={index === templateDraft.exerciseIds.length - 1} onClick={() => moveTemplateExercise(index, 1)} aria-label={`Move ${displayName} down`}>Move down</button>
                          <button type="button" className="remove-template-exercise" onClick={() => removeExerciseFromTemplate(exerciseId)} aria-label={`Remove ${displayName}`}>Remove</button>
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
                  resetTemplateExerciseFilters();
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
                onClick={() => setPendingConfirmation("discard-template")}
              >Cancel</button>
            </div>

            {templateDraft.kind === "built-in" && (
              <button className="template-destructive-button" type="button" onClick={() => { setTemplateError(""); setPendingConfirmation("reset-template"); }}>Reset to default</button>
            )}
            {isExistingCustomTemplate && (
              <button className="template-destructive-button" type="button" onClick={() => { setTemplateError(""); setPendingConfirmation("delete-template"); }}>Delete template</button>
            )}
          </form>
        </div>

        {showTemplatePicker && (
          <ExercisePicker
            title="Add to template"
            exercises={exerciseLibrary}
            search={templateExerciseSearch}
            muscleFilter={templateMuscleFilter}
            equipmentFilter={templateEquipmentFilter}
            selectedExerciseIds={templateDraft.exerciseIds}
            onSearchChange={setTemplateExerciseSearch}
            onMuscleFilterChange={setTemplateMuscleFilter}
            onEquipmentFilterChange={setTemplateEquipmentFilter}
            onResetFilters={resetTemplateExerciseFilters}
            onSelect={addExerciseToTemplateDraft}
            onClose={() => {
              setShowTemplatePicker(false);
              resetTemplateExerciseFilters();
            }}
          />
        )}
        <ConfirmDialog
          open={pendingConfirmation === "discard-template"}
          title="Discard template draft?"
          description="Your unsaved template name, exercises and order will be discarded. The saved template will remain unchanged."
          confirmLabel="Discard draft"
          destructive
          onCancel={() => setPendingConfirmation(null)}
          onConfirm={discardTemplateDraft}
        />
        <ConfirmDialog
          open={pendingConfirmation === "reset-template"}
          title="Reset built-in template?"
          description={`Restore ${templateDraft.name || "this template"} to its original source name and exercise order? Your local template edits will be replaced.`}
          confirmLabel="Reset to default"
          destructive
          onCancel={() => setPendingConfirmation(null)}
          onConfirm={resetBuiltInTemplate}
        />
        <ConfirmDialog
          open={pendingConfirmation === "delete-template"}
          title="Delete custom template?"
          description={`Delete ${templateDraft.name || "this custom template"}? This cannot be undone.`}
          confirmLabel="Delete template"
          destructive
          onCancel={() => setPendingConfirmation(null)}
          onConfirm={deleteCustomTemplate}
        />
      </main>
    );
  }

  if (screen === "history-editor" && historyDraft) {
    return (
      <>
        {renderGlobalStatus()}
        <HistoricalWorkoutEditor
          key={historyDraft.id}
          workout={historyDraft}
          weightUnit={historyDraftUnit}
          recoveredHistoryWillBeSaved={historyNeedsSanitisedSave}
          onSave={saveHistoricalWorkout}
          onCancel={() => { setHistoryDraft(null); setScreen("history"); }}
        />
      </>
    );
  }

  if (screen === "history") {
    return (
      <>
        {renderGlobalStatus()}
        <HistoryScreen
          history={workoutHistory}
          weightUnit={appSettings.weightUnit}
          expandedWorkoutIds={expandedWorkoutIds}
          loadStatus={historyLoadStatus}
          loadMessage={historyLoadMessage}
          actionMessage={historyActionMessage}
          actionError={historyActionError}
          recoveredHistoryWillBeSaved={historyNeedsSanitisedSave}
          onToggleExpanded={toggleWorkoutExpanded}
          onEdit={openHistoryEditor}
          onDelete={deleteHistoricalWorkout}
          onClearNotices={clearHistoryNotices}
          onNavigateHome={() => setScreen("home")}
          onNavigateProgress={() => setScreen("progress")}
          onNavigateSettings={() => setScreen("settings")}
        />
      </>
    );
  }

  if (screen === "progress") {
    return (
      <ProgressScreen
        workoutHistory={workoutHistory}
        exerciseLibrary={exerciseLibrary}
        weightUnit={appSettings.weightUnit}
        storageWarning={historyLoadStatus === "unavailable" || historyLoadStatus === "recovery-failed" ? historyLoadMessage : ""}
        activeDemo={activeDemo}
        demoStorageWarning={demoStorageWarning}
        onActivateDemo={activateDemoProfile}
        onExitDemo={exitDemoProfile}
        onNavigateHome={() => setScreen("home")}
        onNavigateHistory={() => setScreen("history")}
        onNavigateSettings={() => setScreen("settings")}
      />
    );
  }

  if (screen === "settings") {
    return (
      <>
        {renderGlobalStatus()}
        <SettingsScreen
          settings={appSettings}
          workoutHistory={workoutHistory}
          settingsLoadError={settingsLoadError}
          historyRecoveryWarning={historyNeedsSanitisedSave ? historyLoadMessage : ""}
          hasActiveWorkout={workoutStartedAt !== null || historyDraft !== null || templateDraft !== null || customExerciseDraftOpen}
          onSaveSettings={commitAppSettings}
          onApplyWorkoutHistory={applyImportedWorkoutHistory}
          onClearWorkoutData={clearWorkoutData}
          onResetAllData={resetAllAppData}
          onNavigateHome={() => setScreen("home")}
          onNavigateHistory={() => setScreen("history")}
          onNavigateProgress={() => setScreen("progress")}
          onDraftStateChange={setSettingsDraftOpen}
        />
      </>
    );
  }

  if (screen === "workout") {
    return (
      <main className="app-shell">
        {renderGlobalStatus()}
        <div className="phone-layout workout-layout">
          <header className="workout-header">
            <button className="text-button" onClick={requestCancelWorkout}>Cancel</button>
            <div className="live-pill"><span /> Live workout</div>
            <button className="finish-button" onClick={finishWorkout}>Finish</button>
          </header>

          <section className="workout-title-block">
            <p className="eyebrow">{today}</p>
            <div className="workout-heading-row">
              <h1>{workoutName}</h1>
              {liveDisplayVolume > 0 && <span className="volume-pill">{formatDisplayNumber(liveDisplayVolume)} {activeWeightUnit}</span>}
            </div>
            <div className="timer" aria-label={`Workout duration ${formatTime(seconds)}`}>{formatTime(seconds)}</div>
          </section>

          {workoutError && <div className="workout-alert" role="alert">{workoutError}</div>}
          {activeDraftStorageError && <div className="workout-alert warning" role="alert">{activeDraftStorageError}</div>}
          {historyNeedsSanitisedSave && (
            <div className="workout-alert warning" role="status">History was recovered with ignored records. Successfully saving this workout will write only the visible recovered History and permanently discard those ignored records.</div>
          )}

          {loggedExercises.length === 0 ? (
            <section className="empty-workout-card">
              <div className="empty-icon" aria-hidden="true">＋</div>
              <h2>Build this workout</h2>
              <p>Add your first exercise, then record weight, reps and effort as you train.</p>
              <button className="primary-button add-exercise-button" onClick={() => {
                resetWorkoutExerciseFilters();
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
                      onClick={() => requestExerciseRemoval(exercise)}
                    >×</button>
                  </header>

                  {exercise.previous.length === 0 && (
                    <p className="no-previous-note">No previous performance. Complete this exercise to create a previous-performance reference.</p>
                  )}

                  <div className="set-table">
                    <div className="set-row set-labels">
                      <span>Set</span><span>Previous</span><span>{activeWeightUnit}</span><span>Reps</span><span>RPE</span><span>Done</span><span>Remove</span>
                    </div>
                    {exercise.sets.map((set, index) => {
                      const previous = exercise.previous[index];
                      const errors = activeSetErrors[set.id] ?? {};
                      const weightId = activeFieldId(exercise.sessionId, set.id, "weight");
                      const repsId = activeFieldId(exercise.sessionId, set.id, "reps");
                      const rpeId = activeFieldId(exercise.sessionId, set.id, "rpe");
                      const onlySet = exercise.sets.length === 1;
                      const removalReasonId = `active-remove-reason-${exercise.sessionId}-${set.id}`;
                      return (
                        <div className="set-row active-set-row" key={set.id}>
                          <span className="set-number-cell"><small>Set</small><span className="set-number">{index + 1}</span></span>
                          <span className="previous-value"><small>Previous</small>{previous ? `${formatWeightFromKilograms(previous.weight, activeWeightUnit)} × ${formatDisplayNumber(previous.reps)}` : "None recorded"}</span>
                          <label className="active-set-field" htmlFor={weightId}>
                            <span>Weight ({activeWeightUnit})</span>
                            <input
                              id={weightId}
                              inputMode="decimal"
                              aria-label={`${exercise.name} set ${index + 1} weight in ${activeWeightUnit === "kg" ? "kilograms" : "pounds"}`}
                              aria-invalid={Boolean(errors.weight)}
                              aria-describedby={errors.weight ? `${weightId}-error` : undefined}
                              value={set.weight}
                              placeholder={previous ? formatWeightInputFromKilograms(previous.weight, activeWeightUnit) : "0"}
                              onChange={(event) => updateSet(exercise.sessionId, index, "weight", event.target.value)}
                            />
                            {errors.weight && <small className="active-field-error" id={`${weightId}-error`}>{errors.weight}</small>}
                          </label>
                          <label className="active-set-field" htmlFor={repsId}>
                            <span>Repetitions</span>
                            <input
                              id={repsId}
                              inputMode="decimal"
                              aria-label={`${exercise.name} set ${index + 1} repetitions`}
                              aria-invalid={Boolean(errors.reps)}
                              aria-describedby={errors.reps ? `${repsId}-error` : undefined}
                              value={set.reps}
                              placeholder={previous ? String(previous.reps) : "0"}
                              onChange={(event) => updateSet(exercise.sessionId, index, "reps", event.target.value)}
                            />
                            {errors.reps && <small className="active-field-error" id={`${repsId}-error`}>{errors.reps}</small>}
                          </label>
                          <label className="active-set-field" htmlFor={rpeId}>
                            <span>RPE</span>
                            <input
                              id={rpeId}
                              inputMode="decimal"
                              aria-label={`${exercise.name} set ${index + 1} RPE`}
                              aria-invalid={Boolean(errors.rpe)}
                              aria-describedby={errors.rpe ? `${rpeId}-error` : undefined}
                              value={set.rpe}
                              placeholder="—"
                              onChange={(event) => updateSet(exercise.sessionId, index, "rpe", event.target.value)}
                            />
                            {errors.rpe && <small className="active-field-error" id={`${rpeId}-error`}>{errors.rpe}</small>}
                          </label>
                          <button
                            className={set.complete ? "set-check complete" : "set-check"}
                            type="button"
                            aria-pressed={set.complete}
                            aria-label={`Mark ${exercise.name} set ${index + 1} ${set.complete ? "incomplete" : "complete"}`}
                            onClick={() => updateSet(exercise.sessionId, index, "complete", !set.complete)}
                          >✓</button>
                          <button
                            className="remove-active-set"
                            type="button"
                            disabled={onlySet}
                            aria-label={`Remove ${exercise.name} set ${index + 1}`}
                            aria-describedby={onlySet ? removalReasonId : undefined}
                            onClick={() => requestSetRemoval(exercise, set, index)}
                          >Remove</button>
                          {onlySet && <small className="set-removal-reason" id={removalReasonId}>Keep one set, or remove the exercise.</small>}
                        </div>
                      );
                    })}
                  </div>
                  <button
                    className="add-set-button"
                    type="button"
                    onClick={() => addSetToExercise(exercise)}
                  >＋ Add set</button>
                </article>
              ))}
              <button className="secondary-add-button" onClick={() => {
                resetWorkoutExerciseFilters();
                setShowWorkoutPicker(true);
              }}>＋ Add another exercise</button>
            </section>
          )}

          {loggedExercises.length === 0 && (
            <aside className="previous-hint">
              <span className="hint-icon" aria-hidden="true">↗</span>
              <div><strong>No previous performance is invented</strong><p>Complete an exercise to create a factual previous-performance reference.</p></div>
            </aside>
          )}
        </div>

        {showWorkoutPicker && (
          <ExercisePicker
            title="Add exercise"
            exercises={exerciseLibrary}
            search={workoutExerciseSearch}
            muscleFilter={workoutMuscleFilter}
            equipmentFilter={workoutEquipmentFilter}
            onSearchChange={setWorkoutExerciseSearch}
            onMuscleFilterChange={setWorkoutMuscleFilter}
            onEquipmentFilterChange={setWorkoutEquipmentFilter}
            onResetFilters={resetWorkoutExerciseFilters}
            onSelect={addExerciseToWorkout}
            onClose={() => {
              setShowWorkoutPicker(false);
              resetWorkoutExerciseFilters();
            }}
          />
        )}
        <ConfirmDialog
          open={pendingConfirmation === "cancel-workout"}
          title="Discard active workout?"
          description="Your entered exercises and sets will not be saved. Existing workout History will not change."
          confirmLabel="Discard workout"
          destructive
          onCancel={() => setPendingConfirmation(null)}
          onConfirm={cancelWorkout}
        />
        <ConfirmDialog
          open={activeRemovalTarget !== null}
          title={activeRemovalTarget?.type === "set" ? "Remove entered set?" : "Remove exercise?"}
          description={activeRemovalTarget?.type === "set"
            ? `Remove ${activeRemovalTarget.exerciseName} set ${activeRemovalTarget.setNumber}? Its unsaved weight, repetitions, RPE and completion state will be discarded.`
            : activeRemovalTarget
              ? `Remove ${activeRemovalTarget.exerciseName}? All unsaved sets entered for this exercise will be discarded.`
              : ""}
          confirmLabel={activeRemovalTarget?.type === "set" ? "Remove set" : "Remove exercise"}
          destructive
          onCancel={() => setActiveRemovalTarget(null)}
          onConfirm={() => {
            if (activeRemovalTarget?.type === "set") performSetRemoval(activeRemovalTarget.sessionId, activeRemovalTarget.setId);
            else if (activeRemovalTarget?.type === "exercise") performExerciseRemoval(activeRemovalTarget.sessionId);
          }}
        />
      </main>
    );
  }

  return (
    <main className="app-shell">
      {renderGlobalStatus()}
      <div className="phone-layout dashboard">
        <header className="topbar">
          <div className="brand-lockup compact"><BrandLogo size="compact" /><span>OVERLOAD</span></div>
          <button className="profile-button" aria-label={`Open Settings for ${resolvedDisplayName}`} onClick={() => setScreen("settings")}>{displayInitials}</button>
        </header>

        <section className="greeting">
          <p className="eyebrow">{today}</p>
          <h1>Ready to lift, {resolvedDisplayName}?</h1>
          <p>Make today&apos;s numbers count.</p>
        </section>

        {completedMessage && <div className="saved-banner" role="status"><span>✓</span>{completedMessage}</div>}
        {(historyLoadStatus === "unavailable" || historyLoadStatus === "recovery-failed") && (
          <p className="history-notice error" role="alert">Dashboard values may be incomplete because saved workout data could not be read reliably. {historyLoadMessage}</p>
        )}

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
              <strong>{formatCompactVolumeFromKilograms(dashboardSummary.completedVolumeThisWeek, appSettings.weightUnit)}</strong>
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
                {formatVolumeFromKilograms(dashboardSummary.latestWorkout.totalVolume, appSettings.weightUnit)} across {formatCompactDuration(dashboardSummary.latestWorkout.durationSeconds)}
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
          <button onClick={() => setScreen("progress")}><span>⌁</span>Progress</button>
          <button onClick={() => setScreen("settings")}><span>⚙</span>Settings</button>
        </nav>
      </div>
    </main>
  );
}
