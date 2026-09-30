import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Resolves a song query to an actual YouTube video (id + title) by scraping
 *  the public search results page — no API key needed. */
export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 120);
    if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });

    const res = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAQ%253D%253D`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
        cache: "no-store",
      }
    );
    if (!res.ok) throw new Error("youtube http " + res.status);
    const html = await res.text();

    // sp=EgIQAQ%3D%3D filters to videos; still guard with title extraction
    const ids: string[] = [];
    for (const m of html.matchAll(/"videoId":"([\w-]{11})"/g)) {
      if (!ids.includes(m[1])) ids.push(m[1]);
      if (ids.length >= 5) break;
    }
    if (!ids.length) return NextResponse.json({ videoId: null });

    const titles = [...html.matchAll(/"title":\{"runs":\[\{"text":"([^"]{3,120})"/g)].map((m) => m[1]);
    const videoId = ids[0];
    const title = titles[0] || q;

    return NextResponse.json({ videoId, title });
  } catch (e) {
    console.error("resolve-song error:", e);
    return NextResponse.json({ videoId: null });
  }
}
