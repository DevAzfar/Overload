import { getBrowserStorage, type StorageLike, type StorageLoadStatus } from "./storageTypes";

export const DEMO_METADATA_KEY = "overload-demo-profile-v1";

export type DemoProfileId = "beginner-progression" | "plateau-breakthrough" | "inconsistent-training";

export type DemoMetadata = {
  version: 1;
  profileId: DemoProfileId;
  activatedAt: string;
};

export type DemoMetadataLoadResult = {
  metadata: DemoMetadata | null;
  status: StorageLoadStatus;
  message: string;
  rawValue: string | null;
};

const PROFILE_IDS: readonly DemoProfileId[] = Object.freeze([
  "beginner-progression",
  "plateau-breakthrough",
  "inconsistent-training",
]);

export function isDemoProfileId(value: unknown): value is DemoProfileId {
  return typeof value === "string" && PROFILE_IDS.some((profileId) => profileId === value);
}

export function isDemoMetadata(value: unknown): value is DemoMetadata {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.version === 1 &&
    isDemoProfileId(candidate.profileId) &&
    typeof candidate.activatedAt === "string" &&
    Number.isFinite(Date.parse(candidate.activatedAt));
}

export function serialiseDemoMetadata(metadata: DemoMetadata): string {
  if (!isDemoMetadata(metadata)) throw new Error("Demo metadata is invalid.");
  return JSON.stringify(metadata);
}

export function loadDemoMetadata(storage: StorageLike = getBrowserStorage()): DemoMetadataLoadResult {
  let rawValue: string | null;
  try {
    rawValue = storage.getItem(DEMO_METADATA_KEY);
  } catch {
    return {
      metadata: null,
      status: "unavailable",
      message: "Overload could not read demo-profile metadata. Workout history was left unchanged.",
      rawValue: null,
    };
  }

  if (rawValue === null) return { metadata: null, status: "missing", message: "", rawValue: null };

  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (isDemoMetadata(parsed)) return { metadata: parsed, status: "loaded", message: "", rawValue };
  } catch {
    // The invalid value is handled below without touching workout history.
  }

  try {
    storage.removeItem(DEMO_METADATA_KEY);
    return {
      metadata: null,
      status: "corrupt",
      message: "Invalid demo-profile metadata was removed. Workout history was not changed.",
      rawValue,
    };
  } catch {
    return {
      metadata: null,
      status: "recovery-failed",
      message: "Demo-profile metadata is invalid and could not be removed. Workout history was not changed.",
      rawValue,
    };
  }
}
