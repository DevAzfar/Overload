export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type StorageLoadStatus =
  | "missing"
  | "loaded"
  | "recovered"
  | "corrupt"
  | "unavailable"
  | "recovery-failed";

export type StorageLoadResult<T> = {
  data: T;
  status: StorageLoadStatus;
  message: string;
  rawValue: string | null;
  discardedItemCount?: number;
};

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export function getBrowserStorage(): StorageLike {
  return window.localStorage;
}
