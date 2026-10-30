import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { applyHead } from "@altterisk/game-hub/meta/dom";
import { site, type PageMeta } from "./meta";

/** Title, description, canonical and Open Graph tags for the current route. null leaves them as they are. */
export function usePageMeta(page: PageMeta | null) {
  const { pathname } = useLocation();
  // useHead([]) would clear the tags a detail page set; null must not touch them
  const sig = page && JSON.stringify(site.headTags(page, page.noindex ? null : site.canonicalUrl(pathname)));
  useEffect(() => {
    if (sig) applyHead(JSON.parse(sig));
  }, [sig]);
}
