import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // In development the page comes from Vite and API calls go to FastAPI.
    proxy: { "/api": "http://localhost:8000" },
  },
});
