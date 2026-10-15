import { defineConfig } from "vite";
import path from "path";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

export default defineConfig({
  envPrefix: ["VITE_", "DOMAIN_USER", "AUTH_USER", "CODE_ORG", "AUTH_CONNECTION_ID"],
  plugins: [
    react(),
    tsconfigPaths(),
    tailwindcss(),
    tanstackRouter(),
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  build: {
    sourcemap: false,

    rollupOptions: {
      output: {
        manualChunks: {
          // 💡 OPTIMIZACIÓN: Dejamos el enrutador solo para que no arrastre bloques pesados
          router: [
            "@tanstack/react-router",
          ],

          motion: [
            "framer-motion",
          ],

          charts: [
            "recharts",
          ],

         /* pdf: [
            "jspdf",
            "jspdf-autotable",
          ],*/

          ui: [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
          ],
        },
      },
    },
  },
});
