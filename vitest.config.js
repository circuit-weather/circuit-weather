import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Vitest 4 also fakes requestAnimationFrame and friends by default, which
    // replaces the rAF stubs several suites install. Keep the set Vitest 1 used.
    fakeTimers: {
      toFake: ['setTimeout', 'clearTimeout', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'Date'],
    },
    coverage: {
      provider: 'v8',
      // Only measure coverage for source files, not tests themselves
      include: [
        'src/**/*.js',
        'public/src/**/*.js',
      ],
      // Exclude entry points, config, and DOM-heavy modules that need E2E testing
      exclude: [
        'public/src/main.js',
        'public/src/config.js',
      ],
      // Coverage thresholds — CI will fail if coverage drops below these
      // Note: Branch coverage may vary slightly between local and CI environments
      // due to V8 engine differences. Thresholds are ratcheted to match CI results.
      // Vitest 4's AST-aware V8 remapping counts statements and branches more
      // strictly than Vitest 1 did, so those two were re-ratcheted on the upgrade
      // with no change to the code under test.
      thresholds: {
        lines: 99,
        statements: 98,
        functions: 95,
        branches: 92,

      },
      // Report formats: text for CI logs, lcov for future GitHub integration
      reporter: ['text', 'text-summary'],
    },
  },
});
