// Skeleton placeholders, also rendered to static HTML before the client starts.
import { BrandMark } from "./BrandMark";
import { Skeleton } from "@/kit";
import {
  VStack,
  HStack,
  Layout,
  LayoutHeader,
  LayoutContent,
} from "@/kit";
import { Grid, GridSpan } from "@/kit";
import { Text } from "@/kit";
import { Banner } from "@/kit";
import { Button } from "@/kit";
import { VisuallyHidden } from "@/kit";

const line = "var(--spacing-4)";
export function ChartSkeleton() {
  return (
    <VStack
      gap={4}
      role="status"
      aria-label="Memuat grafik pengiriman"
      aria-busy="true"
    >
      <HStack hAlign="between">
        <Skeleton width="35%" height="var(--spacing-6)" />
        <Skeleton width="25%" height="var(--spacing-8)" />
      </HStack>
      <Skeleton width="30%" height="var(--spacing-8)" index={1} />
      <Skeleton height="calc(var(--spacing-8) * 4)" index={2} />
      <Skeleton width="45%" height={line} index={3} />
      <VisuallyHidden>Memuat grafik pengiriman</VisuallyHidden>
    </VStack>
  );
}

export function LoadingScreen({
  kind,
}: {
  kind: "dashboard" | "list" | "detail" | "form" | "login";
}) {
  const rows = (
    <VStack gap={6}>
      {Array.from({ length: 6 }, (_, index) => (
        <Grid columns={4} gap={6} key={index}>
          {["85%", "65%", "45%", "55%"].map((width, column) => (
            <Skeleton key={column} width={width} height={line} index={index} />
          ))}
        </Grid>
      ))}
    </VStack>
  );
  const content =
    kind === "form" ? (
      <VStack
        padding={8}
        gap={8}
        width="100%"
        style={{ maxWidth: "75ch", marginInline: "auto" }}
      >
        <Skeleton width="45%" height="var(--spacing-8)" />
        <Skeleton height="var(--spacing-4)" />
        <VStack gap={6}>
          {[0, 1, 2].map((index) => (
            <VStack key={index} gap={3}>
              <Skeleton width="30%" height={line} index={index} />
              <Skeleton height="var(--spacing-10)" index={index} />
            </VStack>
          ))}
        </VStack>
      </VStack>
    ) : (
      <Layout
        height="fill"
        header={
          <LayoutHeader padding={6}>
            <VStack gap={3} paddingBlock={2}>
              <Skeleton width="30%" height="var(--spacing-8)" />
              <Skeleton width="45%" height={line} index={1} />
            </VStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={6}>
            <VStack gap={8}>
              {kind === "dashboard" ? (
                <>
                  <Grid columns={3} gap={6}>
                    <GridSpan columns={2}>
                      <ChartSkeleton />
                    </GridSpan>
                    <VStack gap={6}>
                      <Skeleton width="60%" height="var(--spacing-6)" />
                      <Skeleton width="40%" height={line} />
                      <Skeleton height="var(--spacing-2)" />
                      <Skeleton width="75%" height={line} />
                      <Skeleton height="var(--spacing-8)" />
                    </VStack>
                  </Grid>
                  <Grid columns={4} gap={4}>
                    {[0, 1, 2, 3].map((index) => (
                      <VStack key={index} gap={3}>
                        <Skeleton width="65%" height={line} index={index} />
                        <Skeleton
                          width="35%"
                          height="var(--spacing-8)"
                          index={index}
                        />
                        <Skeleton width="75%" height={line} index={index} />
                      </VStack>
                    ))}
                  </Grid>
                </>
              ) : (
                <HStack gap={4}>
                  <Skeleton width="60%" height="var(--spacing-8)" />
                  <Skeleton width="20%" height="var(--spacing-8)" />
                </HStack>
              )}
              {kind === "detail" ? (
                <Grid columns={3} gap={6}>
                  <GridSpan columns={2}>{rows}</GridSpan>
                  <VStack gap={6}>
                    {[0, 1, 2].map((index) => (
                      <Skeleton
                        key={index}
                        width="75%"
                        height={line}
                        index={index}
                      />
                    ))}
                  </VStack>
                </Grid>
              ) : (
                rows
              )}
            </VStack>
          </LayoutContent>
        }
      />
    );
  return (
    <VStack
      id="oneflow-boot"
      height="100dvh"
      gap={0}
      className="bg-background-full"
    >
      <VStack
        id="oneflow-boot-status"
        role="status"
        aria-label="Memuat halaman"
        aria-busy="true"
        height="100%"
        gap={0}
      >
        <VisuallyHidden>Memuat halaman OneFlow</VisuallyHidden>
        {kind === "login" ? (
          <Grid
            columns={2}
            gap={6}
            style={{ padding: "var(--spacing-6)", height: "100%" }}
          >
            <VStack padding={6} gap={8}>
              <Text weight="semibold">OneFlow</Text>
              <VStack gap={6} height="100%" vAlign="center" padding={8}>
                <Skeleton width="65%" height="var(--spacing-8)" />
                <Skeleton width="85%" height={line} />
                <Skeleton height="var(--spacing-10)" />
                <Skeleton width="30%" height="var(--spacing-10)" />
              </VStack>
            </VStack>
            <Skeleton height="100%" radius={4} />
          </Grid>
        ) : (
          <div className="flex h-full min-h-0 gap-2 bg-background-full p-0 md:p-2">
            <aside className="hidden h-full w-64 shrink-0 flex-col justify-between rounded-3xl border border-border-button-white bg-background-secondary-default p-3 shadow-sidebar md:flex">
              <div className="flex flex-col gap-6">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-9 items-center justify-center rounded-2lg bg-linear-to-b from-accent-400 to-accent-500 text-white">
                    <BrandMark className="size-5" />
                  </span>
                  <span className="text-headline-semibold text-text-primary">OneFlow</span>
                </div>
                <VStack gap={5} padding={2}>
                  {[0, 1, 2, 3].map((index) => (
                    <Skeleton key={index} width="75%" height={line} index={index} />
                  ))}
                </VStack>
              </div>
              <Skeleton height="var(--spacing-10)" />
            </aside>
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden bg-background-primary-default md:rounded-3xl md:border md:border-border-button-default">
              {content}
            </div>
          </div>
        )}
      </VStack>
      <VStack
        id="oneflow-boot-error"
        hidden
        style={{ display: "none" }}
        padding={10}
        gap={4}
        height="100%"
        vAlign="center"
        hAlign="center"
      >
        <Banner
          status="warning"
          title="Halaman belum selesai dimuat"
          description="Periksa koneksi Anda, lalu muat ulang halaman."
          endContent={<Button label="Muat ulang" href="" variant="secondary" />}
        />
      </VStack>
    </VStack>
  );
}
