import { useEffect, useState } from "react";
import { Banner, type BannerContainer } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { useApp } from "./router";
import { MotionStack } from "./motion";

// Hide fast requests; give a clear explanation when the wait becomes noticeable.
export function usePendingFeedback(busy: boolean) {
  const [stage, setStage] = useState<"idle" | "loading" | "slow">("idle");
  useEffect(() => {
    if (!busy) {
      setStage("idle");
      return;
    }
    const loading = window.setTimeout(() => setStage("loading"), 180);
    const slow = window.setTimeout(() => setStage("slow"), 6000);
    return () => {
      window.clearTimeout(loading);
      window.clearTimeout(slow);
    };
  }, [busy]);
  return busy ? stage : "idle";
}

export function RequestFeedback({
  container = "card",
}: {
  container?: BannerContainer;
}) {
  const { issue, navigate } = useApp();
  if (!issue) return null;
  const retry = issue.retry;
  return (
    <MotionStack gap={0} role="alert">
      <Banner
        status="error"
        title={issue.title}
        description={issue.description}
        container={container}
        endContent={
          retry ? (
            <Button
              label="Coba lagi"
              variant="secondary"
              onClick={() => void navigate(retry.url, retry.replace)}
            />
          ) : undefined
        }
      />
    </MotionStack>
  );
}
