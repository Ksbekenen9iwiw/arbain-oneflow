import { renderToStaticMarkup } from "react-dom/server";
import { LoadingScreen } from "./Loading";

export function renderLoading(
  kind: "dashboard" | "list" | "detail" | "form" | "login",
) {
  return renderToStaticMarkup(<LoadingScreen kind={kind} />);
}
