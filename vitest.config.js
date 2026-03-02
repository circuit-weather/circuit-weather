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
        lines: 93.32,
        functions: 96.81,
        branches: 92.98,
        statements: 93.32,
      },
      // Report formats: text for CI logs, lcov for future GitHub integration
      reporter: ['text', 'text-summary'],
    },
  },
});
