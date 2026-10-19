/**
 * Request headers that carry a secret and must never reach the log: the
 * bearer token, cookies, and the export build token (x-export-token is the
 * only credential for GET /v1/export).
 */
export const LOG_REDACT_PATHS = [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-export-token"]',
];
