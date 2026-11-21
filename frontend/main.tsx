import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import "./styles/globals.css";
import { I18nProvider } from "react-aria-components";
import { Toaster } from "@/components/base/toast/toast";
import { TemplateCopyProvider } from "@/components/foundations/template-copy/template-copy";
import { translateCopy } from "./locale";
import { ThemeModeProvider } from "./ThemeSwitch";
import { Layout, LayoutContent, LayoutHeader } from "@/kit";
import { Skeleton } from "@/kit";
import { VStack, Button, Banner, PageHeader, Text } from "./ui";
import { Router, useApp } from "./router";
import Shell from "./components/Shell";
import type { Page } from "./types";
import { playMotion } from "./motion";

const loaders = {
  company_archive: () => import("./routes/company/CompanyArchive"),
  login: () => import("./routes/auth/Login"),
  today: () => import("./routes/dashboard/Today"),
  customers: () => import("./routes/customers/Customers"),
  customer_detail: () => import("./routes/customers/CustomerDetail"),
  crm_form: () => import("./routes/customers/CrmForm"),
  orders: () => import("./routes/orders/Orders"),
  stock: () => import("./routes/stock/Stock"),
  product_detail: () => import("./routes/stock/ProductDetail"),
  stock_form: () => import("./routes/stock/StockForm"),
  order_detail: () => import("./routes/orders/Detail"),
  activity_detail: () => import("./routes/customers/ActivityDetail"),
  samples: () => import("./routes/samples/Samples"),
  sample_form: () => import("./routes/samples/SampleForm"),
  sample_detail: () => import("./routes/samples/SampleDetail"),
  form: () => import("./routes/shared/Form"),
  order_form: () => import("./routes/orders/OrderWizard"),
} as const;

const CompanyArchive = lazy(loaders.company_archive);
const Login = lazy(loaders.login);
const Today = lazy(loaders.today);
const Customers = lazy(loaders.customers);
const CustomerDetail = lazy(loaders.customer_detail);
const CrmForm = lazy(loaders.crm_form);
const Orders = lazy(loaders.orders);
const Stock = lazy(loaders.stock);
const ProductDetail = lazy(loaders.product_detail);
const StockForm = lazy(loaders.stock_form);
const Detail = lazy(loaders.order_detail);
const ActivityDetail = lazy(loaders.activity_detail);
const Samples = lazy(loaders.samples);
const SampleForm = lazy(loaders.sample_form);
const SampleDetail = lazy(loaders.sample_detail);
const FormPage = lazy(loaders.form);
const OrderWizard = lazy(loaders.order_form);

const prefetched = new Set<string>();
function prefetchLoader(key: keyof typeof loaders) {
  if (prefetched.has(key)) return;
  prefetched.add(key);
  void loaders[key]();
}

