import test from "node:test";
import assert from "node:assert/strict";
import { playMotion } from "./motionRuntime.ts";

test("motion respects live reduced-motion changes, tokens, and completed animation cleanup", () => {
  const originalWindow = globalThis.window;
  const originalStyles = globalThis.getComputedStyle;
  let onChange;
  const preference = {
    matches: true,
    addEventListener: (_, callback) => {
      onChange = callback;
    },
  };
  let duration = "140ms";
  const calls = [];
  let cancellations = 0;
  const element = {
    animate: (frames, options) => {
      const handlers = {};
      const animation = {
        addEventListener: (name, callback) => {
          handlers[name] = callback;
        },
        cancel: () => {
          cancellations++;
          handlers.cancel?.();
        },
        finish: () => handlers.finish?.(),
      };
      calls.push({ frames, options, animation });
      return animation;
    },
  };
  globalThis.window = { matchMedia: () => preference };
  globalThis.getComputedStyle = () => ({
    getPropertyValue: (name) =>
      name === "--ease-standard" ? "ease-out" : duration,
  });
  try {
    const frames = [{ opacity: 0 }, { opacity: 1 }];
    assert.equal(playMotion(element, frames), undefined);
    assert.equal(
      calls.length,
      0,
      "no animation at all when reduced motion is enabled",
    );
    preference.matches = false;
    onChange();
    playMotion(element, frames, "fast");
    assert.equal(calls[0].options.duration, 140);
    assert.equal(calls[0].options.easing, "ease-out");
    assert.equal(
      calls[0].options.fill,
      undefined,
      "finished effects cannot leave stale styles",
    );
    preference.matches = true;
    onChange();
    assert.equal(
      cancellations,
      1,
      "changing preference stops motion already running",
    );
    preference.matches = false;
    duration = "0.24s";
    playMotion(element, frames);
    assert.equal(calls[1].options.duration, 240);
    calls[1].animation.finish();
    preference.matches = true;
    onChange();
    assert.equal(cancellations, 1, "completed animations are released");
    preference.matches = false;
    duration = "0ms";
    assert.equal(playMotion(element, frames), undefined);
    assert.equal(calls.length, 2);
  } finally {
    globalThis.window = originalWindow;
    globalThis.getComputedStyle = originalStyles;
  }
});
