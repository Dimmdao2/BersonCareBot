import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: { "@": path.resolve(__dirname, "../../src") },
  },
  test: {
    environment: "node",
    include: ["owner-reviewed-fio-operation.test.ts"],
    maxWorkers: 1,
  },
});
