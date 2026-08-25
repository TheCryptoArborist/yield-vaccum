const CHANNEL_ID = "UCZOWB0j9oUseJkO8TGL3U4Q";
const CHANNEL_URL = "https://www.youtube.com/@TopazDex";

type BroadcastState = "live" | "upcoming" | "offline";

type BroadcastStatus = {
  state: BroadcastState;
  videoId?: string;
  title?: string;
  scheduledStart?: string;
};

type SearchItem = {
  id?: { videoId?: string };
  snippet?: { title?: string; liveBroadcastContent?: string; publishedAt?: string };
};

function nearestVideoId(html: string, markerIndex: number) {
  const before = html.slice(Math.max(0, markerIndex - 16000), markerIndex);
  const matches = [...before.matchAll(/"videoId":"([^"]+)"/g)];
  return matches.at(-1)?.[1];
}

function decodeTitle(value?: string) {
  return value
    ?.replaceAll("\\u0026", "&")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"');
}

function nearestTitle(html: string, markerIndex: number) {
  const before = html.slice(Math.max(0, markerIndex - 16000), markerIndex);
  const matches = [...before.matchAll(/"title":\{"runs":\[\{"text":"([^"]+)"/g)];
  return decodeTitle(matches.at(-1)?.[1]);
}

async function searchYouTube(eventType: "live" | "upcoming") {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;

  const params = new URLSearchParams({
    part: "snippet",
    channelId: CHANNEL_ID,
    eventType,
    type: "video",
    maxResults: "1",
    order: "date",
    key,
  });
  const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, {
    next: { revalidate: 90 },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { items?: SearchItem[] };
  const item = data.items?.[0];
  if (!item?.id?.videoId) return null;
  return {
    videoId: item.id.videoId,
    title: item.snippet?.title,
    scheduledStart: item.snippet?.publishedAt,
  };
}

async function publicChannelStatus(): Promise<BroadcastStatus> {
  const response = await fetch(`${CHANNEL_URL}/streams`, {
    headers: { "user-agent": "Yield Vacuum/1.0" },
    next: { revalidate: 90 },
  });
  if (!response.ok) return { state: "offline" };
  const html = await response.text();

  const liveMarkers = ['"isLiveNow":true', '"style":"BADGE_STYLE_TYPE_LIVE_NOW"'];
  const liveIndex = liveMarkers.map((marker) => html.indexOf(marker)).find((index) => index >= 0) ?? -1;
  if (liveIndex >= 0) {
    return {
      state: "live",
      videoId: nearestVideoId(html, liveIndex),
      title: nearestTitle(html, liveIndex),
    };
  }

  const upcomingMatch = /"upcomingEventData":\{"startTime":"(\d+)"/.exec(html);
  if (upcomingMatch?.index !== undefined) {
    return {
      state: "upcoming",
      videoId: nearestVideoId(html, upcomingMatch.index),
      title: nearestTitle(html, upcomingMatch.index),
      scheduledStart: new Date(Number(upcomingMatch[1]) * 1000).toISOString(),
    };
  }

  return { state: "offline" };
}

export async function GET() {
  try {
    const live = await searchYouTube("live");
    const status: BroadcastStatus = live
      ? { state: "live", ...live }
      : await (async () => {
          const upcoming = await searchYouTube("upcoming");
          return upcoming ? { state: "upcoming" as const, ...upcoming } : publicChannelStatus();
        })();

    return Response.json(
      { ...status, channelUrl: CHANNEL_URL, checkedAt: new Date().toISOString() },
      { headers: { "cache-control": "public, s-maxage=90, stale-while-revalidate=300" } },
    );
  } catch {
    return Response.json(
      { state: "offline", channelUrl: CHANNEL_URL, checkedAt: new Date().toISOString() },
      { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=180" } },
    );
  }
}
