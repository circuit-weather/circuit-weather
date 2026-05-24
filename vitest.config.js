import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
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
        // Canvas/animation overlay — verified in-browser; its pure maths are
        // covered via utils/wind.js tests.
        'public/src/map/WindOverlay.js',
      ],
      // Coverage thresholds — CI will fail if coverage drops below these
      // Note: Branch coverage may vary slightly between local and CI environments
      // due to V8 engine differences. Thresholds are ratcheted to match CI results.
      thresholds: {
        lines: 99,
        statements: 99,
        functions: 95,
        branches: 95,

      },
      // Report formats: text for CI logs, lcov for future GitHub integration
      reporter: ['text', 'text-summary'],
    },
  },
});
