import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { SITE_URL, canonicalUrl, fullTitle, type PageMeta } from "./meta";

function setHead(selector: string, create: () => HTMLElement, attr: string, value: string | null) {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (value === null) {
    el?.remove();
    return;
  }
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

const meta = (key: "name" | "property", name: string) => () => {
  const el = document.createElement("meta");
  el.setAttribute(key, name);
  return el;
};

const link = (rel: string) => () => {
  const el = document.createElement("link");
  el.setAttribute("rel", rel);
  return el;
};

/** Title, description, canonical and Open Graph tags for the current route. null leaves them as they are. */
export function usePageMeta(page: PageMeta | null) {
  const { pathname } = useLocation();
  const title = page && fullTitle(page.title);
  useEffect(() => {
    if (!page || !title) return;
    const url = page.noindex ? null : canonicalUrl(pathname);
    document.title = title;
    setHead('meta[name="description"]', meta("name", "description"), "content", page.description);
    setHead('meta[name="robots"]', meta("name", "robots"), "content", page.noindex ? "noindex" : null);
    setHead('link[rel="canonical"]', link("canonical"), "href", url);
    setHead('meta[property="og:title"]', meta("property", "og:title"), "content", title);
    setHead('meta[property="og:description"]', meta("property", "og:description"), "content", page.description);
    setHead('meta[property="og:url"]', meta("property", "og:url"), "content", url);
    setHead('meta[property="og:image"]', meta("property", "og:image"), "content", SITE_URL + (page.image ?? "/favicon.png"));
  }, [pathname, title, page?.description, page?.image, page?.noindex]);
}
