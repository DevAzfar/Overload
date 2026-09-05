import type { WeightUnit } from "./weightUnits";

export const APP_SETTINGS_KEY = "lift-off-settings-v1";
export const DISPLAY_NAME_MAX_LENGTH = 40;

export type AppSettings = {
  displayName: string;
  weightUnit: WeightUnit;
};

type AppSettingsStoreV1 = {
  version: 1;
  settings: AppSettings;
};

export type AppSettingsLoadResult = {
  settings: AppSettings;
  error: string;
};

export const DEFAULT_APP_SETTINGS: Readonly<AppSettings> = Object.freeze({
  displayName: "",
  weightUnit: "kg",
});

export function getDefaultAppSettings(): AppSettings {
  return { ...DEFAULT_APP_SETTINGS };
}

export function getResolvedDisplayName(settings: AppSettings): string {
  return settings.displayName || "Athlete";
}

export function normaliseAppSettings(settings: AppSettings): AppSettings | null {
  const displayName = settings.displayName.trim();
  if (displayName.length > DISPLAY_NAME_MAX_LENGTH) return null;
  if (settings.weightUnit !== "kg" && settings.weightUnit !== "lb") return null;
  return { displayName, weightUnit: settings.weightUnit };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safelyRemoveSettings(): boolean {
  try {
    window.localStorage.removeItem(APP_SETTINGS_KEY);
    return true;
  } catch {
    return false;
  }
}

export function loadAppSettings(): AppSettingsLoadResult {
  let rawSettings: string | null;
  try {
    rawSettings = window.localStorage.getItem(APP_SETTINGS_KEY);
  } catch {
    return {
      settings: getDefaultAppSettings(),
      error: "Lift Off could not access settings on this device. Default settings are in use.",
    };
  }

  if (rawSettings === null) return { settings: getDefaultAppSettings(), error: "" };

  try {
    const parsed: unknown = JSON.parse(rawSettings);
    if (!isObject(parsed) || parsed.version !== 1 || !isObject(parsed.settings)) throw new Error("Invalid settings store");
    if (typeof parsed.settings.displayName !== "string" ||
      (parsed.settings.weightUnit !== "kg" && parsed.settings.weightUnit !== "lb")) {
      throw new Error("Invalid settings values");
    }

    const settings = normaliseAppSettings({
      displayName: parsed.settings.displayName,
      weightUnit: parsed.settings.weightUnit,
    });
    if (!settings) throw new Error("Invalid settings values");
    return { settings, error: "" };
  } catch {
    const cleared = safelyRemoveSettings();
    return {
      settings: getDefaultAppSettings(),
      error: cleared
        ? "Invalid settings were removed and defaults restored. Other Lift Off data was not changed."
        : "Settings are invalid and could not be cleared because device storage is unavailable.",
    };
  }
}

export function saveAppSettings(settings: AppSettings): boolean {
  const normalised = normaliseAppSettings(settings);
  if (!normalised) return false;

  const store: AppSettingsStoreV1 = { version: 1, settings: normalised };
  try {
    window.localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}
