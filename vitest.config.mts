import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    server: {
      deps: {
        inline: ["https-proxy-agent"],
      },
    },
    deps: {
      optimizer: {
        ssr: {
          include: ["https-proxy-agent"],
        },
      },
    },
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
      "scripts/**/*.test.ts",
    ],
  },
});
