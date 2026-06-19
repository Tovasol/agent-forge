import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Inject the Cloudflare Web Analytics beacon ONLY when a real token is present.
// Replaces the __CF_BEACON__ marker in index.html. With no token set, the
// marker is simply removed — we never ship a broken/placeholder beacon.
function cfBeacon(token: string | undefined): Plugin {
  return {
    name: "cf-beacon",
    transformIndexHtml(html) {
      const tag = token
        ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" ` +
          `data-cf-beacon='{"token": "${token}"}'></script>`
        : "";
      return html.replace("__CF_BEACON__", tag);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), cfBeacon(env.VITE_CF_BEACON_TOKEN)],
    build: { outDir: "dist" },
  };
});
