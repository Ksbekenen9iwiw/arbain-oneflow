// This small recovery script does not depend on React or the application bundle.
(() => {
  const timer = window.setTimeout(() => {
    const status = document.getElementById("oneflow-boot-status");
    const error = document.getElementById("oneflow-boot-error");
    if (status && error) {
      status.hidden = true;
      status.style.display = "none";
      error.hidden = false;
      error.style.removeProperty("display");
      error.setAttribute("role", "alert");
    }
  }, 12000);
  window.addEventListener("oneflow:ready", () => window.clearTimeout(timer), { once: true });
})();
