import { renderToStaticMarkup } from "react-dom/server";
import { Theme } from "@astryxdesign/core/theme";
import { oneflowTheme } from "./theme";
import { LoadingScreen } from "./Loading";

export function renderLoading(
  kind: "dashboard" | "list" | "detail" | "form" | "login",
) {
  return renderToStaticMarkup(
    <Theme theme={oneflowTheme}>
      <LoadingScreen kind={kind} />
    </Theme>,
  );
}
