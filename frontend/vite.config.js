import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  envDir: "..",
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8001",
        changeOrigin: true,
      },
      "/__/auth": {
        target: "https://derma-3e199.firebaseapp.com",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
