const youtubeApiKey = process.env.YOUTUBE_API_KEY;

if (!youtubeApiKey) {
  console.error("Error: YOUTUBE_API_KEY environment variable is required.");
  console.error("Get a free key at: https://console.cloud.google.com/apis/credentials");
  process.exit(1);
}

export const config = Object.freeze({
  youtubeApiKey,
  youtubeApiBaseUrl: "https://www.googleapis.com/youtube/v3",
});
