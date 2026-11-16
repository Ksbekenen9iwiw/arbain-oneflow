import { Divider } from "@astryxdesign/core/Divider";
import { List, ListItem } from "@astryxdesign/core/List";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { MotionPanel } from "../../motion";
import type { Row } from "../../types";
import {
  Button,
  Fact,
  Heading,
  HStack,
  quantity,
  Status,
  Text,
  VStack,
} from "../../ui";

export function DashboardAlarmPanel({
  role,
  rawMaterialAlerts,
  productTraction,
  onHide,
  onEditRawMaterial,
  onEditDirective,
  inDialog = false,
}: {
  role: string | null;
  rawMaterialAlerts: Row[];
  productTraction: Row[];
  onHide: () => void;
  onEditRawMaterial: (material: Row) => void;
  onEditDirective: (product?: Row) => void;
  inDialog?: boolean;
}) {
  const canEditRaw = role === "MANAGER" || role === "WAREHOUSE";
  const isManager = role === "MANAGER";
  const directivesAndWeak = productTraction.filter(
    (item) =>
      item.directive ||
      item.movement === "DEAD" ||
      item.movement === "SLOW" ||
      item.movement === "FAST",
  );

  const content = (
    <VStack gap={5}>
      {!inDialog && (
        <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
          <Heading level={2}>Alarm &amp; arahan</Heading>
          <Button
            size="sm"
            variant="secondary"
            label="Sembunyikan"
            onClick={onHide}
          />
        </HStack>
      )}

      <VStack gap={3}>
        <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
          <Heading level={3}>Early warning bahan baku</Heading>
          {canEditRaw && rawMaterialAlerts.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              label="Perbarui stok"
              onClick={() => onEditRawMaterial(rawMaterialAlerts[0])}
            />
          )}
        </HStack>
        <Text type="supporting">
          Peringatan dini berdasarkan kuantitas &amp; laju produk laku keras agar
          bahan pokok tidak habis mendadak.
        </Text>
        {rawMaterialAlerts.length === 0 ? (
          <Text type="supporting">Belum ada data bahan baku.</Text>
        ) : (
          <List hasDividers density="compact">
            {rawMaterialAlerts.map((item) => (
              <ListItem
                key={item.id}
                label={`${item.name} (${item.code})`}
                description={
                  <VStack gap={2}>
                    <Status
                      value={item.severity}
                      label={item.severity_label}
                    />
                    <Text type="supporting">
                      Tersedia{" "}
                      <Text weight="semibold" hasTabularNumbers>
                        {quantity(item.on_hand)} {item.unit}
                      </Text>{" "}
                      dari kebutuhan{" "}
                      <Text weight="semibold" hasTabularNumbers>
                        {quantity(item.required_stock)} {item.unit}
                      </Text>
                    </Text>
                    <ProgressBar
                      label={`Ketersediaan ${item.name}`}
                      isLabelHidden
                      value={Math.min(100, Number(item.ratio_pct || 0))}
                      variant={
                        item.severity === "CRITICAL"
                          ? "error"
                          : item.severity === "WARNING"
                            ? "warning"
                            : "success"
                      }
                    />
                    <Text type="supporting">{item.explanation}</Text>
                    {canEditRaw && (
                      <HStack>
                        <Button
                          size="sm"
                          variant="secondary"
                          label="Sesuaikan"
                          onClick={() => onEditRawMaterial(item)}
                        />
                      </HStack>
                    )}
                  </VStack>
                }
              />
            ))}
          </List>
        )}
      </VStack>

      <Divider />

      <VStack gap={3}>
        <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
          <Heading level={3}>Arahan bawaan sales</Heading>
          {isManager && (
            <Button
              size="sm"
              variant="secondary"
              label="Atur arahan"
              onClick={() => onEditDirective()}
            />
          )}
        </HStack>
        <Text type="supporting">
          Instruksi manajer mengenai barang kurang laku yang tidak perlu
          dibawa dan produk pengganti yang harus dibawa ke apotek.
        </Text>
        {directivesAndWeak.length === 0 ? (
          <Text type="supporting">
            Belum ada arahan khusus atau barang kurang laku.
          </Text>
        ) : (
          <List hasDividers density="compact">
            {directivesAndWeak.map((item) => (
              <ListItem
                key={item.id}
                label={`${item.name} (${item.sku})`}
                description={
                  <VStack gap={2}>
                    <HStack gap={2} wrap="wrap">
                      {item.directive ? (
                        <Status
                          value={item.directive.code}
                          label={item.directive.label}
                        />
                      ) : (
                        <Status
                          value={item.movement}
                          label={item.movement_label}
                        />
                      )}
                    </HStack>
                    {item.directive ? (
                      <>
                        <Text type="supporting">{item.directive.reason}</Text>
                        {item.directive.substitute_name && (
                          <Fact label="Ganti bawa produk">
                            {item.directive.substitute_name} (
                            {item.directive.substitute_sku})
                          </Fact>
                        )}
                      </>
                    ) : (
                      <Text type="supporting">
                        Stok di apotek: {quantity(item.on_display)}{" "}
                        {item.unit} · laku 30 hari:{" "}
                        {quantity(item.consign_sold_30d)} {item.unit} (
                        {item.sell_through_pct}%).
                      </Text>
                    )}
                    {isManager && (
                      <HStack>
                        <Button
                          size="sm"
                          variant="secondary"
                          label="Ubah arahan"
                          onClick={() => onEditDirective(item)}
                        />
                      </HStack>
                    )}
                  </VStack>
                }
              />
            ))}
          </List>
        )}
      </VStack>
    </VStack>
  );

  if (inDialog) return content;
  return (
    <MotionPanel width="21rem" padding={4}>
      {content}
    </MotionPanel>
  );
}
