import { Component, useLayoutEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import { indonesian } from "./locale";
import { Theme } from "@astryxdesign/core/theme";
import { oneflowTheme } from "./theme";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { VStack, Button, Banner, PageHeader, Text } from "./ui";
import { Router, useApp } from "./router";
import Shell from "./templates/Shell";
import Login from "./templates/Login";
import Customers from "./templates/Customers";
import CustomerDetail from "./templates/CustomerDetail";
import CrmForm from "./templates/CrmForm";
import Orders from "./templates/Orders";
import Stock from "./templates/Stock";
import ProductDetail from "./templates/ProductDetail";
import StockForm from "./templates/StockForm";
import Detail from "./templates/Detail";
import ActivityDetail from "./templates/ActivityDetail";
import Today from "./templates/Today";
import Samples from "./templates/Samples";
import SampleForm from "./templates/SampleForm";
import SampleDetail from "./templates/SampleDetail";
import FormPage from "./templates/Form";
import OrderWizard from "./templates/OrderWizard";
import type { Page } from "./types";
import { playMotion } from "./motion";
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <VStack padding={10} gap={4}>
        <Banner
          status="error"
          title="Halaman tidak berhasil ditampilkan"
          description="Muat ulang untuk mengambil data terbaru."
        />
        <Button label="Muat ulang" onClick={() => location.reload()} />
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
    const animation = playMotion(
      root.firstElementChild as HTMLElement,
      [{ opacity: 0.8 }, { opacity: 1 }],
      "fast",
    );
    return () => animation?.cancel();
  }, []);
  if (page.screen === "login") return <Login key={revision} />;
  const d = page.data;
  let content: ReactNode;
  switch (page.screen) {
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
  return (
    <Shell>
      <Boundary key={revision}>{content}</Boundary>
    </Shell>
  );
}
const initial: Page = JSON.parse(
  document.getElementById("oneflow-page")!.textContent!,
);
createRoot(document.getElementById("oneflow-root")!).render(
  <InternationalizationProvider
    locale="id-ID"
    messages={{ "id-ID": indonesian }}
  >
    <Theme theme={oneflowTheme}>
      <Router initial={initial}>
        <App />
      </Router>
    </Theme>
  </InternationalizationProvider>,
);
