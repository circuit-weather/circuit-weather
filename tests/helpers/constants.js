// Shared constants for the worker test suites.
//
// PRODUCTION_DOMAIN is deliberately not exported from src/worker-utils.js (it is
// module-private there), so the tests keep their own copy. Keeping that copy in
// one place means a domain change is a two-line edit rather than a hunt through
// every worker test file.
export const PRODUCTION_DOMAIN = 'https://circuit-weather.racing';
