import {
  checkFetchDest,
  createErrorResponse,
  API_SECURITY_HEADERS,
  setCorsHeaders
} from '../worker-utils.js';

/**
 * Handle Config Request
 * Securely returns public tokens (like Mapbox) to the frontend without exposing them in source code.
 */
export function handleConfigRequest(request, env) {
  // SEC: Ensure request is not from a script tag (XSSI protection)
  if (!checkFetchDest(request)) {
    return createErrorResponse(request, 403, 'Invalid fetch destination');
  }

  const configBody = JSON.stringify({
    mapboxToken: env.MAPBOX_ACCESS_TOKEN || ''
  });

  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=86400', // Cache config for 24h
    ...API_SECURITY_HEADERS
  });

  setCorsHeaders(headers, request);

  return new Response(configBody, {
    status: 200,
    headers
  });
}
