import { NotFound as HubNotFound } from "@altterisk/game-hub";
import { NOT_FOUND_META } from "../meta";
import { usePageMeta } from "../usePageMeta";
import { routerLink } from "../components";

// Unknown paths: the host answers every path with index.html, so this page
// marks itself noindex.
export default function NotFound() {
  usePageMeta(NOT_FOUND_META);
  return <HubNotFound homeHref="/units" homeLabel="Back to units" renderLink={routerLink} />;
}
