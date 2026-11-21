// Copyright (c) Meta Platforms, Inc. and affiliates.
// Adapted from Astryx 0.7.0 shell-side-nav: application frame and navigation.
import { useToast } from "@/kit";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { BrandMark } from "../BrandMark";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { MotionStack, playMotion, useContentMotion } from "../motion";
import { ProgressBar } from "@/kit";
import { VisuallyHidden } from "@/kit";
import { RequestFeedback, usePendingFeedback } from "../RequestFeedback";
import { AppShell } from "@astryxdesign/core/AppShell";
import { Avatar } from "@/kit";
import { Card } from "@/kit";
import { IconButton } from "@/kit";
import { Tooltip } from "@/kit";
import { StackItem } from "@/kit";
import {
  SideNav,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from "@astryxdesign/core/SideNav";
import { Icon } from "@/kit";
import { NavIcon } from "@astryxdesign/core/NavIcon";
import {
  CalendarDaysIcon,
  UsersIcon,
  ClipboardDocumentListIcon,
  BeakerIcon,
  ArchiveBoxIcon,
  DocumentDuplicateIcon,
  ArrowRightStartOnRectangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  QuestionMarkCircleIcon,
} from "@heroicons/react/24/outline";
import {
  Button,
  VStack,
  HStack,
  Text,
  Banner,
  ServerForm,
  useResponsive,
} from "../ui";
import { useApp } from "../router";
import Walkthrough, { canStartTour } from "../Walkthrough";
import { ThemeSwitch } from "../ThemeSwitch";

function SidebarItem({
  label,
  tooltip,
  icon,
  href,
  isSelected,
  isDisabled,
  onClick,
  collapsed,
  isMobile,
  tourId,
}: {
  label: string;
  tooltip: string;
  icon: typeof CalendarDaysIcon;
  href?: string;
  isSelected?: boolean;
  isDisabled?: boolean;
  onClick?: () => void;
  collapsed: boolean;
  isMobile: boolean;
  tourId?: string;
}) {
  if (collapsed) {
    return (
      <Tooltip
        content={`${label} — ${tooltip}`}
        placement="end"
        touchTrigger="none"
        hasHoverIndication={false}
      >
        <VStack hAlign="center">
          <Button
            data-tour={tourId}
            isIconOnly
            size="md"
            variant={isSelected ? "primary" : "ghost"}
            label={label}
            icon={<Icon icon={icon} />}
            href={href}
            isDisabled={isDisabled}
            onClick={onClick}
          />
        </VStack>
      </Tooltip>
    );
  }
  return (
    <Tooltip
      content={tooltip}
      placement="end"
      touchTrigger="none"
      hasHoverIndication={false}
      isEnabled={!isMobile}
    >
      <SideNavItem
        data-tour={tourId}
        label={label}
        icon={icon}
        href={href}
        isSelected={isSelected}
        isDisabled={isDisabled}
        onClick={onClick}
      />
    </Tooltip>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const { page, revision, busy, issue, requestKind, leaveAndSubmit } = useApp();
  const { isMobile } = useResponsive();
  const [tourRequest, setTourRequest] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  // Successful saves confirm themselves in a toast and never push content down.
  useEffect(() => {
    for (const message of page.messages)
      if (message.type === "success")
        toast({
          body: (
            <HStack gap={2} vAlign="center">
              <Icon icon={CheckCircleIcon} color="success" />
              <Text>{message.text}</Text>
            </HStack>
          ),
        });
  }, [revision]);
  const path = page.url.split("?")[0];
  useContentMotion(contentRef, `${page.screen}:${path}`, "page");
  const pendingStage = usePendingFeedback(busy);
  const pendingLabel =
    requestKind === "write" ? "Menyimpan perubahan" : "Memuat halaman";
  const slowLabel =
    requestKind === "write"
      ? "Masih menunggu konfirmasi. Jangan kirim ulang atau tutup halaman."
      : "Memuat lebih lama dari biasanya. Halaman sebelumnya tetap tersedia.";
  const [isCollapsed, setIsCollapsed] = useState(false);
  const collapsed = !isMobile && isCollapsed;
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
      />
    </ServerForm>
  );
  return (
    <>
      <AppShell
        contentPadding={0}
        height="fill"
        mobileNav={{ breakpoint: "md" }}
        sideNav={
          <SideNav
            id="workspace-navigation"
            collapsible={{
              isCollapsed: !isMobile && isCollapsed,
              onCollapsedChange: changeCollapsed,
              hasButton: false,
            }}
            resizable={!isMobile}
            header={
              !isMobile && isCollapsed ? (
                <VStack gap={2} hAlign="center">
                  {collapseButton}
                  <SideNavHeading
                    heading="OneFlow"
                    headingHref="/"
                    icon={<NavIcon icon={<Icon icon={BrandMark} />} />}
                  />
                </VStack>
              ) : (
                <HStack gap={1} vAlign="center">
                  <StackItem size="fill">
                    <SideNavHeading
                      heading="OneFlow"
                      headingHref="/"
                      subheading={page.demo ? "Workspace demo" : undefined}
                      icon={<NavIcon icon={<Icon icon={BrandMark} />} />}
                    />
                  </StackItem>
                  {!isMobile && <StackItem>{collapseButton}</StackItem>}
                </HStack>
              )
            }
            footer={
              !isMobile && isCollapsed ? (
                <VStack gap={3} hAlign="center" paddingBlock={2}>
                  <ThemeSwitch compact />
                  <Avatar
                    name={accountName}
                    size="sm"
                    tooltip={`${accountName} · ${roleLabel}`}
                  />
                  {logoutButton}
                </VStack>
              ) : (
                <VStack gap={2}>
                  <HStack paddingInline={2} paddingBlock={1}>
                    <ThemeSwitch spread />
                  </HStack>
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
                </VStack>
              )
            }
          >
            <SideNavSection title="Workspace">
              <SidebarItem
                tourId="nav-dashboard"
                label="Dashboard"
                tooltip="Ringkasan kerja harian, prioritas & pantauan apotek"
                icon={CalendarDaysIcon}
                href="/"
                isSelected={path === "/"}
                collapsed={collapsed}
                isMobile={isMobile}
              />
              {page.role !== "WAREHOUSE" && (
                <SidebarItem
                  tourId="nav-customers"
                  label="Pelanggan"
                  tooltip="Daftar apotek & mitra, aktivitas, serta stok titipan"
                  icon={UsersIcon}
                  href="/customers/"
                  isSelected={
                    path.startsWith("/customers") ||
                    path.startsWith("/activities")
                  }
                  collapsed={collapsed}
                  isMobile={isMobile}
                />
              )}
              <SidebarItem
                tourId="nav-orders"
                label="Pesanan"
                tooltip="Daftar pesanan, konfirmasi, dan status pengiriman"
                icon={ClipboardDocumentListIcon}
                href="/orders/"
                isSelected={path.startsWith("/orders")}
                collapsed={collapsed}
                isMobile={isMobile}
              />
              <SidebarItem
                tourId="nav-samples"
                label="Pengajuan sampel"
                tooltip="Pengajuan, pengiriman & hasil evaluasi sampel"
                icon={BeakerIcon}
                href="/samples/"
                isSelected={path.startsWith("/samples")}
                collapsed={collapsed}
                isMobile={isMobile}
              />
              <SidebarItem
                tourId="nav-stock"
                label="Produk & stok"
                tooltip="Stok produk gudang, pengadaan & riwayat mutasi"
                icon={ArchiveBoxIcon}
                href="/stock/"
                isSelected={
                  path.startsWith("/stock") || path.startsWith("/products")
                }
                collapsed={collapsed}
                isMobile={isMobile}
              />
              {page.data.can_view_company_archive && (
                <SidebarItem
                  label="Data perusahaan"
                  tooltip="Laporan dan dokumen asli CV Arba’in"
                  icon={DocumentDuplicateIcon}
                  href="/company-data/"
                  isSelected={path === "/company-data/"}
                  collapsed={collapsed}
                  isMobile={isMobile}
                />
              )}
            </SideNavSection>
            <SideNavSection title="Bantuan">
              <SidebarItem
                tourId="help"
                label="Panduan aplikasi"
                tooltip={
                  canStartTour(page.screen)
                    ? "Buka tur interaktif cara memakai halaman ini"
                    : "Tur tersedia di Dashboard, Pelanggan, Pesanan, Sampel & Stok"
                }
                icon={QuestionMarkCircleIcon}
                isDisabled={!canStartTour(page.screen)}
                collapsed={collapsed}
                isMobile={isMobile}
                onClick={() => {
                  changeCollapsed(false);
                  setTourRequest((v) => v + 1);
                }}
              />
            </SideNavSection>
          </SideNav>
        }
        banner={
          issue ? (
            <RequestFeedback container="section" />
          ) : pendingStage === "slow" ? (
            <MotionStack gap={0} preset="expand" role="status">
              <Banner
                container="section"
                status="info"
                title={pendingLabel}
                description={slowLabel}
              />
            </MotionStack>
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
          {pendingStage !== "idle" && (
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
                label={pendingLabel}
                isLabelHidden
                isIndeterminate
                variant="neutral"
              />
            </VStack>
          )}
          {page.messages.map((m, i) =>
            m.type === "success" ? null : (
            <Banner
              key={`${revision}:${i}`}
              status={
                m.type === "error"
                  ? "error"
                  : m.type === "warning"
                    ? "warning"
                    : m.type === "info"
                      ? "info"
                      : "success"
              }
              title={m.text}
              container="section"
              role={m.type === "error" ? "alert" : "status"}
              isDismissable={m.type !== "error"}
              dismissLabel="Tutup pemberitahuan"
            />
            ),
          )}
          {children}
        </VStack>
      </AppShell>
      <VisuallyHidden role="status">
        {pendingStage === "loading" ? pendingLabel : ""}
      </VisuallyHidden>
      <Walkthrough
        key={`${page.user?.id}:${page.role}`}
        request={tourRequest}
      />
    </>
  );
}
