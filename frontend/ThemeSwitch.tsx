import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Switch } from "@/kit";
import { Icon, IconButton } from "@/kit";
import { IconMoon, IconSun } from "@/icons";
import {
  THEME_STORAGE_KEY,
  nextThemeMode,
  readThemePreference,
  resolveThemeMode,
  writeThemePreference,
  type ResolvedThemeMode,
  type ThemePreference,
} from "./themeMode";

type ThemeModeContextValue = {
  mode: ThemePreference;
  resolvedMode: ResolvedThemeMode;
  isDark: boolean;
  setMode: (mode: ThemePreference) => void;
  toggleMode: () => void;
};

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

function readPrefersDark(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Provides persisted light/dark theme mode state via the `.dark` class. */
export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemePreference>(() =>
    readThemePreference(),
  );
  const [prefersDark, setPrefersDark] = useState<boolean>(readPrefersDark);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    setPrefersDark(media.matches);
    const onMediaChange = (event: MediaQueryListEvent) =>
      setPrefersDark(event.matches);
    media.addEventListener("change", onMediaChange);

    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) {
        setModeState(readThemePreference());
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      media.removeEventListener("change", onMediaChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const resolvedMode = resolveThemeMode(mode, prefersDark);
  const isDark = resolvedMode === "dark";

  const setMode = useCallback((next: ThemePreference) => {
    setModeState(next);
    writeThemePreference(next);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((current) => {
      const next = nextThemeMode(current, prefersDark);
      writeThemePreference(next);
      return next;
    });
  }, [prefersDark]);

  const value = useMemo(
    () => ({ mode, resolvedMode, isDark, setMode, toggleMode }),
    [mode, resolvedMode, isDark, setMode, toggleMode],
  );

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", isDark);
    root.setAttribute("data-theme", resolvedMode);
    root.style.colorScheme = resolvedMode;
  }, [isDark, resolvedMode]);

  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

/** Access current light/dark mode state and actions from ThemeModeProvider. */
export function useThemeMode(): ThemeModeContextValue {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) {
    throw new Error("useThemeMode must be used within ThemeModeProvider");
  }
  return ctx;
}

/** Light/dark theme toggle for the sidebar footer. */
export function ThemeSwitch({ compact = false }: { compact?: boolean; spread?: boolean }) {
  const { isDark, toggleMode } = useThemeMode();
  const label = isDark ? "Beralih ke tema terang" : "Beralih ke tema gelap";
  if (compact) {
    return (
      <IconButton
        label={label}
        tooltip={label}
        size="sm"
        variant="ghost"
        icon={<Icon icon={isDark ? IconSun : IconMoon} />}
        onClick={toggleMode}
      />
    );
  }
  return <Switch label="Tema gelap" size="sm" value={isDark} onChange={toggleMode} />;
}
