import { useState } from "react";
import { Avatar } from "@/kit";
import { Card } from "@/kit";
import { Divider } from "@/kit";
import { Icon } from "@/kit";
import { List, ListItem } from "@/kit";
import { Token } from "@/kit";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { VStack, HStack, Text, Button, FormDialog, useResponsive } from "./ui";
import type { Row } from "./types";

const ROLE_COLOR: Record<string, "blue" | "orange" | "green"> = {
  Sales: "blue",
  Gudang: "orange",
  Manajer: "green",
};

export function DemoAccess({
  accounts,
  onSelect,
  disabled,
}: {
  accounts: Row[];
  onSelect: (account: Row) => void;
  disabled: boolean;
}) {
  const { contentPadding, isMobile } = useResponsive();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Row | null>(accounts[0] ?? null);
  const [copied, setCopied] = useState("");

  function openDialog() {
    if (!selected && accounts.length > 0) {
      setSelected(accounts[0]);
    }
    setCopied("");
    setOpen(true);
  }

  return (
    <VStack gap={2} paddingBlockStart={3}>
      <HStack>
        <Button
          label="Akses demo untuk juri"
          variant="secondary"
          onClick={openDialog}
        />
      </HStack>
      <Text type="supporting">
        Pilih akun sales, gudang, atau manajer. Data simulasi.
      </Text>
      <FormDialog
        isOpen={open}
        onOpenChange={setOpen}
        title="Pilih akun demo"
        width="38rem"
        footer={
          <HStack gap={2} justify="end" width="100%" wrap="wrap">
            <Button
              label="Tutup"
              variant="secondary"
              width={isMobile ? "100%" : undefined}
              onClick={() => setOpen(false)}
            />
            {selected && (
              <Button
                label={`Gunakan akun ${selected.username}`}
                variant="primary"
                width={isMobile ? "100%" : undefined}
                isDisabled={disabled}
                onClick={() => {
                  onSelect(selected);
                  setOpen(false);
                }}
              />
            )}
          </HStack>
        }
      >
        <VStack gap={3} paddingInline={contentPadding} paddingBlock={3}>
          <Text color="secondary">
            Setiap peran memiliki tugas dan akses berbeda. Klik salah satu akun
            untuk melihat kredensial atau langsung mengisi formulir masuk.
          </Text>
          <List hasDividers density="balanced">
            {accounts.map((account) => {
              const isSelected = selected?.username === account.username;
              const roleColor = ROLE_COLOR[account.role] ?? "blue";
              const displayName = account.name || account.username;
              return (
                <ListItem
                  key={account.username}
                  isSelected={isSelected}
                  isDisabled={disabled}
                  onClick={() => {
                    setSelected(account);
                    setCopied("");
                  }}
                  startContent={
                    <Avatar name={displayName} size="sm" tooltip={false} />
                  }
                  label={
                    <HStack gap={2} vAlign="center" wrap="wrap">
                      <Token label={account.role} color={roleColor} size="sm" />
                      <Text weight="semibold">{displayName}</Text>
                      <Text type="supporting" color="secondary">
                        @{account.username}
                      </Text>
                    </HStack>
                  }
                  description={
                    <Text type="supporting" color="secondary">
                      {account.description}
                    </Text>
                  }
                  endContent={
                    isSelected ? (
                      <Icon icon={CheckCircleIcon} color="accent" size="md" />
                    ) : undefined
                  }
                />
              );
            })}
          </List>
          {selected && (
            <Card padding={3}>
              <VStack gap={2}>
                <HStack justify="between" vAlign="center" gap={2} wrap="wrap">
                  <Text weight="semibold">
                    Kredensial · {selected.name || selected.username}
                  </Text>
                  <Token
                    label={selected.role}
                    color={ROLE_COLOR[selected.role] ?? "blue"}
                    size="sm"
                  />
                </HStack>
                <Divider />
                <HStack justify="between" vAlign="center" gap={2} wrap="wrap">
                  <Text type="supporting" color="secondary">
                    Username
                  </Text>
                  <Text weight="semibold">{selected.username}</Text>
                </HStack>
                <HStack justify="between" vAlign="center" gap={2} wrap="wrap">
                  <VStack gap={0.5}>
                    <Text type="supporting" color="secondary">
                      Sandi
                    </Text>
                    <Text weight="semibold" wordBreak="break-all">
                      {selected.password}
                    </Text>
                  </VStack>
                  <Button
                    size="sm"
                    variant="secondary"
                    label={copied === "ok" ? "Tersalin" : "Salin sandi"}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(selected.password);
                        setCopied("ok");
                      } catch {
                        setCopied("failed");
                      }
                    }}
                  />
                </HStack>
                <Text type="supporting" color="secondary" aria-live="polite">
                  {copied === "failed"
                    ? "Salin manual teks sandi di atas jika salin otomatis tidak tersedia."
                    : `Klik "Gunakan akun ${selected.username}" di bawah untuk mengisi formulir otomatis.`}
                </Text>
              </VStack>
            </Card>
          )}
        </VStack>
      </FormDialog>
    </VStack>
  );
}
