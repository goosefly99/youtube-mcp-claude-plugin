import { z } from "zod";
import { getVideoDetails, getVideoComments } from "../services/youtube-api.js";
import { fetchTranscript } from "../services/transcript.js";
const POSITIVE_WORDS = new Set([
    "great", "amazing", "love", "awesome", "helpful", "excellent", "best",
    "thank", "thanks", "fantastic", "wonderful", "perfect", "good", "nice",
    "brilliant", "incredible", "useful", "informative", "clear", "well",
    "appreciate", "beautiful", "enjoyed", "impressive", "outstanding",
]);
const NEGATIVE_WORDS = new Set([
    "bad", "terrible", "hate", "worst", "boring", "waste", "wrong", "poor",
    "horrible", "awful", "annoying", "useless", "confusing", "misleading",
    "disappointing", "dumb", "stupid", "sucks", "garbage", "trash",
]);
const CATEGORY_MAP = {
    "1": "Film & Animation", "2": "Autos & Vehicles", "10": "Music",
    "15": "Pets & Animals", "17": "Sports", "18": "Short Movies",
    "19": "Travel & Events", "20": "Gaming", "21": "Videoblogging",
    "22": "People & Blogs", "23": "Comedy", "24": "Entertainment",
    "25": "News & Politics", "26": "Howto & Style", "27": "Education",
    "28": "Science & Technology", "29": "Nonprofits & Activism",
    "30": "Movies", "43": "Shows",
};
function analyzeSentiment(comments) {
    let positive = 0;
    let negative = 0;
    for (const comment of comments) {
        const words = comment.toLowerCase().split(/\s+/);
        let score = 0;
        for (const word of words) {
            if (POSITIVE_WORDS.has(word))
                score++;
            if (NEGATIVE_WORDS.has(word))
                score--;
        }
        if (score > 0)
            positive++;
        else if (score < 0)
            negative++;
    }
    const neutral = comments.length - positive - negative;
    const total = comments.length;
    const overall = positive > negative * 2
        ? "Positive"
        : negative > positive * 2
            ? "Negative"
            : "Mixed";
    return { overall, positive, neutral, negative, total };
}
function extractThemes(text, topN = 10) {
    const STOP = new Set([
        "the", "a", "an", "is", "are", "was", "were", "be", "been", "have",
        "has", "had", "do", "does", "did", "will", "would", "could", "should",
        "may", "might", "can", "to", "of", "in", "for", "on", "with", "at",
        "by", "from", "as", "into", "through", "during", "before", "after",
        "between", "out", "off", "over", "under", "again", "then", "once",
        "here", "there", "when", "where", "why", "how", "all", "both", "each",
        "few", "more", "most", "other", "some", "no", "not", "only", "so",
        "than", "too", "very", "just", "and", "but", "or", "if", "while",
        "about", "up", "it", "its", "this", "that", "these", "those", "i",
        "me", "my", "we", "our", "you", "your", "he", "him", "she", "her",
        "they", "them", "their", "what", "which", "who", "whom", "like",
        "going", "get", "got", "know", "think", "well", "also", "really",
        "right", "much", "even", "back", "still", "way", "take", "make",
        "come", "go", "see", "look", "want", "give", "use", "said", "say",
        "one", "two", "new", "now", "people", "time", "thing", "things",
        "dont", "im", "ive",
    ]);
    const words = text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 3 && !STOP.has(w));
    const freq = new Map();
    for (const word of words) {
        freq.set(word, (freq.get(word) ?? 0) + 1);
    }
    return [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN)
        .map(([word]) => word);
}
export function registerAnalyzeVideoTool(server) {
    server.tool("analyze_video", "Perform a deep analysis of a YouTube video: key themes from the transcript, comment sentiment analysis, content categorization, and key moments.", {
        videoId: z.string().describe("YouTube video ID or full URL"),
        includeComments: z
            .boolean()
            .default(true)
            .describe("Include comment sentiment analysis (requires API quota)"),
    }, async ({ videoId, includeComments }) => {
        const [details, transcript] = await Promise.all([
            getVideoDetails(videoId),
            fetchTranscript(videoId).catch(() => null),
        ]);
        const comments = includeComments
            ? await getVideoComments(videoId, 50).catch(() => [])
            : [];
        const category = CATEGORY_MAP[details.categoryId] ?? `Unknown (${details.categoryId})`;
        const themes = transcript
            ? extractThemes(transcript.fullText)
            : extractThemes(details.description);
        const views = Number(details.statistics.viewCount).toLocaleString();
        const likes = Number(details.statistics.likeCount).toLocaleString();
        const commentCount = Number(details.statistics.commentCount).toLocaleString();
        const sections = [
            `# Video Analysis`,
            ``,
            `**${details.title}**`,
            `Channel: ${details.channelTitle} | Duration: ${details.duration}`,
            `Views: ${views} | Likes: ${likes} | Comments: ${commentCount}`,
            `URL: https://youtube.com/watch?v=${details.videoId}`,
            ``,
            `## Category`,
            category,
            ``,
            `## Key Themes`,
            themes.map((t) => `- ${t}`).join("\n"),
        ];
        if (comments.length > 0) {
            const sentiment = analyzeSentiment(comments);
            const pPct = Math.round((sentiment.positive / sentiment.total) * 100);
            const nPct = Math.round((sentiment.negative / sentiment.total) * 100);
            const neuPct = Math.round((sentiment.neutral / sentiment.total) * 100);
            sections.push(``, `## Comment Sentiment (${sentiment.total} comments analyzed)`, `Overall: ${sentiment.overall}`, `- Positive: ${sentiment.positive} (${pPct}%)`, `- Neutral: ${sentiment.neutral} (${neuPct}%)`, `- Negative: ${sentiment.negative} (${nPct}%)`);
        }
        else if (includeComments) {
            sections.push(``, `## Comment Sentiment`, `Comments are disabled or unavailable for this video.`);
        }
        if (transcript) {
            // Detect topic shifts by comparing word sets in adjacent chunks
            const chunkSize = 120;
            const moments = [];
            let prevWords = new Set();
            let chunkStart = 0;
            let chunkTexts = [];
            for (const seg of transcript.segments) {
                if (seg.start >= chunkStart + chunkSize && chunkTexts.length > 0) {
                    const currentWords = new Set(chunkTexts
                        .join(" ")
                        .toLowerCase()
                        .replace(/[^a-z0-9\s]/g, "")
                        .split(/\s+/)
                        .filter((w) => w.length > 3));
                    if (prevWords.size > 0) {
                        const overlap = [...currentWords].filter((w) => prevWords.has(w)).length;
                        const similarity = overlap / Math.max(prevWords.size, currentWords.size);
                        if (similarity < 0.3) {
                            const topWords = extractThemes(chunkTexts.join(" "), 3);
                            const h = Math.floor(chunkStart / 3600);
                            const m = Math.floor((chunkStart % 3600) / 60);
                            const s = Math.floor(chunkStart % 60);
                            const ts = h > 0
                                ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
                                : `${m}:${String(s).padStart(2, "0")}`;
                            moments.push({
                                timestamp: ts,
                                description: `Topic shift: ${topWords.join(", ")}`,
                            });
                        }
                    }
                    prevWords = currentWords;
                    chunkStart = seg.start;
                    chunkTexts = [];
                }
                chunkTexts.push(seg.text);
            }
            if (moments.length > 0) {
                sections.push(``, `## Key Moments (topic shifts)`, ...moments.map((m) => `- [${m.timestamp}] ${m.description}`));
            }
            sections.push(``, `## Transcript Info`, `Language: ${transcript.language}${transcript.isAutoGenerated ? " (auto-generated)" : " (manual)"}`, `Length: ${transcript.segments.length} segments, ${transcript.fullText.length} characters`);
        }
        else {
            sections.push(``, `## Transcript`, `Not available for this video.`);
        }
        return { content: [{ type: "text", text: sections.join("\n") }] };
    });
}
//# sourceMappingURL=analyze-video.js.map