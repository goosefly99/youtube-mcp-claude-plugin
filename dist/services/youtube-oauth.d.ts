/**
 * OAuth 2.0 service for YouTube Data API v3 write operations.
 *
 * Reads a token.json file produced by google-auth-oauthlib (Python) or any
 * compatible OAuth 2.0 client. Refreshes the access token automatically when
 * it is expired and writes the updated token back to disk.
 *
 * Configure via the YOUTUBE_OAUTH_TOKEN_PATH environment variable.
 */
/**
 * Make an authenticated GET request to the YouTube Data API v3.
 */
export declare function fetchOAuthApi(endpoint: string, params: Record<string, string>): Promise<Record<string, unknown>>;
/**
 * Make an authenticated POST/PUT/DELETE request to the YouTube Data API v3.
 */
export declare function mutateOAuthApi(method: "POST" | "PUT" | "DELETE", endpoint: string, params: Record<string, string>, body?: unknown): Promise<Record<string, unknown> | null>;
