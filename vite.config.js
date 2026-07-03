import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Serves ../unit_images at /unit-img/* during `vite dev` ONLY. Those images
// are deliberately kept out of web/public (2800+ units x up to 3 art tiers +
// icon + sprite is multiple GB -- too big to publish/commit to GitHub Pages).
// This lets the local dev server render them without ever touching the built
// site output.
const CONTENT_TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
function serveUnitImages(base) {
  const root = path.resolve(__dirname, "../unit_images");
  return {
    name: "serve-unit-images",
    configureServer(server) {
      server.middlewares.use(`${base}unit-img`, (req, res, next) => {
        const rel = decodeURIComponent(req.url.split("?")[0]);
        const filePath = path.join(root, rel);
        if (!filePath.startsWith(root)) return next();
        fs.stat(filePath, (err, stat) => {
          if (err || !stat.isFile()) return next();
          const ext = path.extname(filePath);
          res.setHeader("Content-Type", CONTENT_TYPES[ext] || "application/octet-stream");
          fs.createReadStream(filePath).pipe(res);
        });
      });
    },
  };
}

const BASE = "/Aigis-Enemy/";

export default defineConfig({
  plugins: [react(), serveUnitImages(BASE)],
  // Project site served under https://altterisk.github.io/Aigis-Enemy/
  base: BASE,
});
