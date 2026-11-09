import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const server = "http://localhost:3701";

export default defineConfig({
  plugins: [react()],
  // Alias khai báo một lần ở tsconfig.json (paths), Vite đọc lại từ đó
  resolve: { tsconfigPaths: true },
  server: { proxy: { "/api": server, "/aws": server } },
});
