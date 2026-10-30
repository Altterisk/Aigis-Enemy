// `vite build` only: writes a static HTML file per list page (dist/units.html
// is served at /units) with its own title, description, canonical, Open Graph
// tags and a plain-HTML summary inside #root, which React replaces on load.
// Crawlers and link previews that don't run JavaScript see the page, not an
// empty shell. Also writes sitemap.xml.
//
// Unit and tag pages get no file: Cloudflare Pages caps a deployment at 20,000
// files and public/ alone holds ~18,300. They are served by the SPA fallback
// (index.html), set their meta at runtime and are listed in the sitemap.
// Stage and enemy pages are left out of the sitemap.
import fs from "node:fs";
import path from "node:path";
import { LIST_META, SITE_NAME, SITE_URL, canonicalUrl, fullTitle, sitePath } from "./src/meta.ts";

/** Cloudflare Pages' limit is 20,000; warn while there is still room. */
const FILE_BUDGET = 19_000;
/** public/ folders that are gitignored and untracked, so never deployed. */
const LOCAL_ONLY = ["sprite-anim", "talk-face"];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const a = (href, label) => `<a href="${esc(sitePath(href))}">${esc(label)}</a>`;
const ul = (items) => (items.length ? `<ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul>` : "");

function pages(data) {
  const read = (name) => JSON.parse(fs.readFileSync(path.join(data, `${name}.json`), "utf8"));
  const units = read("units");
  const unitLabel = (u) => [u.name_en || u.name || `Unit #${u.id}`, u.name_en && u.name].filter(Boolean).join(" · ");

  const files = [];
  const list = (p, body = "") => files.push({ path: p, meta: LIST_META[p], crumbs: [[LIST_META[p].title, p]], body });

  list("/units", ul(units.map((u) => a(`/units/${u.id}`, unitLabel(u)))));
  list("/stages");
  for (const p of ["/enemies", "/collection", "/buffs", "/costgen", "/dps", "/weather", "/artists"]) list(p);

  // served by the SPA fallback: in the sitemap only
  const tags = [...new Set(units.flatMap((u) => u.tags ?? []))];
  const extra = [...units.map((u) => `/units/${u.id}`), ...tags.map((t) => `/tags/${t}`)];
  return { files, extra };
}

function render(template, page, publicDir) {
  const { meta } = page;
  const url = canonicalUrl(page.path);
  const title = fullTitle(meta.title);
  const image = SITE_URL + (meta.image && fs.existsSync(path.join(publicDir, meta.image)) ? meta.image : "/favicon.png");
  const ld = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: page.crumbs.map(([name, p], i) => ({ "@type": "ListItem", position: i + 1, name, item: canonicalUrl(p) })),
  };
  const head = [
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`,
  ].join("\n    ");
  const crumbs = page.crumbs.length > 1
    ? `<nav aria-label="Breadcrumb">${page.crumbs.slice(0, -1).map(([l, p]) => a(p, l)).join(" › ")}</nav>` : "";
  const body = `<div class="prerender">${crumbs}<h1>${esc(meta.title || SITE_NAME)}</h1><p>${esc(meta.description)}</p>${page.body}</div>`;
  const out = template
    .replace(/<title>.*?<\/title>/s, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content=".*?" \/>/s, `<meta name="description" content="${esc(meta.description)}" />`)
    .replace(/<meta property="og:title" content=".*?" \/>/s, `<meta property="og:title" content="${esc(title)}" />`)
    .replace(/<meta property="og:description" content=".*?" \/>/s, `<meta property="og:description" content="${esc(meta.description)}" />`)
    .replace(/<meta property="og:image" content=".*?" \/>/s, `<meta property="og:image" content="${esc(image)}" />`)
    .replace("</head>", `  ${head}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`);
  if (!out.includes(body)) throw new Error('prerender: index.html has no empty <div id="root"></div>');
  return out;
}

const countFiles = (dir, skip = []) =>
  fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) =>
    skip.includes(e.name) ? n : n + (e.isDirectory() ? countFiles(path.join(dir, e.name)) : 1), 0);

export function prerender() {
  let outDir = "";
  let publicDir = "";
  return {
    name: "prerender",
    apply: "build",
    configResolved(c) {
      outDir = path.resolve(c.root, c.build.outDir);
      publicDir = c.publicDir;
    },
    closeBundle() {
      const template = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
      const { files, extra } = pages(path.join(publicDir, "data"));
      for (const page of files) {
        const file = path.join(outDir, ...page.path.slice(1).split("/")) + ".html";
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, render(template, page, publicDir));
      }
      const urls = [...files.map((p) => p.path), ...extra].map((p) => `<url><loc>${esc(canonicalUrl(p))}</loc></url>`);
      fs.writeFileSync(path.join(outDir, "sitemap.xml"),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`);
      const total = countFiles(outDir, LOCAL_ONLY);
      console.log(`prerender: ${files.length} pages, ${urls.length} URLs in sitemap.xml, ${total} deployed files in ${path.basename(outDir)}`);
      if (total > FILE_BUDGET) console.warn(`prerender: ${total} files is close to Cloudflare Pages' 20,000-file limit`);
    },
  };
}
