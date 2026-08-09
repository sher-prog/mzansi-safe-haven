import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import basicSsl from "@vitejs/plugin-basic-ssl";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    // crypto.subtle (used for PIN-derived encryption — see src/lib/crypto.ts) only
    // exists in secure contexts. Serving over a LAN IP is how this app usually gets
    // tested on a phone, and plain http on a LAN IP is NOT a secure context, so PIN
    // setup/unlock would silently fail there. `npm run dev:https` sets VITE_HTTPS=true
    // to serve a self-signed cert instead — see README's development section.
    process.env.VITE_HTTPS === "true" && basicSsl(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
