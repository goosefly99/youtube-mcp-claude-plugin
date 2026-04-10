import { parseVideoId } from "./youtube-api.js";
import type { Transcript, TranscriptSegment, CaptionTrack } from "../types.js";

const INNERTUBE_PLAYER_URL =
  "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const ANDROID_CLIENT_VERSION = "20.10.38";
const ANDROID_USER_AGENT = `com.google.android.youtube/${ANDROID_CLIENT_VERSION} (Linux; U; Android 14)`;

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) =>
      String.fromCodePoint(parseInt(dec, 10))
    )
    .replace(/\n/g, " ")
    .trim();
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

async function fetchCaptionTracks(videoId: string): Promise<CaptionTrack[]> {
  const response = await fetch(INNERTUBE_PLAYER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": ANDROID_USER_AGENT,
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: "ANDROID",
          clientVersion: ANDROID_CLIENT_VERSION,
        },
      },
      videoId,
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(
        "Rate limited by YouTube. Please wait a moment and try again."
      );
    }
    throw new Error(`Failed to fetch video data: HTTP ${response.status}`);
  }

  interface PlayerResponse {
    playabilityStatus?: { status: string; reason?: string };
    captions?: {
      playerCaptionsTracklistRenderer?: {
        captionTracks?: Array<{
          baseUrl: string;
          languageCode: string;
          name?: { simpleText?: string; runs?: Array<{ text: string }> };
          kind?: string;
        }>;
      };
    };
  }

  const data = (await response.json()) as PlayerResponse;

  if (data.playabilityStatus?.status !== "OK") {
    throw new Error(
      `Video unavailable: ${data.playabilityStatus?.reason ?? data.playabilityStatus?.status ?? "unknown error"}`
    );
  }

  const tracks =
    data.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks || tracks.length === 0) {
    throw new Error(
      "No captions available for this video. The creator may not have enabled captions."
    );
  }

  return tracks.map((track) => ({
    baseUrl: track.baseUrl,
    languageCode: track.languageCode,
    name:
      track.name?.simpleText ??
      track.name?.runs?.map((r) => r.text).join("") ??
      track.languageCode,
    kind: track.kind,
  }));
}

function selectTrack(
  tracks: CaptionTrack[],
  language?: string
): CaptionTrack {
  if (language) {
    const exact = tracks.find((t) => t.languageCode === language);
    if (exact) return exact;
    const prefix = tracks.find((t) =>
      t.languageCode.startsWith(language.split("-")[0])
    );
    if (prefix) return prefix;
    throw new Error(
      `No captions found for language "${language}". Available: ${tracks.map((t) => t.languageCode).join(", ")}`
    );
  }

  // Prefer manual captions over auto-generated
  const manual = tracks.find((t) => t.kind !== "asr");
  return manual ?? tracks[0];
}

function parseTimedTextXml(xml: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];

  // Format 3: <p t="1360" d="1680">text</p> (milliseconds)
  const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let match: RegExpExecArray | null;

  while ((match = pRegex.exec(xml)) !== null) {
    const innerHtml = match[3];
    // Segments may contain <s> sub-elements
    let text: string;
    if (innerHtml.includes("<s")) {
      const parts: string[] = [];
      const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
      let sMatch: RegExpExecArray | null;
      while ((sMatch = sRegex.exec(innerHtml)) !== null) {
        parts.push(sMatch[1]);
      }
      text = parts.length > 0 ? parts.join("") : stripTags(innerHtml);
    } else {
      text = stripTags(innerHtml);
    }

    text = decodeHtmlEntities(text).trim();
    if (text) {
      segments.push({
        start: parseInt(match[1], 10) / 1000,
        duration: parseInt(match[2], 10) / 1000,
        text,
      });
    }
  }

  // Fallback: legacy format <text start="1.23" dur="4.56">text</text> (seconds)
  if (segments.length === 0) {
    const textRegex =
      /<text start="([\d.]+)" dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
    while ((match = textRegex.exec(xml)) !== null) {
      const text = decodeHtmlEntities(stripTags(match[3])).trim();
      if (text) {
        segments.push({
          start: parseFloat(match[1]),
          duration: parseFloat(match[2]),
          text,
        });
      }
    }
  }

  return segments;
}

export async function fetchTranscript(
  videoIdOrUrl: string,
  language?: string
): Promise<Transcript> {
  const videoId = parseVideoId(videoIdOrUrl);
  const tracks = await fetchCaptionTracks(videoId);
  const track = selectTrack(tracks, language);

  const response = await fetch(track.baseUrl, {
    headers: { "User-Agent": ANDROID_USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch transcript: HTTP ${response.status}`);
  }
  const xml = await response.text();
  const segments = parseTimedTextXml(xml);

  if (segments.length === 0) {
    throw new Error("Transcript returned no segments.");
  }

  return {
    videoId,
    language: track.languageCode,
    isAutoGenerated: track.kind === "asr",
    segments,
    fullText: segments.map((s) => s.text).join(" "),
  };
}

export async function listAvailableLanguages(
  videoIdOrUrl: string
): Promise<{ code: string; name: string; isAutoGenerated: boolean }[]> {
  const videoId = parseVideoId(videoIdOrUrl);
  const tracks = await fetchCaptionTracks(videoId);

  return tracks.map((track) => ({
    code: track.languageCode,
    name: track.name,
    isAutoGenerated: track.kind === "asr",
  }));
}
