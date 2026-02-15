/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [path.resolve(__dirname, "./vitest.setup.ts")],
  },
  resolve: {
    alias: [
      {
        find: "@",
        replacement: path.resolve(__dirname, "./core"),
      },
      {
        find: "@/app",
        replacement: path.resolve(__dirname, "./app"),
      },
      {
        find: "@/helpers",
        replacement: path.resolve(__dirname, "./helpers"),
      },
      {
        find: "@/styles",
        replacement: path.resolve(__dirname, "./styles"),
      },
      {
        find: "@/plane-web",
        replacement: path.resolve(__dirname, "./hw"),
      },
    ],
  },
});
