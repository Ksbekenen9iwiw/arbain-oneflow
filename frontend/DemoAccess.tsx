import { useState } from "react";
import { Card } from "@astryxdesign/core/Card";
import { List, ListItem } from "@astryxdesign/core/List";
import { VStack, HStack, Text, Button, FormDialog } from "./ui";
import type { Row } from "./types";

export function DemoAccess({
  accounts,
  onSelect,
  disabled,
}: {
  accounts: Row[];
  onSelect: (account: Row) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Row | null>(null);
  const [copied, setCopied] = useState("");
  return (
    <VStack gap={2} paddingBlockStart={3}>
      <HStack>
        <Button
          label="Akses demo untuk juri"
          variant="secondary"
          onClick={() => setOpen(true)}
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
          selected && (
            <Button
              label={`Gunakan akun ${selected.username}`}
              variant="primary"
              isDisabled={disabled}
              onClick={() => {
                onSelect(selected);
                setOpen(false);
              }}
            />
          )
        }
      >
        <VStack gap={4} paddingBlock={4}>
          <Text color="secondary">
            Setiap peran memiliki tugas dan akses berbeda. Pilih akun untuk
            melihat kredensialnya.
          </Text>
          <List hasDividers density="balanced">
            {accounts.map((account) => (
              <ListItem
                key={account.username}
                label={`${account.role} · ${account.name || account.username}`}
                description={
                  <Text type="supporting">{account.description}</Text>
                }
                endContent={
                  <Button
                    size="sm"
                    label={
                      selected?.username === account.username
                        ? "Dipilih"
                        : `Pilih ${account.username}`
                    }
                    isDisabled={disabled}
                    onClick={() => {
                      setSelected(account);
                      setCopied("");
                    }}
                  />
                }
              />
            ))}
          </List>
          {selected && (
            <Card>
              <VStack gap={2} padding={4}>
                <Text>Username: {selected.username}</Text>
                <Text wordBreak="break-all">Sandi: {selected.password}</Text>
                <HStack>
                  <Button
                    size="sm"
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
                <Text type="supporting" aria-live="polite">
                  {copied === "failed"
                    ? "Pilih dan salin teks sandi di atas jika salin otomatis tidak tersedia."
                    : "Tombol di bawah mengisi formulir. Tekan Masuk untuk melanjutkan."}
                </Text>
              </VStack>
            </Card>
          )}
        </VStack>
      </FormDialog>
    </VStack>
  );
}
