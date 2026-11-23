// Split sign-in: OneFlow card on the left, product photo on the right.
import { useLayoutEffect, useRef, useState } from "react";
import { IconEye, IconEyeOff } from "@/icons";
import { BrandMark } from "../../BrandMark";
import { Banner, Button, TextInput } from "@/kit";
import { ServerForm } from "../../ui";
import { useApp } from "../../router";
import type { Field } from "../../types";
import coverUrl from "../../assets/arbain-honey-herbal.jpg";
import { DemoAccess } from "../../DemoAccess";
import { useContentMotion } from "../../motion";
import { RequestFeedback, usePendingFeedback } from "../../RequestFeedback";
import { ThemeSwitch } from "../../ThemeSwitch";

export default function Login() {
  const { page, busy, submit, clearDirty } = useApp();
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
  const pendingStage = usePendingFeedback(pending);

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
    if (password) {
      await submit(page.url, data);
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

  const hasServerError = showServerErrors && serverErrors.length > 0;
  const Eye = showPassword ? IconEyeOff : IconEye;
  const passwordField = (
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
      status={
        (message && (step === "password" || password)) || hasServerError
          ? { type: "error", message: message || undefined }
          : undefined
      }
      endContent={
        <button
          type="button"
          aria-label={showPassword ? "Sembunyikan sandi" : "Tampilkan sandi"}
          aria-pressed={showPassword}
          disabled={pending}
          onClick={() => setShowPassword(!showPassword)}
          className="flex size-6 cursor-pointer items-center justify-center rounded-md text-foreground-icon-secondary outline-none transition-colors duration-150 hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          <Eye aria-hidden className="size-4.5" />
        </button>
      }
    />
  );

  return (
    <div className="grid min-h-dvh grid-cols-1 gap-2 bg-background-full p-2 lg:grid-cols-2">
      <div className="flex min-h-0 flex-col rounded-3xl border border-border-button-default bg-background-primary-default p-5 shadow-xs sm:p-8">
        <header className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-2lg bg-linear-to-b from-accent-400 to-accent-500 text-white shadow-nav-selected">
              <BrandMark className="size-5" />
            </span>
            <span className="text-headline-semibold text-text-primary">OneFlow</span>
          </span>
          <ThemeSwitch compact />
        </header>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="flex w-full max-w-[400px] flex-col gap-8">
            <div className="flex flex-col gap-2">
              <h1 className="text-title-1-semibold text-text-primary">Masuk ke OneFlow</h1>
              <p className="text-body-regular text-text-secondary">
                Gunakan akun kerja CV Arbain Anda.
              </p>
            </div>
            <div ref={panel}>
              <ServerForm onSubmit={(data) => void continueLogin(data)}>
                <div className="flex flex-col gap-5">
                  <input type="hidden" name="next" value={page.data.next || ""} />
                  {step === "username" ? (
                    <TextInput
                      label="Nama pengguna"
                      htmlName="username"
                      autoComplete="username"
                      value={username}
                      onChange={(value) => {
                        setUsername(value);
                        setMessage("");
                      }}
                      isReadOnly={pending}
                      status={message && !password ? { type: "error", message } : undefined}
                    />
                  ) : (
                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-background-secondary-default p-3">
                      <span className="flex min-w-0 flex-col">
                        <span className="text-caption-1-regular text-text-tertiary">
                          Masuk sebagai
                        </span>
                        <span className="text-body-semibold break-all text-text-primary">
                          {username}
                        </span>
                      </span>
                      <Button
                        label="Ganti akun"
                        variant="secondary"
                        size="sm"
                        isDisabled={pending}
                        onClick={changeAccount}
                      />
                      <input type="hidden" name="username" value={username} />
                    </div>
                  )}
                  {passwordField}
                  {hasServerError && <Banner status="error" title={serverErrors.join(" ")} />}
                  <RequestFeedback />
                  {pendingStage === "slow" && (
                    <p role="status" className="text-caption-1-regular text-text-secondary">
                      Masih menghubungkan ke OneFlow. Tunggu sebentar.
                    </p>
                  )}
                  <Button
                    type="submit"
                    label="Masuk"
                    variant="primary"
                    width="100%"
                    isLoading={pending}
                    isDisabled={pending}
                  />
                </div>
              </ServerForm>
            </div>
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
          </div>
        </div>
        <p className="text-caption-1-regular text-text-tertiary">
          Butuh akses atau lupa sandi? Hubungi admin CV Arbain.
        </p>
      </div>
      <div className="relative hidden min-h-[38rem] overflow-hidden rounded-3xl lg:block">
        <img
          src={coverUrl}
          alt="Madu dan produk herbal dengan dedaunan dalam cahaya alami."
          className="absolute inset-0 size-full object-cover"
          fetchPriority="high"
          decoding="async"
        />
        <div className="absolute inset-0 bg-linear-to-b from-black/70 via-black/25 via-45% to-transparent" />
        <div className="relative flex flex-col items-center gap-3 px-10 pt-[clamp(2rem,10vh,7rem)] text-center text-white">
          <h2 className="text-title-1-semibold text-balance">
            Pelanggan, pesanan, dan stok.
            <br />
            Terhubung dalam satu alur.
          </h2>
          <p className="max-w-md text-body-regular text-balance text-white/85">
            Dari kunjungan sales hingga pengiriman, setiap tim bekerja dengan data yang sama.
          </p>
        </div>
      </div>
    </div>
  );
}
