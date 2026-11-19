import { NotFound as HubNotFound } from "@altterisk/game-hub";
import { NOT_FOUND_META } from "../meta";
import { usePageMeta } from "../usePageMeta";
import { routerLink } from "../components";
import { useL } from "../i18n";

// Unknown paths: the host answers every path with index.html, so this page
// marks itself noindex.
export default function NotFound() {
  usePageMeta(NOT_FOUND_META);
  const L = useL();
  return (
    <HubNotFound title={L("Page not found", "ページが見つかりません")} homeHref="/units"
      homeLabel={L("Back to units", "ユニット一覧へ戻る")} renderLink={routerLink} />
  );
}
