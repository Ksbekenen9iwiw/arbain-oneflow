import type { ReactNode } from "react";
import { Layout, LayoutContent, Selector } from "@/kit";
import { withReturn } from "../../navigation";
import { useApp } from "../../router";
import type { Row } from "../../types";
import { Empty, HStack, Heading, Link, Text, VStack, quantity } from "../../ui";

function Share({ sold, display }: { sold: number; display: number }) {
  return (
    <div
      className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-chart-track"
      aria-hidden
    >
      {sold > 0 && (
        <span className="h-full bg-chart-9-active" style={{ flexGrow: sold }} />
      )}
      {display > 0 && (
        <span
          className="h-full bg-chart-neutral"
          style={{ flexGrow: display }}
        />
      )}
    </div>
  );
}

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-col gap-4 rounded-2xl bg-background-secondary-default p-4"
    >
      <div className="flex flex-col gap-0.5">
        <p className="text-headline-medium text-text-primary">{title}</p>
        <p className="text-body-medium text-text-secondary">{hint}</p>
      </div>
      <ul className="flex flex-col gap-3">{children}</ul>
    </section>
  );
}

function SlowRow({
  name,
  detail,
  item,
}: {
  name: ReactNode;
  detail?: string;
  item: Row;
}) {
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-body-medium">
        <span className="min-w-0 text-text-primary">
          {name}
          {detail && <span className="ms-2 text-text-tertiary">{detail}</span>}
        </span>
        <span className="shrink-0 text-text-secondary tabular-nums">
          {quantity(item.sold)} terjual · {quantity(item.on_display)} dipajang
        </span>
      </div>
      <Share sold={Number(item.sold)} display={Number(item.on_display)} />
    </li>
  );
}

/** Manager view of consignment: what is slowing down and where a product could be placed. */
export default function Attention() {
  const { page, busy, navigate } = useApp();
  const d = page.data;
  const outletLink = (id: string, name: string) => (
    <Link
      href={withReturn(`/customers/${id}/?tab=consignment`, page.url)}
      weight="semibold"
    >
      {name}
    </Link>
  );
  const empty =
    !d.slow_products.length &&
    !d.slow_outlets.length &&
    !d.opportunities.length;
  return (
    <Layout
      height="fill"
      contentWidth={1200}
      content={
        <LayoutContent padding={0} data-oneflow-scroll>
          <VStack padding={4} gap={6}>
            <HStack hAlign="between" vAlign="center" wrap="wrap" gap={4}>
              <VStack gap={2}>
                <Heading level={1}>Perlu perhatian</Heading>
                <Text color="secondary">
                  Titip jual di {d.covered_outlets} dari {d.total_outlets}{" "}
                  outlet
                </Text>
              </VStack>
              <Selector
                label="Sales"
                value={d.selected_sales}
                width="14rem"
                isDisabled={busy}
                options={[
                  { value: "", label: "Seluruh tim" },
                  ...d.sales_options,
                ]}
                onChange={(value) =>
                  navigate(value ? `/attention/?sales=${value}` : "/attention/")
                }
              />
            </HStack>
            {empty ? (
              <Empty
                kind="search"
                title="Belum ada data titip jual"
                description="Saran muncul setelah kunjungan titip jual dicatat."
              />
            ) : (
              <div className="grid items-start gap-3 lg:grid-cols-2">
                <Card
                  title="Produk melambat"
                  hint="Banyak dipajang, sedikit terjual. Tarik atau tukar varian."
                >
                  {d.slow_products.map((item: Row) => (
                    <SlowRow
                      key={item.product_id}
                      item={item}
                      name={item.name}
                      detail={`${item.outlets} outlet`}
                    />
                  ))}
                </Card>
                <Card
                  title="Outlet melambat"
                  hint="Barang menumpuk di rak. Kurangi titipan."
                >
                  {d.slow_outlets.map((item: Row) => (
                    <SlowRow
                      key={item.customer_id}
                      item={item}
                      name={outletLink(item.customer_id, item.name)}
                      detail={[item.area, item.sales_name]
                        .filter(Boolean)
                        .join(" · ")}
                    />
                  ))}
                </Card>
                {d.opportunities.length > 0 && (
                  <Card
                    title="Peluang titip"
                    hint="Laku di outlet dengan pola penjualan serupa, belum dititipkan di sini."
                  >
                    {d.opportunities.map((item: Row) => (
                      <li
                        key={item.product_id}
                        className="flex flex-col gap-0.5 text-body-medium"
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-text-primary">{item.name}</span>
                          <span className="shrink-0 text-text-secondary tabular-nums">
                            {item.outlet_count} outlet
                          </span>
                        </div>
                        <p className="text-text-tertiary">
                          {item.outlets.map((outlet: Row, index: number) => (
                            <span key={outlet.customer_id}>
                              {index > 0 && ", "}
                              {outletLink(outlet.customer_id, outlet.name)}
                            </span>
                          ))}
                          {item.outlet_count > item.outlets.length &&
                            ` dan ${item.outlet_count - item.outlets.length} lainnya`}
                        </p>
                      </li>
                    ))}
                  </Card>
                )}
              </div>
            )}
          </VStack>
        </LayoutContent>
      }
    />
  );
}
