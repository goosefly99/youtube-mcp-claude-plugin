/**
 * OAuth 2.0 service for YouTube Data API v3 write operations.
 *
 * Reads a token.json file produced by google-auth-oauthlib (Python) or any
 * compatible OAuth 2.0 client. Refreshes the access token automatically when
 * it is expired and writes the updated token back to disk.
 *
 * Configure via the YOUTUBE_OAUTH_TOKEN_PATH environment variable.
 */

import { readFileSync, writeFileSync } from "fs";
import { config } from "../config.js";

// Shape of a google-auth-oauthlib token.json file
interface TokenFile {
  token: string;
  refresh_token: string;
  token_uri: string;
  client_id: string;
  client_secret: string;
  scopes: string[];
  expiry: string; // ISO-8601 timestamp
}

interface RefreshResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

let cachedToken: TokenFile | null = null;

function loadToken(): TokenFile {
  if (!config.oauthTokenPath) {
    throw new Error(
      "YOUTUBE_OAUTH_TOKEN_PATH is not set. " +
        "Point it to your token.json file to enable playlist management tools."
    );
  }
  const raw = readFileSync(config.oauthTokenPath, "utf-8");
  return JSON.parse(raw) as TokenFile;
}

function isExpired(tokenFile: TokenFile): boolean {
  if (!tokenFile.expiry) return true;
  const expiry = new Date(tokenFile.expiry).getTime();
  // Treat as expired 60 seconds early to avoid edge-case failures
  return Date.now() >= expiry - 60_000;
}

async function refreshAccessToken(tokenFile: TokenFile): Promise<TokenFile> {
  const body = new URLSearchParams({
    client_id: tokenFile.client_id,
    client_secret: tokenFile.client_secret,
    refresh_token: tokenFile.refresh_token,
    grant_type: "refresh_token",
  });

  const response = await fetch(tokenFile.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${text}`);
  }

  const refreshed = (await response.json()) as RefreshResponse;
  const expiryDate = new Date(Date.now() + refreshed.expires_in * 1000);

  const updated: TokenFile = {
    ...tokenFile,
    token: refreshed.access_token,
    expiry: expiryDate.toISOString(),
  };

  writeFileSync(config.oauthTokenPath!, JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}

async function getAccessToken(): Promise<string> {
  if (!cachedToken) {
    cachedToken = loadToken();
  }

  if (isExpired(cachedToken)) {
    cachedToken = await refreshAccessToken(cachedToken);
  }

  return cachedToken.token;
}

/**
 * Make an authenticated GET request to the YouTube Data API v3.
 */
export async function fetchOAuthApi(
  endpoint: string,
  params: Record<string, string>
): Promise<Record<string, unknown>> {
  const accessToken = await getAccessToken();
  const url = new URL(`${config.youtubeApiBaseUrl}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    const error = (data as Record<string, Record<string, unknown>>).error;
    const message = error?.message ?? `YouTube API error: ${response.status}`;
    throw new Error(String(message));
  }

  return data;
}

/**
 * Make an authenticated POST/PUT/DELETE request to the YouTube Data API v3.
 */
export async function mutateOAuthApi(
  method: "POST" | "PUT" | "DELETE",
  endpoint: string,
  params: Record<string, string>,
  body?: unknown
): Promise<Record<string, unknown> | null> {
  const accessToken = await getAccessToken();
  const url = new URL(`${config.youtubeApiBaseUrl}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  };

  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url.toString(), init);

  // DELETE returns 204 No Content on success
  if (response.status === 204) return null;

  const data = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    const error = (data as Record<string, Record<string, unknown>>).error;
    const message = error?.message ?? `YouTube API error: ${response.status}`;
    throw new Error(String(message));
  }

  return data;
}
