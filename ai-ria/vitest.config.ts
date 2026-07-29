import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Several suites spawn the real CLI through tsx (cold start ~0.5s each) and
    // walk whole example projects. The 5s default is close enough to the real
    // runtime that it fails intermittently — especially on cold CI runners.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
