const youtubeApiKey = process.env.YOUTUBE_API_KEY;

if (!youtubeApiKey) {
  console.error("Error: YOUTUBE_API_KEY environment variable is required.");
  console.error("Get a free key at: https://console.cloud.google.com/apis/credentials");
  process.exit(1);
}

// Optional: path to a google-auth-oauthlib token.json file for OAuth-based
// playlist management tools (list, add, remove, move playlist items).
// When set, the OAuth tools become available.
const oauthTokenPath = process.env.YOUTUBE_OAUTH_TOKEN_PATH ?? null;

export const config = Object.freeze({
  youtubeApiKey,
  youtubeApiBaseUrl: "https://www.googleapis.com/youtube/v3",
  oauthTokenPath,
});
