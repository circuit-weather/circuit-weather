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
      // Note: Branch coverage may vary slightly between local and CI environments
      // due to V8 engine differences. Thresholds are ratcheted to match CI results.
      thresholds: {
        lines: 95.10,
        functions: 98.11,
        branches: 93.67,
        statements: 95.10,
      },
      // Report formats: text for CI logs, lcov for future GitHub integration
      reporter: ['text', 'text-summary'],
    },
  },
});
