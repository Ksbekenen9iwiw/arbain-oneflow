export type ThemePreference = "system" | "light" | "dark";
export type ResolvedThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "oneflow:theme-mode";

type StorageReader = Pick<Storage, "getItem"> | null | undefined;
type StorageWriter = Pick<Storage, "setItem" | "removeItem"> | null | undefined;

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** Read persisted theme mode preference, defaulting to OS preference ("system"). */
export function readThemePreference(
  storage: StorageReader = defaultStorage(),
): ThemePreference {
  try {
    const raw = storage?.getItem(THEME_STORAGE_KEY);
    return raw === "light" || raw === "dark" ? raw : "system";
  } catch {
    return "system";
  }
}

/** Persist explicit light/dark preference or clear to follow OS preference. */
export function writeThemePreference(
  mode: ThemePreference,
  storage: StorageWriter = defaultStorage(),
): void {
  try {
    if (mode === "system") storage?.removeItem(THEME_STORAGE_KEY);
    else storage?.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* Storage may be unavailable. */
  }
}

/** Resolve an explicit preference or "system" against the OS color scheme. */
export function resolveThemeMode(
  preference: ThemePreference,
  prefersDark: boolean,
): ResolvedThemeMode {
  return preference === "system"
    ? prefersDark
      ? "dark"
      : "light"
    : preference;
}

/** Return the opposite concrete mode from the current resolved appearance. */
export function nextThemeMode(
  preference: ThemePreference,
  prefersDark: boolean,
): ResolvedThemeMode {
  return resolveThemeMode(preference, prefersDark) === "dark"
    ? "light"
    : "dark";
}
