import { defineConfig } from "vite";

// The platform is designed to run full-screen on a projector-driven display.
// We bind to all interfaces so the experience can be opened from the machine
// physically wired to the projector even when developing from another device.
export default defineConfig({
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: "es2020",
  },
});