function prefetchRoute(pathname: string) {
  if (pathname === "/company-data/") return prefetchLoader("company_archive");
  if (pathname === "/") return prefetchLoader("today");
  if (pathname === "/customers/") return prefetchLoader("customers");
  if (pathname === "/orders/") return prefetchLoader("orders");
  if (pathname === "/samples/") return prefetchLoader("samples");
  if (pathname === "/stock/") return prefetchLoader("stock");
  if (pathname === "/login/") return prefetchLoader("login");
  if (
    /^\/customers\/\d+\/activities\/new\/$/.test(pathname) ||
    pathname === "/customers/new/"
  )
    return prefetchLoader("crm_form");
  if (/^\/customers\/\d+\/$/.test(pathname))
    return prefetchLoader("customer_detail");
  if (/^\/activities\/\d+\//.test(pathname))
    return prefetchLoader("activity_detail");
  if (pathname === "/orders/new/" || /^\/orders\/\d+\/edit\/$/.test(pathname))
    return prefetchLoader("order_form");
  if (/^\/orders\/\d+\/$/.test(pathname)) return prefetchLoader("order_detail");
  if (pathname === "/samples/new/" || /^\/samples\/\d+\/edit\/$/.test(pathname))
    return prefetchLoader("sample_form");
  if (/^\/samples\/\d+\/$/.test(pathname))
    return prefetchLoader("sample_detail");
  if (pathname.startsWith("/products/") || pathname.startsWith("/stock/")) {
    if (/^\/products\/\d+\/$/.test(pathname))
      return prefetchLoader("product_detail");
    return prefetchLoader("stock_form");
  }
}

function DelayedFallback() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setShown(true), 180);
    return () => window.clearTimeout(timer);
  }, []);
  if (!shown) return null;
  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader padding={6}>
          <VStack gap={3}>
            <Skeleton width="30%" height="var(--spacing-8)" />
            <Skeleton width="45%" height="var(--spacing-4)" index={1} />
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={6}>
          <VStack
            gap={4}
            role="status"
            aria-label="Memuat halaman"
            aria-busy="true"
          >
            <Skeleton height="var(--spacing-10)" />
            <Skeleton height="calc(var(--spacing-8) * 3)" index={1} />
            <Skeleton height="var(--spacing-10)" index={2} />
          </VStack>
        </LayoutContent>
      }
    />
  );
}
class Boundary extends Component<
  { children: ReactNode; resetKey?: number },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(prevProps: { resetKey?: number }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }
  render() {
    return this.state.failed ? (
      <VStack
        padding={10}
        gap={4}
        height="100%"
        vAlign="center"
        hAlign="center"
      >
        <Banner
          status="error"
          title="Halaman tidak berhasil ditampilkan"
          description="Muat ulang untuk mencoba kembali. Isian yang belum dikirim perlu diisi ulang."
          endContent={
            <Button
              label="Muat ulang"
              variant="secondary"
              onClick={() => location.reload()}
            />
          }
        />
      </VStack>
    ) : (
      this.props.children
    );
  }
}
function App() {
  const { page, revision } = useApp();
  useLayoutEffect(() => {
    window.dispatchEvent(new Event("oneflow:ready"));
    const root = document.getElementById("oneflow-root")!;
    const animation = playMotion(root, [{ opacity: 0.94 }, { opacity: 1 }], "fast");
    return () => animation?.cancel();
  }, []);
  useEffect(() => {
    if (page.screen === "login") return;
    const warm = () => {
      (["today", "customers", "orders", "samples", "stock"] as const).forEach(
        prefetchLoader,
      );
    };
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(warm, { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = globalThis.setTimeout(warm, 800);
    return () => globalThis.clearTimeout(timer);
  }, [page.screen === "login"]);
  if (page.screen === "login") {
    return (
      <Suspense fallback={null}>
        <Login key={revision} />
      </Suspense>
    );
  }
  const d = page.data;
  let content: ReactNode;
  switch (page.screen) {
    case "company_archive":
      content = <CompanyArchive />;
      break;
    case "today":
      content = <Today />;
      break;
    case "customers":
      content = <Customers />;
      break;
    case "orders":
      content = <Orders />;
      break;
    case "stock":
      content = <Stock />;
      break;
    case "product_detail":
      content = <ProductDetail />;
      break;
    case "customer_detail":
      content = <CustomerDetail />;
      break;
    case "order_detail":
      content = <Detail />;
      break;
    case "form":
    case "product_edit":
      content = d.activity ? (
        <ActivityDetail />
      ) : d.stock_form_kind ? (
        <StockForm />
      ) : d.form_kind ? (
        <CrmForm />
      ) : (
        <FormPage />
      );
      break;
    case "order_form":
      content = <OrderWizard />;
      break;
    case "samples":
      content = <Samples />;
      break;
    case "sample_form":
      content = <SampleForm />;
      break;
    case "sample_detail":
      content = <SampleDetail />;
      break;
    case "sample_policy":
      content = <FormPage />;
      break;
    default:
      content = (
        <Layout
          height="fill"
          header={
            <PageHeader
              title={d.heading || "Tindakan belum dapat diselesaikan"}
            />
          }
          content={
            <LayoutContent padding={6}>
              <VStack gap={6}>
                <Banner
                  status="error"
                  title={
                    d.error?.message ||
                    d.description ||
                    "Halaman tidak tersedia."
                  }
                />

                {page.role && (
                  <Text color="secondary">
                    Anda masuk sebagai {page.user?.name} ·{" "}
                    {page.role === "MANAGER"
                      ? "Manajer"
                      : page.role === "WAREHOUSE"
                        ? "Tim gudang"
                        : "Tim sales"}
                    .
                  </Text>
                )}
                <Button
                  href={d.back_url || "/"}
                  label={
                    d.back_url && d.back_url !== "/"
                      ? "Kembali ke halaman sebelumnya"
                      : "Kembali ke Dashboard"
                  }
                />
              </VStack>
            </LayoutContent>
          }
        />
      );
  }
  const path = page.url.split("?")[0];
  const remountOnRevision = [
    "form",
    "product_edit",
    "order_form",
    "sample_form",
    "sample_policy",
  ].includes(page.screen);
  return (
    <Shell>
      <Boundary
        key={
          remountOnRevision
            ? `${page.screen}:${path}:${revision}`
            : `${page.screen}:${path}`
        }
        resetKey={revision}
      >
        <Suspense fallback={<DelayedFallback />}>{content}</Suspense>
      </Boundary>
    </Shell>
  );
}
const initial: Page = JSON.parse(
  document.getElementById("oneflow-page")!.textContent!,
);
createRoot(document.getElementById("oneflow-root")!).render(
  <I18nProvider locale="id-ID">
    <TemplateCopyProvider translate={translateCopy}>
      <ThemeModeProvider>
        <Router initial={initial} onPrefetch={prefetchRoute}>
          <App />
        </Router>
        <Toaster aria-label="Pemberitahuan" closeLabel="Tutup" />
      </ThemeModeProvider>
    </TemplateCopyProvider>
  </I18nProvider>,
);
