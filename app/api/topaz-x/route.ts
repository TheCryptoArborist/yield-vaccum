import { NextResponse } from "next/server";

type FxStatus = {
  id?: string;
  url?: string;
  text?: string;
  created_at?: string;
  author?: { name?: string; screen_name?: string; avatar_url?: string; verification?: { verified?: boolean } };
  media?: { photos?: Array<{ url?: string; width?: number; height?: number }> };
};

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch("https://api.fxtwitter.com/2/profile/TopazDex/statuses", {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!response.ok) throw new Error(`Topaz X feed returned ${response.status}`);
    const data = await response.json() as { statuses?: FxStatus[]; results?: FxStatus[] };
    const status = (data.statuses || data.results || [])[0];
    if (!status?.id || !status.text || !status.created_at) throw new Error("No Topaz post returned");
    const photo = status.media?.photos?.[0];

    return NextResponse.json({
      id: status.id,
      url: status.url || `https://x.com/TopazDex/status/${status.id}`,
      text: status.text,
      createdAt: status.created_at,
      author: {
        name: status.author?.name || "Topaz Dex",
        handle: status.author?.screen_name || "TopazDex",
        avatarUrl: status.author?.avatar_url || "",
        verified: Boolean(status.author?.verification?.verified),
      },
      image: photo?.url ? { url: photo.url, width: photo.width || 1200, height: photo.height || 675 } : undefined,
    }, { headers: { "Cache-Control": "public, max-age=120, s-maxage=300, stale-while-revalidate=600" } });
  } catch {
    return NextResponse.json({ error: "Latest Topaz X post is unavailable" }, { status: 502 });
  }
}
