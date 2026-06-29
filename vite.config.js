import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Project site served under https://altterisk.github.io/Aigis-Enemy/
  base: "/Aigis-Enemy/",
});
