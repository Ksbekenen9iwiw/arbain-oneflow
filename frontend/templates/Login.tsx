// Copyright (c) Meta Platforms, Inc. and affiliates.
// Astryx login-split adapted to a full desktop frame and Django's two-step login.
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Center } from "@astryxdesign/core/Center";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { TextInput } from "@astryxdesign/core/TextInput";
import { InputGroup } from "@astryxdesign/core/InputGroup";
import { CubeIcon, EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import {
  VStack,
  HStack,
  StackItem,
  Text,
  Heading,
  Button,
  Banner,
  ServerForm,
} from "../ui";
import { useApp } from "../router";
import type { Field } from "../types";
import coverUrl from "../assets/arbain-honey-herbal.jpg";
import { DemoAccess } from "../DemoAccess";
import { useContentMotion } from "../motion";

const coverStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

export default function Login() {
  const { page, error, busy, submit, clearDirty } = useApp();
  const initialUsername = String(
    page.data.form.fields.find((field: Field) => field.name === "username")
      ?.value || "",
  );
  const serverErrors: string[] = page.data.form.errors.map((message: string) =>
    message.replace("nama pengguna nama pengguna", "nama pengguna"),
  );
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"username" | "password">(
    initialUsername && serverErrors.length ? "password" : "username",
  );
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showServerErrors, setShowServerErrors] = useState(true);
  const panel = useRef<HTMLDivElement>(null);
  useContentMotion(panel, step === "username" ? 0 : 1, "step");
  const inFlight = useRef(false);
  const pending = busy || checking;

  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    element
      .querySelector<HTMLInputElement>(`input[name="${step}"]`)
      ?.focus({ preventScroll: true });
  }, [step]);

  async function continueLogin(data: FormData) {
    if (inFlight.current || pending) return;
    setMessage("");
    if (step === "password") {
      if (!password) {
        setMessage("Masukkan sandi untuk melanjutkan.");
        return;
      }
      await submit(page.url, data);
      return;
    }
    if (!username.trim()) {
      setMessage("Masukkan nama pengguna Anda.");
      return;
    }
    inFlight.current = true;
    setChecking(true);
    data.set("step", "username");
    try {
      const response = await fetch(page.url, {
        method: "POST",
        body: data,
        credentials: "same-origin",
      });
      if (!response.headers.get("content-type")?.includes("application/json"))
        throw new Error();
      const result = await response.json();
      if (!response.ok) {
        setMessage(
          result.message ||
            "Sesi berakhir. Muat ulang halaman untuk melanjutkan.",
        );
        return;
      }
      setUsername(result.username);
      setStep("password");
    } catch {
      setMessage("Tidak dapat terhubung. Periksa koneksi lalu coba lagi.");
    } finally {
      inFlight.current = false;
      setChecking(false);
    }
  }

  function changeAccount() {
    setPassword("");
    setShowPassword(false);
    setMessage("");
    setShowServerErrors(false);
    clearDirty();
    setStep("username");
  }

  return (
    <Grid
      columns={{ minWidth: 360, repeat: "fit", max: 2 }}
      gap={6}
      align="stretch"
      style={
        {
          padding: "var(--spacing-6)",
          minHeight: "100dvh",
          "--size-element-lg": "calc(var(--spacing-12) + var(--spacing-2))",
        } as CSSProperties
      }
    >
      <VStack gap={8} padding={6} minHeight="calc(100dvh - var(--spacing-12))">
        <HStack gap={2} vAlign="center">
          <Icon icon={CubeIcon} />
          <Text weight="bold" size="xl">
            OneFlow
          </Text>
        </HStack>
        <StackItem size="fill">
          <Center height="100%">
            <VStack gap={8} width="100%" maxWidth="36rem" padding={4}>
              <VStack gap={3}>
                <Heading level={1} type="display-3" weight="semibold">
                  {step === "username"
                    ? "Masuk ke OneFlow"
                    : "Selamat datang kembali"}
                </Heading>
                <Text color="secondary">
                  {step === "username"
                    ? "Gunakan akun kerja CV Arbain Anda."
                    : "Masukkan sandi untuk melanjutkan pekerjaan Anda."}
                </Text>
              </VStack>
              <VStack ref={panel} gap={5} minHeight="13rem">
                <ServerForm onSubmit={(data) => void continueLogin(data)}>
                  <VStack gap={6}>
                    <input
                      type="hidden"
                      name="next"
                      value={page.data.next || ""}
                    />
                    {step === "username" ? (
                      <TextInput
                        label="Nama pengguna"
                        htmlName="username"
                        autoComplete="username"
                        size="lg"
                        value={username}
                        onChange={(value) => {
                          setUsername(value);
                          setMessage("");
                        }}
                        isReadOnly={pending}
                        isLoading={checking}
                        width="100%"
                        controlStyle={{
                          minHeight:
                            "calc(var(--spacing-12) + var(--spacing-2))",
                        }}
                        status={
                          message ? { type: "error", message } : undefined
                        }
                      />
                    ) : (
                      <>
                        <HStack gap={3} vAlign="center" justify="between">
                          <Text weight="semibold" wordBreak="break-all">
                            {username}
                          </Text>
                          <Button
                            label="Ganti akun"
                            variant="secondary"
                            size="sm"
                            isDisabled={pending}
                            onClick={changeAccount}
                          />
                        </HStack>
                        <input
                          type="hidden"
                          name="username"
                          value={username}
                          autoComplete="username"
                        />
                        <InputGroup
                          label="Sandi"
                          size="lg"
                          status={
                            message || (showServerErrors && serverErrors.length)
                              ? { type: "error", message: message || undefined }
                              : undefined
                          }
                        >
                          <TextInput
                            label="Sandi"
                            htmlName="password"
                            autoComplete="current-password"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(value) => {
                              setPassword(value);
                              setMessage("");
                              setShowServerErrors(false);
                            }}
                            isReadOnly={pending}
                            controlStyle={{
                              minHeight:
                                "calc(var(--spacing-12) + var(--spacing-2))",
                            }}
                          />
                          <IconButton
                            label={
                              showPassword
                                ? "Sembunyikan sandi"
                                : "Tampilkan sandi"
                            }
                            icon={
                              <Icon
                                icon={showPassword ? EyeSlashIcon : EyeIcon}
                              />
                            }
                            variant="secondary"
                            isDisabled={pending}
                            onClick={() => setShowPassword(!showPassword)}
                          />
                        </InputGroup>
                      </>
                    )}
                    {showServerErrors && serverErrors.length > 0 && (
                      <Banner status="error" title={serverErrors.join(" ")} />
                    )}
                    {error && <Banner status="error" title={error} />}
                    <HStack justify="end">
                      <Button
                        type="submit"
                        size="lg"
                        style={{ minWidth: "7rem" }}
                        label={step === "username" ? "Lanjut" : "Masuk"}
                        isLoading={pending}
                        isDisabled={pending}
                      />
                    </HStack>
                  </VStack>
                </ServerForm>
              </VStack>
              {page.demo && page.data.demo_accounts?.length > 0 && (
                <DemoAccess
                  accounts={page.data.demo_accounts}
                  disabled={pending}
                  onSelect={(account) => {
                    setUsername(account.username);
                    setPassword(account.password);
                    setStep("password");
                    setMessage("");
                    setShowServerErrors(false);
                    setShowPassword(false);
                    clearDirty();
                  }}
                />
              )}
            </VStack>
          </Center>
        </StackItem>
        <Text type="supporting">
          Butuh akses atau lupa sandi? Hubungi admin CV Arbain.
        </Text>
      </VStack>
      <Card
        variant="transparent"
        padding={0}
        minHeight="38rem"
        style={{ position: "relative", overflow: "hidden" }}
      >
        <img
          src={coverUrl}
          alt="Madu dan produk herbal dengan dedaunan dalam cahaya alami."
          style={coverStyle}
          fetchPriority="high"
          decoding="async"
        />
        <VStack
          gap={4}
          padding={10}
          height="100%"
          style={{
            position: "relative",
            color: "var(--color-on-dark)",
            background:
              "linear-gradient(180deg, color-mix(in srgb, var(--color-on-light) 74%, transparent), color-mix(in srgb, var(--color-on-light) 30%, transparent) 40%, transparent 65%)",
            paddingTop: "clamp(3rem, 9vh, 7rem)",
          }}
        >
          <Heading
            level={2}
            type="display-3"
            weight="semibold"
            color="inherit"
            justify="center"
            textWrap="balance"
          >
            Pelanggan, pesanan, dan stok.
            <br />
            Terhubung dalam satu alur.
          </Heading>
          <Text color="inherit" size="lg" justify="center" textWrap="balance">
            Dari kunjungan sales hingga pengiriman, setiap tim bekerja dengan
            data yang sama.
          </Text>
        </VStack>
      </Card>
    </Grid>
  );
}
