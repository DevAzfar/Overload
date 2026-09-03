import { isKnownExerciseId } from "./exercises";

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
  if (!value.exerciseIds.every((exerciseId) => typeof exerciseId === "string" && isKnownExerciseId(exerciseId))) return null;
  if (new Set(value.exerciseIds).size !== value.exerciseIds.length) return null;

  const id = value.id.trim();
  if (value.kind === "built-in" && !BUILT_IN_IDS.has(id)) return null;
  if (value.kind === "custom" && BUILT_IN_IDS.has(id)) return null;

  return {
    id,
    name: value.name.trim(),
    exerciseIds: [...value.exerciseIds],
    kind: value.kind,
  };
}

function safelyRemoveTemplates() {
  try {
    window.localStorage.removeItem(WORKOUT_TEMPLATES_KEY);
  } catch {
    // The defaults remain available in memory when browser storage is restricted.
  }
}

export function loadWorkoutTemplates(): WorkoutTemplate[] {
  let rawTemplates: string | null;

  try {
    rawTemplates = window.localStorage.getItem(WORKOUT_TEMPLATES_KEY);
  } catch {
    return getDefaultTemplates();
  }

  if (rawTemplates === null) return getDefaultTemplates();

  try {
    const parsed: unknown = JSON.parse(rawTemplates);
    if (!isObject(parsed) || parsed.version !== 1 || !Array.isArray(parsed.templates)) {
      safelyRemoveTemplates();
      return getDefaultTemplates();
    }

    const validById = new Map<string, WorkoutTemplate>();
    parsed.templates.forEach((candidate) => {
      const template = toValidTemplate(candidate);
      if (template && !validById.has(template.id)) validById.set(template.id, template);
    });

    const builtIns = BUILT_IN_TEMPLATE_DEFINITIONS.map((defaultTemplate) => {
      const savedTemplate = validById.get(defaultTemplate.id);
      return savedTemplate?.kind === "built-in" ? cloneTemplate(savedTemplate) : cloneTemplate(defaultTemplate);
    });
    const customTemplates = [...validById.values()].filter((template) => template.kind === "custom");

    return [...builtIns, ...customTemplates];
  } catch {
    safelyRemoveTemplates();
    return getDefaultTemplates();
  }
}

function templatesAreValidForSave(templates: WorkoutTemplate[]): boolean {
  const validTemplates = templates.map(toValidTemplate);
  if (validTemplates.some((template) => template === null)) return false;
  if (new Set(templates.map((template) => template.id)).size !== templates.length) return false;

  return BUILT_IN_TEMPLATE_DEFINITIONS.every((builtIn) =>
    templates.some((template) => template.id === builtIn.id && template.kind === "built-in"),
  );
}

export function saveWorkoutTemplates(templates: WorkoutTemplate[]): boolean {
  if (!templatesAreValidForSave(templates)) return false;

  const store: WorkoutTemplateStoreV1 = { version: 1, templates };
  try {
    window.localStorage.setItem(WORKOUT_TEMPLATES_KEY, JSON.stringify(store));
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
