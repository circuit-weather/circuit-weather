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
        lines: 94.37,
        functions: 98.11,
        branches: 92.56,
        statements: 94.37,
      },
      // Report formats: text for CI logs, lcov for future GitHub integration
      reporter: ['text', 'text-summary'],
    },
  },
});
