import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(__dirname, "../.."), "NEXT_PUBLIC_");
  return {
    plugins: [react()],
    base: "./",
    build: { outDir: "dist-renderer" },
    resolve: { dedupe: ["react", "react-dom"] },
    define: {
      __SUPABASE_URL__: JSON.stringify(rootEnv.NEXT_PUBLIC_SUPABASE_URL || ""),
      __SUPABASE_KEY__: JSON.stringify(rootEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ""),
    },
  };
});
