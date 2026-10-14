import {
  useLayoutEffect,
  useRef,
  type ComponentProps,
  type RefObject,
} from "react";
import { VStack, LayoutPanel } from "@astryxdesign/core/Layout";

type Preset = "page" | "fade" | "step" | "expand";
export { playMotion } from "./motionRuntime";
import { playMotion } from "./motionRuntime";

export function useContentMotion(
  ref: RefObject<HTMLElement | null>,
  change: string | number,
  preset: Preset = "fade",
  initial = false,
) {
  const previous = useRef<string | number | undefined>(undefined);
  const presetRef = useRef(preset);
  presetRef.current = preset;
  useLayoutEffect(() => {
    const preset = presetRef.current;
    const before = previous.current;
    previous.current = change;
    if ((!initial && before === undefined) || before === change || !ref.current)
      return;
    const element = ref.current;
    let frames: Keyframe[] = [{ opacity: 0.5 }, { opacity: 1 }];
    if (preset === "page")
      frames = [
        { opacity: 0.6, transform: "translateY(var(--spacing-1))" },
        { opacity: 1, transform: "translateY(0)" },
      ];
    if (preset === "step") {
      const backwards =
        typeof before === "number" &&
        typeof change === "number" &&
        change < before;
      frames = [
        {
          opacity: 0,
          transform: `translateX(${backwards ? "calc(-1 * var(--spacing-4))" : "var(--spacing-4)"})`,
        },
        { opacity: 1, transform: "translateX(0)" },
      ];
    }
    if (preset === "expand")
      frames = [
        { height: "0", opacity: 0, overflow: "clip" },
        { height: `${element.scrollHeight}px`, opacity: 1, overflow: "clip" },
      ];
    const animation = playMotion(
      element,
      frames,
      preset === "fade" ? "fast" : "medium",
    );
    return () => animation?.cancel();
  }, [change, initial, ref]);
}

// Composition stays in Astryx; no extra CSS, animation dependencies, or delay to interaction.
export function MotionStack({
  motionKey = "entry",
  preset = "fade",
  ...props
}: Omit<ComponentProps<typeof VStack>, "ref"> & {
  motionKey?: string | number;
  preset?: Preset;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useContentMotion(ref, motionKey, preset, true);
  return <VStack {...props} ref={ref} />;
}

export function MotionPanel(
  props: Omit<ComponentProps<typeof LayoutPanel>, "ref">,
) {
  const ref = useRef<HTMLDivElement>(null);
  useContentMotion(ref, "entry", "page", true);
  return <LayoutPanel {...props} ref={ref} />;
}

/** Move surviving order lines into position after adding/removing a line. */
export function useListMotion(
  ref: RefObject<HTMLElement | null>,
  keys: string,
) {
  const previous = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const animations: Animation[] = [];
    const next = new Map<string, number>();
    ref.current
      ?.querySelectorAll<HTMLElement>("[data-motion-item]")
      .forEach((element) => {
        const id = element.dataset.motionItem!;
        const top = element.offsetTop;
        next.set(id, top);
        const old = previous.current.get(id);
        if (old !== undefined && old !== top) {
          const animation = playMotion(element, [
            { transform: `translateY(${old - top}px)` },
            { transform: "translateY(0)" },
          ]);
          if (animation) animations.push(animation);
        }
      });
    previous.current = next;
    return () => animations.forEach((animation) => animation.cancel());
  }, [keys, ref]);
}
