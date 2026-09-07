import { getBrowserStorage, type StorageLike, type StorageLoadStatus } from "./storageTypes";

export const WORKOUT_TEMPLATES_KEY = "lift-off-workout-templates-v1";

export type WorkoutTemplateKind = "built-in" | "custom";

export type WorkoutTemplate = {
  id: string;
  name: string;
  exerciseIds: string[];
  kind: WorkoutTemplateKind;
};

type WorkoutTemplateStoreV1 = {
  version: 1;
  templates: WorkoutTemplate[];
};

export type WorkoutTemplateLoadResult = {
  templates: WorkoutTemplate[];
  status: StorageLoadStatus;
  message: string;
  rawValue: string | null;
};

type BuiltInTemplateDefinition = {
  readonly id: string;
  readonly name: string;
  readonly exerciseIds: readonly string[];
  readonly kind: "built-in";
};

const BUILT_IN_TEMPLATE_DEFINITIONS: readonly BuiltInTemplateDefinition[] = Object.freeze([
  Object.freeze({
    id: "builtin-upper",
    name: "Upper",
    exerciseIds: Object.freeze(["bench", "lat-pulldown", "ohp", "cable-row", "lateral", "curl", "triceps"]),
    kind: "built-in" as const,
  }),
  Object.freeze({
    id: "builtin-lower",
    name: "Lower",
    exerciseIds: Object.freeze(["squat", "rdl", "split-squat", "calf"]),
    kind: "built-in" as const,
  }),
]);

const BUILT_IN_IDS = new Set(BUILT_IN_TEMPLATE_DEFINITIONS.map((template) => template.id));

function cloneTemplate(template: BuiltInTemplateDefinition | WorkoutTemplate): WorkoutTemplate {
  return { ...template, exerciseIds: [...template.exerciseIds] };
}

export function getDefaultTemplates(): WorkoutTemplate[] {
  return BUILT_IN_TEMPLATE_DEFINITIONS.map(cloneTemplate);
}

export function getDefaultTemplate(templateId: string): WorkoutTemplate | undefined {
  const template = BUILT_IN_TEMPLATE_DEFINITIONS.find((candidate) => candidate.id === templateId);
  return template ? cloneTemplate(template) : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toValidTemplate(value: unknown): WorkoutTemplate | null {
  if (!isObject(value)) return null;
  if (typeof value.id !== "string" || value.id.trim() === "") return null;
  if (typeof value.name !== "string" || value.name.trim() === "") return null;
  if (value.kind !== "built-in" && value.kind !== "custom") return null;
  if (!Array.isArray(value.exerciseIds) || value.exerciseIds.length === 0) return null;
  if (!value.exerciseIds.every((exerciseId) => typeof exerciseId === "string" && exerciseId.trim() !== "")) return null;

  const exerciseIds = value.exerciseIds.map((exerciseId) => exerciseId.trim());
  if (new Set(exerciseIds).size !== exerciseIds.length) return null;

  const id = value.id.trim();
  if (value.kind === "built-in" && !BUILT_IN_IDS.has(id)) return null;
  if (value.kind === "custom" && BUILT_IN_IDS.has(id)) return null;

  return {
    id,
    name: value.name.trim(),
    exerciseIds,
    kind: value.kind,
  };
}

function safelyRemoveTemplates(storage: StorageLike) {
  try {
    storage.removeItem(WORKOUT_TEMPLATES_KEY);
    return true;
  } catch {
    return false;
  }
}

export function loadWorkoutTemplatesResult(storage: StorageLike = getBrowserStorage()): WorkoutTemplateLoadResult {
  let rawTemplates: string | null;

  try {
    rawTemplates = storage.getItem(WORKOUT_TEMPLATES_KEY);
  } catch {
    return { templates: getDefaultTemplates(), status: "unavailable", message: "Overload could not read saved templates. Source defaults are in use, but saved edits and custom templates may still exist on this device.", rawValue: null };
  }

  if (rawTemplates === null) return { templates: getDefaultTemplates(), status: "missing", message: "", rawValue: null };

  try {
    const parsed: unknown = JSON.parse(rawTemplates);
    if (!isObject(parsed) || parsed.version !== 1 || !Array.isArray(parsed.templates)) {
      const removed = safelyRemoveTemplates(storage);
      return {
        templates: getDefaultTemplates(),
        status: removed ? "corrupt" : "recovery-failed",
        message: removed
          ? "Invalid template data was removed and source defaults restored."
          : "Template data is invalid and could not be removed because device storage is unavailable.",
        rawValue: rawTemplates,
      };
    }

    const validById = new Map<string, WorkoutTemplate>();
    let ignoredCount = 0;
    parsed.templates.forEach((candidate) => {
      const template = toValidTemplate(candidate);
      if (template && !validById.has(template.id)) validById.set(template.id, template);
      else ignoredCount += 1;
    });

    const builtIns = BUILT_IN_TEMPLATE_DEFINITIONS.map((defaultTemplate) => {
      const savedTemplate = validById.get(defaultTemplate.id);
      return savedTemplate?.kind === "built-in" ? cloneTemplate(savedTemplate) : cloneTemplate(defaultTemplate);
    });
    const customTemplates = [...validById.values()].filter((template) => template.kind === "custom");
    const missingBuiltInCount = BUILT_IN_TEMPLATE_DEFINITIONS.filter((template) => !validById.has(template.id)).length;
    const recoveredCount = ignoredCount + missingBuiltInCount;
    return {
      templates: [...builtIns, ...customTemplates],
      status: recoveredCount > 0 ? "recovered" : "loaded",
      message: recoveredCount > 0
        ? `${ignoredCount} invalid or duplicate saved ${ignoredCount === 1 ? "template was" : "templates were"} ignored, and ${missingBuiltInCount} missing built-in ${missingBuiltInCount === 1 ? "template was" : "templates were"} restored from source. Storage was not rewritten.`
        : "",
      rawValue: rawTemplates,
    };
  } catch {
    const removed = safelyRemoveTemplates(storage);
    return {
      templates: getDefaultTemplates(),
      status: removed ? "corrupt" : "recovery-failed",
      message: removed
        ? "Corrupt template JSON was removed and source defaults restored."
        : "Template JSON is corrupt and could not be removed because device storage is unavailable.",
      rawValue: rawTemplates,
    };
  }
}

export function loadWorkoutTemplates(): WorkoutTemplate[] {
  return loadWorkoutTemplatesResult().templates;
}

function templatesAreValidForSave(templates: WorkoutTemplate[]): boolean {
  const validTemplates = templates.map(toValidTemplate);
  if (validTemplates.some((template) => template === null)) return false;
  if (new Set(templates.map((template) => template.id)).size !== templates.length) return false;

  return BUILT_IN_TEMPLATE_DEFINITIONS.every((builtIn) =>
    templates.some((template) => template.id === builtIn.id && template.kind === "built-in"),
  );
}

export function saveWorkoutTemplates(templates: WorkoutTemplate[], storage: StorageLike = getBrowserStorage()): boolean {
  if (!templatesAreValidForSave(templates)) return false;

  const store: WorkoutTemplateStoreV1 = { version: 1, templates };
  try {
    storage.setItem(WORKOUT_TEMPLATES_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

export function createTemplateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `template-${crypto.randomUUID()}`;
  }

  return `template-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
