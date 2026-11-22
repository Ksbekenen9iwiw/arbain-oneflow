import {
  Layout,
  LayoutContent,
  Pagination,
  SegmentedControl,
  SegmentedControlItem,
  TextInput,
} from "@/kit";
import { PageHeader, VStack, HStack, Text, money, quantity, useResponsive } from "../../ui";
import { backLabel, listReturn } from "../../navigation";
import { useApp, useQueryState } from "../../router";
import type { Row } from "../../types";
import { OutletsConsignmentTab } from "./OutletsConsignmentTab";
import { outletIssues } from "./OutletAttention";

const PAGE_SIZE = 25;

export default function Outlets() {
  const { page } = useApp();
  const { contentPadding, isMobile } = useResponsive();
  const outlets: Row[] = page.data.consignment_outlets || [];
  // Kept in the URL so Back from an outlet returns to the same slice of the list.
  const [query, setQuery] = useQueryState("q", "");
  const [scope, setScope] = useQueryState("scope", "attention");
  const [pageParam, setPageParam] = useQueryState("p", "1");
  const pageNumber = Number(pageParam) || 1;
  const setPageNumber = (value: number) => setPageParam(String(value));
  const back = listReturn(page.url);
  const flagged = outlets.filter((o) => outletIssues(o) > 0);
  const needle = query.trim().toLowerCase();
  const rows = (scope === "attention" && flagged.length ? flagged : outlets)
    .filter(
      (o) =>
        !needle ||
        `${o.name} ${o.code} ${o.sales_name}`.toLowerCase().includes(needle),
    )
    .sort((a, b) => outletIssues(b) - outletIssues(a));
  const sum = (key: string) =>
    outlets.reduce((total, o) => total + Number(o[key] || 0), 0);
  const deferred = sum("deferred_billing_rupiah");
  const current = Math.min(pageNumber, Math.max(1, Math.ceil(rows.length / PAGE_SIZE)));
  return (
    <Layout
      height="fill"
      header={
        <PageHeader
          back={back ? { href: back, label: backLabel(back) } : undefined}
          title="Stok outlet"
          description={`${quantity(sum("total_on_display"))} unit tersisa · ${quantity(sum("total_sold"))} terjual${deferred > 0 ? ` · Tagihan tunda ${money(deferred)}` : ""}`}
        />
      }
      content={
        <LayoutContent padding={contentPadding} data-oneflow-scroll>
          <VStack gap={4} className="oneflow-tablecard">
            <HStack gap={3} wrap="wrap" vAlign="center" hAlign="between">
              <TextInput
                label="Cari outlet"
                isLabelHidden
                placeholder="Cari outlet atau sales"
                width={isMobile ? "100%" : "18rem"}
                value={query}
                onChange={(value: string) => {
                  setQuery(value);
                  setPageNumber(1);
                }}
              />
              {flagged.length > 0 && (
                <SegmentedControl
                  label="Cakupan outlet"
                  value={scope}
                  onChange={(value) => {
                    setScope(value);
                    setPageNumber(1);
                  }}
                >
                  <SegmentedControlItem
                    value="attention"
                    label={`Perlu perhatian · ${quantity(flagged.length)}`}
                  />
                  <SegmentedControlItem
                    value="all"
                    label={`Semua · ${quantity(outlets.length)}`}
                  />
                </SegmentedControl>
              )}
            </HStack>
            <OutletsConsignmentTab
              isWarehouse={page.role === "WAREHOUSE"}
              pageUrl={page.url}
              consignmentOutlets={rows.slice(
                (current - 1) * PAGE_SIZE,
                current * PAGE_SIZE,
              )}
            />
            {rows.length > PAGE_SIZE ? (
              <Pagination
                label="Halaman outlet"
                page={current}
                pageSize={PAGE_SIZE}
                totalItems={rows.length}
                onChange={setPageNumber}
              />
            ) : (
              <Text type="supporting">{quantity(rows.length)} outlet</Text>
            )}
          </VStack>
        </LayoutContent>
      }
    />
  );
}
