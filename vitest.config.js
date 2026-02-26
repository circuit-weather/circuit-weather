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
      ],
      // Coverage thresholds — CI will fail if coverage drops below these
      thresholds: {
        // Overall project thresholds (conservative baseline)
        lines: 63,
        functions: 72,
        branches: 81,
        statements: 63,
      },
      // Report formats: text for CI logs, lcov for future GitHub integration
      reporter: ['text', 'text-summary'],
    },
  },
});
