import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconBox, IconCalendar, IconFlag, IconHelp, IconLibrary, IconLogout, IconMenu, IconMoon, IconOrders, IconPlus, IconSample, IconSearch, IconSidebar, IconSparkles, IconUsers } from "@/icons";
import { BrandMark } from "../BrandMark";
import { useContentMotion } from "../motion";
import { RequestFeedback, usePendingFeedback } from "../RequestFeedback";
import {
  Avatar,
  Banner,
  Icon,
  IconButton,
  ProgressBar,
  Tooltip,
  VisuallyHidden,
  useToast,
  type IconComponent,
} from "@/kit";
import { Drawer } from "@/components/base/drawer/drawer";
import { SyncDot, SyncPanel, syncSummary, useSync } from "../SyncCenter";
import { dateLabel } from "../ui";
import Assistant from "./assistant/Assistant";
import {
  CommandPalette,
  CommandPaletteItem,
  CommandPaletteSection,
} from "@/components/base/command-palette/command-palette";
import { Kbd } from "@/components/base/kbd/kbd";
import { cx } from "@/utils/cx";
import { ServerForm, useResponsive } from "../ui";
import { useApp } from "../router";
import { useReturnHighlight } from "../continuity";
import Walkthrough, { canStartTour } from "../Walkthrough";
import { ThemeSwitch, useThemeMode } from "../ThemeSwitch";

interface NavEntry {
  id: string;
  label: string;
  hint: string;
  icon: IconComponent;
  href: string;
  isSelected: boolean;
  tourId?: string;
}

function NavItem({
  label,
  hint,
  icon: Glyph,
  href,
  isSelected,
  isDisabled,
  onClick,
  collapsed,
  tourId,
}: {
  label: string;
  hint: string;
  icon: IconComponent;
  href?: string;
  isSelected?: boolean;
  isDisabled?: boolean;
  onClick?: () => void;
  collapsed: boolean;
  tourId?: string;
}) {
  const className = cx(
    "group/nav flex h-9 items-center gap-2 overflow-hidden rounded-2lg p-2 text-start outline-none",
    "transition-[width,background-color,box-shadow] duration-300 ease-in-out",
    "focus-visible:ring-2 focus-visible:ring-border-focus-ring",
    collapsed ? "w-9" : "w-full",
    isSelected
      ? "icon-on-fill bg-linear-to-b from-accent-400 to-accent-500 shadow-nav-selected"
      : "hover:bg-background-secondary-hover",
    isDisabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
  );
  const body = (
    <>
      <Glyph
        aria-hidden
        className={cx(
          "size-5 shrink-0 transition-transform duration-200 group-active/nav:scale-90",
          isSelected ? "text-white" : "text-foreground-icon-secondary",
        )}
      />
      <span
        className={cx(
          "text-body-medium whitespace-nowrap transition-opacity duration-200",
          collapsed && "opacity-0",
          isSelected ? "text-white" : "text-text-secondary",
        )}
      >
        {label}
      </span>
    </>
  );
  const node = href ? (
    <a
      href={href}
      data-tour={tourId}
      aria-label={label}
      aria-current={isSelected ? "page" : undefined}
      className={className}
    >
      {body}
    </a>
  ) : (
    <button
      type="button"
      data-tour={tourId}
      aria-label={label}
      aria-disabled={isDisabled || undefined}
      onClick={isDisabled ? undefined : onClick}
      className={className}
    >
      {body}
    </button>
  );
  return (
    <Tooltip content={collapsed ? `${label} — ${hint}` : hint} placement="end">
      {node}
    </Tooltip>
  );
}

