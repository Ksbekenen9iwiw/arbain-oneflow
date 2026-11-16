import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Theme } from "@astryxdesign/core/theme";
import { Switch } from "@astryxdesign/core/Switch";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Icon } from "@astryxdesign/core/Icon";
import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";
import { oneflowTheme } from "./theme";
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

/** Provides persisted light/dark theme mode state around Astryx Theme. */
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

  return (
    <ThemeModeContext.Provider value={value}>
      <Theme theme={oneflowTheme} mode={mode}>
        {children}
      </Theme>
    </ThemeModeContext.Provider>
  );
}

/** Access current light/dark mode state and actions from ThemeModeProvider. */
export function useThemeMode(): ThemeModeContextValue {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) {
    throw new Error("useThemeMode must be used within ThemeModeProvider");
  }
  return ctx;
}

/** Light/dark theme switch control for sidebars and headers. */
export function ThemeSwitch({
  compact = false,
  spread = false,
}: {
  compact?: boolean;
  spread?: boolean;
}) {
  const { isDark, setMode, toggleMode } = useThemeMode();

  if (compact) {
    const label = isDark ? "Beralih ke tema terang" : "Beralih ke tema gelap";
    const tooltip = isDark
      ? "Tema gelap aktif · Beralih ke terang"
      : "Tema terang aktif · Beralih ke gelap";
    return (
      <IconButton
        label={label}
        tooltip={tooltip}
        size="sm"
        variant="secondary"
        icon={<Icon icon={isDark ? SunIcon : MoonIcon} />}
        onClick={toggleMode}
      />
    );
  }

  return (
    <Switch
      label="Tema gelap"
      labelIcon={
        <Icon icon={isDark ? MoonIcon : SunIcon} size="sm" color="inherit" />
      }
      labelPosition="start"
      labelSpacing={spread ? "spread" : "hug"}
      size="sm"
      width={spread ? "100%" : undefined}
      value={isDark}
      onChange={(checked) => setMode(checked ? "dark" : "light")}
    />
  );
}
