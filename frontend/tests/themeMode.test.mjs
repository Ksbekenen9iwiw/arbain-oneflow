import test from "node:test";
import assert from "node:assert/strict";
import {
  THEME_STORAGE_KEY,
  nextThemeMode,
  readThemePreference,
  resolveThemeMode,
  writeThemePreference,
} from "../themeMode.ts";

function makeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

test("readThemePreference defaults to system for missing or invalid values", () => {
  assert.equal(readThemePreference(makeStorage()), "system");
  assert.equal(
    readThemePreference(makeStorage({ [THEME_STORAGE_KEY]: "sepia" })),
    "system",
  );
  assert.equal(
    readThemePreference(makeStorage({ [THEME_STORAGE_KEY]: "dark" })),
    "dark",
  );
  assert.equal(
    readThemePreference(makeStorage({ [THEME_STORAGE_KEY]: "light" })),
    "light",
  );
  assert.equal(
    readThemePreference({
      getItem() {
        throw new Error("blocked");
      },
    }),
    "system",
  );
});

test("writeThemePreference stores light/dark and clears system safely", () => {
  const storage = makeStorage();
  writeThemePreference("dark", storage);
  assert.equal(readThemePreference(storage), "dark");
  writeThemePreference("light", storage);
  assert.equal(readThemePreference(storage), "light");
  writeThemePreference("system", storage);
  assert.equal(readThemePreference(storage), "system");

  assert.doesNotThrow(() =>
    writeThemePreference("dark", {
      setItem() {
        throw new Error("quota");
      },
      removeItem() {},
    }),
  );
});

test("resolveThemeMode and nextThemeMode respect system and explicit choices", () => {
  assert.equal(resolveThemeMode("system", false), "light");
  assert.equal(resolveThemeMode("system", true), "dark");
  assert.equal(resolveThemeMode("light", true), "light");
  assert.equal(resolveThemeMode("dark", false), "dark");

  assert.equal(nextThemeMode("system", false), "dark");
  assert.equal(nextThemeMode("system", true), "light");
  assert.equal(nextThemeMode("light", false), "dark");
  assert.equal(nextThemeMode("dark", false), "light");
});