function SectionLabel({
  children,
  collapsed,
}: {
  children: ReactNode;
  collapsed: boolean;
}) {
  return (
    <span
      className={cx(
        "px-2 pt-3 pb-1 text-caption-1-medium whitespace-nowrap text-text-tertiary transition-opacity duration-200",
        collapsed && "opacity-0",
      )}
    >
      {children}
    </span>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const { page, revision, busy, issue, requestKind, leaveAndSubmit, navigate } =
    useApp();
  useReturnHighlight(page.url);
  const { isMobile } = useResponsive();
  const { toggleMode } = useThemeMode();
  const [tourRequest, setTourRequest] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const canAsk = (page.data.assistant_suggestions || []).length > 0;
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const syncState = useSync();
  const [isSyncOpen, setIsSyncOpen] = useState(false);
  useEffect(() => {
    const open = () => setIsSyncOpen(true);
    window.addEventListener("oneflow:queued", open);
    return () => window.removeEventListener("oneflow:queued", open);
  }, []);

  // Successful saves confirm themselves in a toast and never push content down.
  useEffect(() => {
    for (const message of page.messages)
      if (message.type === "success")
        toast({ body: message.text, status: "success" });
  }, [revision]);

  const path = page.url.split("?")[0];
  useContentMotion(contentRef, `${page.screen}:${path}`, "page");
  useEffect(() => setIsDrawerOpen(false), [page.url]);

  const pendingStage = usePendingFeedback(busy);
  const pendingLabel =
    requestKind === "write" ? "Menyimpan perubahan" : "Memuat halaman";
  const slowLabel =
    requestKind === "write"
      ? "Masih menunggu konfirmasi. Jangan kirim ulang atau tutup halaman."
      : "Memuat lebih lama dari biasanya. Halaman sebelumnya tetap tersedia.";

  const accountName = page.user?.name || "Pengguna";
  const role = page.role;
  const roleLabel =
    role === "MANAGER"
      ? "Manajer"
      : role === "WAREHOUSE"
        ? "Tim gudang"
        : "Tim sales";
  const canTour = canStartTour(page.screen);

  const nav: NavEntry[] = [
    {
      id: "/",
      label: "Dashboard",
      hint: "Ringkasan kerja harian, prioritas & pantauan apotek",
      icon: IconCalendar,
      href: "/",
      isSelected: path === "/",
      tourId: "nav-dashboard",
    },
    ...(role === "MANAGER"
      ? [
          {
            id: "/attention/",
            label: "Perlu perhatian",
            hint: "Produk dan outlet titip jual yang melambat, serta peluang",
            icon: IconFlag,
            href: "/attention/",
            isSelected: path === "/attention/",
          },
          {
            id: "/assistant/usage/",
            label: "Pemakaian AI",
            hint: "Jumlah pertanyaan Tanya OneFlow, batas, dan perkiraan biaya",
            icon: IconSparkles,
            href: "/assistant/usage/",
            isSelected: path.startsWith("/assistant/"),
          },
        ]
      : []),
    ...(role !== "WAREHOUSE"
      ? [
          {
            id: "/customers/",
            label: "Pelanggan",
            hint: "Daftar apotek & mitra, aktivitas, serta stok titipan",
            icon: IconUsers,
            href: "/customers/",
            isSelected:
              path.startsWith("/customers") || path.startsWith("/activities"),
            tourId: "nav-customers",
          },
        ]
      : []),
    {
      id: "/orders/",
      label: "Pesanan",
      hint: "Daftar pesanan, konfirmasi, dan status pengiriman",
      icon: IconOrders,
      href: "/orders/",
      isSelected: path.startsWith("/orders"),
      tourId: "nav-orders",
    },
    {
      id: "/samples/",
      label: "Pengajuan sampel",
      hint: "Pengajuan, pengiriman & hasil evaluasi sampel",
      icon: IconSample,
      href: "/samples/",
      isSelected: path.startsWith("/samples"),
      tourId: "nav-samples",
    },
    {
      id: "/stock/",
      label: "Produk & stok",
      hint: "Stok produk gudang, pengadaan & riwayat mutasi",
      icon: IconBox,
      href: "/stock/",
      isSelected: path.startsWith("/stock") || path.startsWith("/products"),
      tourId: "nav-stock",
    },
    ...(page.data.can_view_company_archive
      ? [
          {
            id: "/company-data/",
            label: "Data perusahaan",
            hint: "Laporan dan dokumen asli CV Arba’in",
            icon: IconLibrary,
            href: "/company-data/",
            isSelected: path === "/company-data/",
          },
        ]
      : []),
  ];

  // Shortcuts to the "create" flows each role actually owns.
  const actions =
    role === "WAREHOUSE"
      ? []
      : [
          { id: "/orders/new/", label: "Buat pesanan baru" },
          { id: "/customers/new/", label: "Tambah pelanggan" },
          { id: "/samples/new/", label: "Ajukan sampel" },
        ];

  const startTour = () => {
    setIsCollapsed(false);
    setIsDrawerOpen(false);
    setTourRequest((value) => value + 1);
  };
  const logout = () => {
    const data = new FormData();
    data.set("csrfmiddlewaretoken", page.csrf);
    void leaveAndSubmit("/logout/", data);
  };

  const sidebar = (collapsed: boolean, inDrawer: boolean) => (
    <div className="flex h-full min-h-0 flex-col justify-between gap-4">
      <div className="flex min-h-0 flex-col gap-3">
        <div
          className={cx(
            "flex items-center gap-2",
            collapsed ? "flex-col" : "justify-between",
          )}
        >
          <a
            href="/"
            aria-label="OneFlow, ke Dashboard"
            className="flex min-w-0 items-center gap-2.5 rounded-2lg outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-2lg bg-linear-to-b from-accent-400 to-accent-500 text-white shadow-nav-selected">
              <BrandMark className="size-5" />
            </span>
            {!collapsed && (
              <span className="flex min-w-0 flex-col">
                <span className="text-headline-semibold text-text-primary">
                  OneFlow
                </span>
                <span className="truncate text-caption-1-regular text-text-tertiary">
                  {page.demo ? "Workspace demo" : "CV Arba’in"}
                </span>
              </span>
            )}
          </a>
          {!inDrawer && (
            <IconButton
              label={collapsed ? "Buka sidebar" : "Ringkas sidebar"}
              tooltip={collapsed ? "Buka sidebar" : "Ringkas sidebar"}
              size="sm"
              variant="ghost"
              icon={<Icon icon={IconSidebar} />}
              aria-expanded={!collapsed}
              aria-controls="workspace-navigation"
              onClick={() => setIsCollapsed(!collapsed)}
            />
          )}
        </div>
        <button
          type="button"
          aria-label="Cari atau lompat ke halaman"
          onClick={() => {
            setIsDrawerOpen(false);
            setIsPaletteOpen(true);
          }}
          className={cx(
            "flex h-9 cursor-pointer items-center gap-2 overflow-hidden rounded-full bg-background-tertiary-default p-2 text-start outline-none",
            "transition-[width,background-color] duration-300 ease-in-out hover:bg-background-tertiary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            collapsed ? "w-9" : "w-full",
          )}
        >
          <IconSearch
            aria-hidden
            className="size-5 shrink-0 text-foreground-icon-secondary"
          />
          {!collapsed && (
            <>
              <span className="flex-1 text-body-medium whitespace-nowrap text-text-tertiary">
                Cari atau lompat…
              </span>
              <Kbd>Ctrl K</Kbd>
            </>
          )}
        </button>
        {canAsk && (
          <button
            type="button"
            aria-label="Tanya OneFlow"
            onClick={() => {
              setIsDrawerOpen(false);
              setIsAssistantOpen(true);
            }}
            className={cx(
              "flex h-9 shrink-0 cursor-pointer items-center gap-2 overflow-hidden rounded-full border border-separator-border p-2 text-start outline-none",
              "transition-[width,background-color] duration-300 ease-in-out hover:bg-background-tertiary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring",
              collapsed ? "w-9 justify-center" : "w-full",
            )}
          >
            <IconSparkles
              aria-hidden
              className="size-5 shrink-0 text-accent-500"
            />
            {!collapsed && (
              <span className="text-body-medium whitespace-nowrap text-text-primary">
                Tanya OneFlow
              </span>
            )}
          </button>
        )}
        <button
          type="button"
          aria-label={`Antrean sinkron: ${syncSummary(syncState).label}`}
          onClick={() => {
            setIsDrawerOpen(false);
            setIsSyncOpen(true);
          }}
          className={cx(
            "flex h-8 shrink-0 cursor-pointer items-center gap-2 overflow-hidden rounded-full px-3 text-start outline-none",
            "transition-colors hover:bg-background-tertiary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            collapsed ? "w-9 justify-center px-0" : "w-full",
          )}
        >
          <SyncDot state={syncState} />
          {!collapsed && (
            <span className="text-caption-regular whitespace-nowrap text-text-secondary">
              {syncSummary(syncState).label}
            </span>
          )}
        </button>
        <nav
          aria-label="Workspace"
          className="flex min-h-0 flex-col gap-1 overflow-y-auto"
        >
          {nav.map((item) => (
            <NavItem key={item.id} {...item} collapsed={collapsed} />
          ))}
          <SectionLabel collapsed={collapsed}>Bantuan</SectionLabel>
          <NavItem
            tourId="help"
            label="Panduan aplikasi"
            hint={
              canTour
                ? "Buka tur interaktif cara memakai halaman ini"
                : "Tur tersedia di Dashboard, Pelanggan, Pesanan, Sampel & Stok"
            }
            icon={IconHelp}
            isDisabled={!canTour}
            collapsed={collapsed}
            onClick={startTour}
          />
        </nav>
      </div>
      {collapsed ? (
        <div className="flex flex-col items-center gap-3">
          <ThemeSwitch compact />
          <Avatar
            name={accountName}
            size="sm"
            tooltip={`${accountName} · ${roleLabel}`}
          />
          {logoutButton}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="px-2">
            <ThemeSwitch />
          </div>
          <div className="flex items-center gap-2.5 rounded-2xl border border-border-button-default bg-background-primary-default p-2 shadow-xs">
            <Avatar name={accountName} size="md" tooltip={false} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-body-semibold text-text-primary">
                {accountName}
              </span>
              <span className="truncate text-caption-1-regular text-text-secondary">
                {roleLabel}
              </span>
            </span>
            {logoutButton}
          </div>
        </div>
      )}
    </div>
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
        icon={<Icon icon={IconLogout} />}
        variant="ghost"
        size="sm"
      />
    </ServerForm>
  );

  const collapsed = !isMobile && isCollapsed;
  return (
    <div className="flex h-dvh min-h-0 w-full gap-2 bg-background-full p-0 md:p-2">
      {!isMobile && (
        <aside
          id="workspace-navigation"
          className={cx(
            "oneflow-nav flex h-full shrink-0 flex-col overflow-hidden rounded-3xl border border-border-button-white bg-background-secondary-default p-3 shadow-sidebar",
            "transition-[width] duration-300 ease-in-out",
            collapsed ? "w-[62px]" : "w-64",
          )}
        >
          {sidebar(collapsed, false)}
        </aside>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {isMobile && (
          <header className="oneflow-nav flex shrink-0 items-center justify-between gap-2 border-b border-separator-border bg-background-primary-default px-3 py-2">
            <IconButton
              label="Buka menu"
              variant="ghost"
              icon={<Icon icon={IconMenu} />}
              onClick={() => setIsDrawerOpen(true)}
            />
            <a
              href="/"
              className="flex items-center gap-2 text-headline-semibold text-text-primary"
            >
              <BrandMark className="size-5 text-accent-500" />
              OneFlow
            </a>
            <div className="flex items-center">
              <button
                type="button"
                aria-label={`Antrean sinkron: ${syncSummary(syncState).label}`}
                onClick={() => setIsSyncOpen(true)}
                className="flex size-9 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
              >
                <SyncDot state={syncState} className="size-2.5" />
              </button>
              {canAsk && (
                <IconButton
                  label="Tanya OneFlow"
                  variant="ghost"
                  icon={<Icon icon={IconSparkles} />}
                  onClick={() => setIsAssistantOpen(true)}
                />
              )}
              <IconButton
                label="Cari atau lompat ke halaman"
                variant="ghost"
                icon={<Icon icon={IconSearch} />}
                onClick={() => setIsPaletteOpen(true)}
              />
            </div>
          </header>
        )}
        {(!syncState.online || page.savedAt) && (
          <div role="status" className="oneflow-enter shrink-0 pb-2">
            <Banner
              container="section"
              status="warning"
              title={`Tanpa koneksi. Data per ${dateLabel(page.savedAt || page.now, true)}, bisa sudah berubah.`}
              description="Yang kamu isi disimpan di perangkat dan dikirim saat tersambung. Stok dan status diputuskan server."
            />
          </div>
        )}
        {issue ? (
          <div className="shrink-0 pb-2">
            <RequestFeedback container="section" />
          </div>
        ) : pendingStage === "slow" ? (
          <div role="status" className="oneflow-enter shrink-0 pb-2">
            <Banner
              container="section"
              status="info"
              title={pendingLabel}
              description={slowLabel}
            />
          </div>
        ) : null}
        <main
          ref={contentRef}
          aria-busy={busy}
          className="oneflow-page relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background-primary-default md:rounded-3xl md:border md:border-border-button-default md:shadow-xs"
        >
          {pendingStage !== "idle" && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10">
              <ProgressBar label={pendingLabel} isLabelHidden isIndeterminate />
            </div>
          )}
          {page.messages.some((m) => m.type !== "success") && (
            <div className="flex shrink-0 flex-col gap-2 p-3 pb-0">
              {page.messages.map((m, i) =>
                m.type === "success" ? null : (
                  <Banner
                    key={`${revision}:${i}`}
                    status={
                      m.type === "error"
                        ? "error"
                        : m.type === "warning"
                          ? "warning"
                          : "info"
                    }
                    title={m.text}
                    role={m.type === "error" ? "alert" : "status"}
                  />
                ),
              )}
            </div>
          )}
          {children}
        </main>
      </div>
      <SyncPanel state={syncState} isOpen={isSyncOpen} onOpenChange={setIsSyncOpen} />
      {isMobile && (
        <Drawer
          placement="start"
          size="sm"
          aria-label="Menu OneFlow"
          isOpen={isDrawerOpen}
          onOpenChange={setIsDrawerOpen}
          className="p-3"
        >
          {sidebar(false, true)}
        </Drawer>
      )}
      {canAsk && (
        <Assistant isOpen={isAssistantOpen} onOpenChange={setIsAssistantOpen} />
      )}
      <CommandPalette
        isOpen={isPaletteOpen}
        onOpenChange={setIsPaletteOpen}
        aria-label="Cari atau lompat"
        placeholder="Ketik nama halaman atau tindakan…"
        emptyState="Tidak ada hasil"
        footer={false}
        onAction={(key) => {
          const id = String(key);
          if (id === "theme") toggleMode();
          else if (id === "tour") startTour();
          else if (id === "logout") logout();
          else void navigate(id);
        }}
      >
        <CommandPaletteSection title="Buka halaman">
          {nav.map((item) => (
            <CommandPaletteItem key={item.id} id={item.id} icon={item.icon}>
              {item.label}
            </CommandPaletteItem>
          ))}
        </CommandPaletteSection>
        {actions.length > 0 && (
          <CommandPaletteSection title="Tindakan cepat">
            {actions.map((item) => (
              <CommandPaletteItem key={item.id} id={item.id} icon={IconPlus}>
                {item.label}
              </CommandPaletteItem>
            ))}
          </CommandPaletteSection>
        )}
        <CommandPaletteSection title="Lainnya">
          <CommandPaletteItem id="theme" icon={IconMoon}>
            Ganti tema terang/gelap
          </CommandPaletteItem>
          {canTour && (
            <CommandPaletteItem id="tour" icon={IconHelp}>
              Panduan halaman ini
            </CommandPaletteItem>
          )}
          <CommandPaletteItem id="logout" icon={IconLogout}>
            Keluar dari akun
          </CommandPaletteItem>
        </CommandPaletteSection>
      </CommandPalette>
      <VisuallyHidden role="status">
        {pendingStage === "loading" ? pendingLabel : ""}
      </VisuallyHidden>
      <Walkthrough
        key={`${page.user?.id}:${page.role}`}
        request={tourRequest}
      />
    </div>
  );
}
