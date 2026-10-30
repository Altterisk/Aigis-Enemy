// `vite build` only: writes a static HTML file per list page (dist/units.html
// is served at /units) with its own title, description, canonical, Open Graph
// tags and a plain-HTML summary inside #root, which React replaces on load.
// Crawlers and link previews that don't run JavaScript see the page, not an
// empty shell. Also writes sitemap.xml; robots.txt is static in public/.
//
// Unit and tag pages get no file: Cloudflare Pages caps a deployment at 20,000
// files and public/ alone holds ~18,300. They are served by the SPA fallback
// (index.html), set their meta at runtime and are listed in the sitemap.
// Stage and enemy pages are left out of the sitemap.
import fs from "node:fs";
import path from "node:path";
import { escapeHtml as esc } from "@altterisk/game-hub/meta";
import { prerenderPlugin } from "@altterisk/game-hub/build";
import { LIST_META, SITE_NAME, canonicalUrl, site, sitePath } from "./src/meta.ts";

/** Cloudflare Pages' limit is 20,000; warn while there is still room. */
const FILE_BUDGET = 19_000;
/** public/ folders that are gitignored and untracked, so never deployed. */
const LOCAL_ONLY = ["sprite-anim", "talk-face"];

const a = (href, label) => `<a href="${esc(sitePath(href))}">${esc(label)}</a>`;
const ul = (items) => (items.length ? `<ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul>` : "");

function page(p, body = "") {
  const meta = LIST_META[p];
  const crumbs = [{ name: meta.title, path: p }];
  return {
    path: p,
    tags: site.headTags({ ...meta, jsonLd: site.breadcrumbLd(crumbs) }, canonicalUrl(p)),
    body: `<div class="prerender"><h1>${esc(meta.title || SITE_NAME)}</h1><p>${esc(meta.description)}</p>${body}</div>`,
  };
}

function pages({ publicDir }) {
  const read = (name) => JSON.parse(fs.readFileSync(path.join(publicDir, "data", `${name}.json`), "utf8"));
  const units = read("units");
  const unitLabel = (u) => [u.name_en || u.name || `Unit #${u.id}`, u.name_en && u.name].filter(Boolean).join(" · ");

  const list = [
    page("/units", ul(units.map((u) => a(`/units/${u.id}`, unitLabel(u))))),
    ...["/stages", "/enemies", "/collection", "/buffs", "/costgen", "/dps", "/weather", "/artists"].map((p) => page(p)),
  ];

  // served by the SPA fallback: in the sitemap only
  const tags = [...new Set(units.flatMap((u) => u.tags ?? []))];
  const extra = [...units.map((u) => `/units/${u.id}`), ...tags.map((t) => `/tags/${t}`)];
  return { pages: list, extraUrls: extra.map(canonicalUrl) };
}

export const prerender = () => prerenderPlugin({
  pages,
  url: canonicalUrl,
  origin: site.url,
  robots: false,
  fileBudget: FILE_BUDGET,
  localOnly: LOCAL_ONLY,
});
