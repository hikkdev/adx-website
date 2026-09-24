import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/** The website's test runner — the console's setup, without the fixture checks it does not need. */
export default defineConfig({
    oxc: { jsx: { runtime: "automatic" } },
    resolve: {
        alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: ["./vitest.setup.ts"],
        include: ["src/**/*.test.{ts,tsx}"],
        exclude: ["node_modules", ".next"],
    },
});
