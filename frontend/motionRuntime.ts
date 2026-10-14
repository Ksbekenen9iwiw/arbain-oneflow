const active = new Set<Animation>();
let preference: MediaQueryList | undefined;

function reducedMotion() {
  if (!preference) {
    preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    preference.addEventListener("change", () => {
      if (preference?.matches)
        active.forEach((animation) => animation.cancel());
    });
  }
  return preference.matches;
}

/** Token-based Web Animations; cancellation always restores the live DOM state. */
export function playMotion(
  element: HTMLElement,
  frames: Keyframe[],
  speed: "fast" | "medium" = "medium",
) {
  if (reducedMotion() || typeof element.animate !== "function") return;
  const styles = getComputedStyle(element);
  const token = styles.getPropertyValue(`--duration-${speed}`).trim();
  const duration = parseFloat(token) * (token.endsWith("ms") ? 1 : 1000);
  if (!Number.isFinite(duration) || duration <= 0) return;
  const animation = element.animate(frames, {
    duration,
    easing: styles.getPropertyValue("--ease-standard").trim() || "ease-out",
  });
  active.add(animation);
  const clean = () => active.delete(animation);
  animation.addEventListener("finish", clean, { once: true });
  animation.addEventListener("cancel", clean, { once: true });
  return animation;
}
