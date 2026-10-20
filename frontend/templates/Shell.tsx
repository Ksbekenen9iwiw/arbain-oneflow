// Copyright (c) Meta Platforms, Inc. and affiliates.
// Adapted from Astryx 0.7.0 shell-side-nav: application frame and navigation.
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { playMotion, useContentMotion } from "../motion";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { AppShell } from "@astryxdesign/core/AppShell";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Card } from "@astryxdesign/core/Card";
import { IconButton } from "@astryxdesign/core/IconButton";
import { StackItem } from "@astryxdesign/core/Stack";
import {
  SideNav,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from "@astryxdesign/core/SideNav";
import { Icon } from "@astryxdesign/core/Icon";
import { NavIcon } from "@astryxdesign/core/NavIcon";
import {
  CubeIcon,
  CalendarDaysIcon,
  UsersIcon,
  ClipboardDocumentListIcon,
  BeakerIcon,
  ArchiveBoxIcon,
  ArrowRightStartOnRectangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  QuestionMarkCircleIcon,
} from "@heroicons/react/24/outline";
import { VStack, HStack, Text, Banner, ServerForm } from "../ui";
import { useApp } from "../router";
import Walkthrough, { canStartTour } from "../Walkthrough";
export default function Shell({ children }: { children: ReactNode }) {
  const { page, revision, busy, error, leaveAndSubmit } = useApp();
  const [tourRequest, setTourRequest] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastPath = useRef(page.url.split("?")[0]);
  const pathChanged = lastPath.current !== page.url.split("?")[0];
  useContentMotion(contentRef, revision, pathChanged ? "page" : "fade");
  useLayoutEffect(() => {
    lastPath.current = page.url.split("?")[0];
  }, [revision, page.url]);
  const [showProgress, setShowProgress] = useState(false);
  useEffect(() => {
    if (!busy) {
      setShowProgress(false);
      return;
    }
    const timer = window.setTimeout(() => setShowProgress(true), 180);
    return () => window.clearTimeout(timer);
  }, [busy]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const sidebarWidth = useRef<number | null>(null);
  const changeCollapsed = (collapsed: boolean) => {
    sidebarWidth.current =
      document.getElementById("workspace-navigation")?.getBoundingClientRect()
        .width ?? null;
    setIsCollapsed(collapsed);
  };
  useLayoutEffect(() => {
    const nav = document.getElementById("workspace-navigation");
    if (!nav || sidebarWidth.current === null) return;
    const width = nav.getBoundingClientRect().width;
    const animation = playMotion(nav, [
      { width: `${sidebarWidth.current}px`, overflow: "clip" },
      { width: `${width}px`, overflow: "clip" },
    ]);
    sidebarWidth.current = null;
    return () => animation?.cancel();
  }, [isCollapsed]);
  const collapseButtonRef = useRef<HTMLButtonElement>(null);
  const path = page.url.split("?")[0];
  const accountName = page.user?.name || "Pengguna";
  const roleLabel =
    page.role === "MANAGER"
      ? "Manajer"
      : page.role === "WAREHOUSE"
        ? "Tim gudang"
        : "Tim sales";
  const toggleLabel = isCollapsed ? "Buka sidebar" : "Ringkas sidebar";
  const collapseButton = (
    <IconButton
      ref={collapseButtonRef}
      label={toggleLabel}
      tooltip={toggleLabel}
      size="sm"
      variant="secondary"
      icon={<Icon icon={isCollapsed ? ChevronRightIcon : ChevronLeftIcon} />}
      aria-expanded={!isCollapsed}
      aria-controls="workspace-navigation"
      onClick={() => {
        changeCollapsed(!isCollapsed);
        // Resizable SideNav remounts its frame when collapsed; retain keyboard focus.
        requestAnimationFrame(() => collapseButtonRef.current?.focus());
      }}
    />
  );
  const logoutButton = (
    <ServerForm
      action="/logout/"
      onSubmit={(data) => void leaveAndSubmit("/logout/", data)}
    >
      <IconButton
        type="submit"
        label="Keluar dari akun"
        tooltip="Keluar dari akun"
        icon={<Icon icon={ArrowRightStartOnRectangleIcon} />}
        variant="secondary"
        size="sm"
        isDisabled={busy}
      />
    </ServerForm>
  );
  return (
    <>
      <AppShell
        contentPadding={0}
        height="fill"
        sideNav={
          <SideNav
            id="workspace-navigation"
            collapsible={{
              isCollapsed,
              onCollapsedChange: changeCollapsed,
              hasButton: false,
            }}
            resizable
            header={
              isCollapsed ? (
                <VStack gap={2} hAlign="center">
                  {collapseButton}
                  <SideNavHeading
                    heading="OneFlow"
                    headingHref="/"
                    icon={<NavIcon icon={<Icon icon={CubeIcon} />} />}
                  />
                </VStack>
              ) : (
                <HStack gap={1} vAlign="center">
                  <StackItem size="fill">
                    <SideNavHeading
                      heading="OneFlow"
                      headingHref="/"
                      subheading={page.demo ? "Workspace demo" : undefined}
                      icon={<NavIcon icon={<Icon icon={CubeIcon} />} />}
                    />
                  </StackItem>
                  <StackItem>{collapseButton}</StackItem>
                </HStack>
              )
            }
            footer={
              isCollapsed ? (
                <VStack gap={3} hAlign="center" paddingBlock={2}>
                  <Avatar
                    name={accountName}
                    size="sm"
                    tooltip={`${accountName} · ${roleLabel}`}
                  />
                  {logoutButton}
                </VStack>
              ) : (
                <Card padding={2}>
                  <HStack gap={2} vAlign="center">
                    <StackItem>
                      <Avatar name={accountName} size="md" tooltip={false} />
                    </StackItem>
                    <StackItem size="fill">
                      <VStack gap={0.5}>
                        <Text weight="semibold" maxLines={1}>
                          {accountName}
                        </Text>
                        <Text type="supporting" maxLines={1}>
                          {roleLabel}
                        </Text>
                      </VStack>
                    </StackItem>
                    <StackItem>{logoutButton}</StackItem>
                  </HStack>
                </Card>
              )
            }
          >
            <SideNavSection title="Workspace">
              <SideNavItem
                data-tour="nav-dashboard"
                label="Dashboard"
                icon={CalendarDaysIcon}
                href="/"
                isSelected={path === "/"}
              />
              {page.role !== "WAREHOUSE" && (
                <SideNavItem
                  data-tour="nav-customers"
                  label="Pelanggan"
                  icon={UsersIcon}
                  href="/customers/"
                  isSelected={
                    path.startsWith("/customers") ||
                    path.startsWith("/activities")
                  }
                />
              )}
              <SideNavItem
                data-tour="nav-orders"
                label="Pesanan"
                icon={ClipboardDocumentListIcon}
                href="/orders/"
                isSelected={path.startsWith("/orders")}
              />
              <SideNavItem
                label="Pengajuan sampel"
                icon={BeakerIcon}
                data-tour="nav-samples"
                href="/samples/"
                isSelected={path.startsWith("/samples")}
              />
              <SideNavItem
                data-tour="nav-stock"
                label="Produk & stok"
                icon={ArchiveBoxIcon}
                href="/stock/"
                isSelected={
                  path.startsWith("/stock") || path.startsWith("/products")
                }
              />
            </SideNavSection>
            <SideNavSection title="Bantuan">
              <SideNavItem
                data-tour="help"
                label="Panduan aplikasi"
                icon={QuestionMarkCircleIcon}
                isDisabled={busy || !canStartTour(page.screen)}
                onClick={() => {
                  changeCollapsed(false);
                  setTourRequest((v) => v + 1);
                }}
              />
            </SideNavSection>
          </SideNav>
        }
        banner={
          error ? (
            <Banner status="error" title={error} container="section" />
          ) : undefined
        }
      >
        <VStack
          ref={contentRef}
          height="100%"
          gap={0}
          aria-busy={busy}
          style={{ position: "relative" }}
        >
          {busy && showProgress && (
            <VStack
              style={{
                position: "absolute",
                insetInline: 0,
                top: 0,
                zIndex: 1,
                pointerEvents: "none",
              }}
            >
              <ProgressBar
                label="Memperbarui halaman"
                isLabelHidden
                isIndeterminate
                variant="neutral"
              />
            </VStack>
          )}
          {page.messages.map((m, i) => (
            <Banner
              key={i}
              status={m.type === "error" ? "error" : "success"}
              title={m.text}
              container="section"
            />
          ))}
          {children}
        </VStack>
      </AppShell>
      <Walkthrough
        key={`${page.user?.id}:${page.role}`}
        request={tourRequest}
      />
    </>
  );
}
