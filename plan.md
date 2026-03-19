1. **Create `createErrorResponse` factory function in `src/worker-utils.js`**
   - The function should take `(request, status, message, additionalHeaders = {})` as parameters.
   - It will return a standard JSON response structure with `{ error: { message, status } }`.
   - It will use `getErrorHeaders(request)` for the headers and merge `additionalHeaders`.

2. **Update all instances in `src/worker.js` to use `createErrorResponse`**
   - Import `createErrorResponse` at the top of `src/worker.js`.
   - Replace all instances of `new Response(JSON.stringify({ error: ... }), { status: ..., headers: ... })` with `createErrorResponse`.
   - Ensure the plain string responses (e.g. `new Response('Leaflet fetch failed'`) are also converted to `createErrorResponse`.
   - Remove any custom JSON error structures from `cacheAndReturnError`.

3. **Run the tests and fix any failing test assertions**
   - Because the error structure changes from `{ error: 'Message' }` to `{ error: { message: 'Message', status: 404 } }` or similar, we will need to update test cases in `tests/worker.test.js` or others. We will do this carefully using grep.

4. **Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.**
