import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

export type Headline = {
  title: string;
  snippet: string;
  url: string;
  source: string;
  date?: string;
};

export async function GET(req: NextRequest) {
  try {
    const topic = (req.nextUrl.searchParams.get("topic") || "").trim();
    const query = topic
      ? `${topic} latest news today`
      : "top world technology AI news today headlines";

    const zai = await ZAI.create();
    const results = (await zai.functions.invoke("web_search", {
      query,
      num: 8,
      recency_days: 2,
    })) as {
      url: string;
      name: string;
      snippet: string;
      host_name: string;
      date?: string;
    }[];

    const headlines: Headline[] = (Array.isArray(results) ? results : [])
      .filter((r) => r && r.name)
      .slice(0, 8)
      .map((r) => ({
        title: r.name.trim(),
        snippet: (r.snippet || "").trim(),
        url: r.url,
        source: r.host_name || "web",
        date: r.date,
      }));

    return NextResponse.json({ headlines });
  } catch (e) {
    console.error("news route error:", e);
    return NextResponse.json({ headlines: [] }, { status: 200 });
  }
}
