import { renderToStaticMarkup } from "react-dom/server";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { LoadingScreen } from "./Loading";

export function renderLoading(
  kind: "dashboard" | "list" | "detail" | "form" | "login",
) {
  return renderToStaticMarkup(
    <Theme theme={neutralTheme}>
      <LoadingScreen kind={kind} />
    </Theme>,
  );
}
