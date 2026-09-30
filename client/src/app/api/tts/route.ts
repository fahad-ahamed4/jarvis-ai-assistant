import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_LEN = 900;

/* Voice routing (tested on real API):
 *  - "jam"     → perfect English. Garbles Bangla & Hindi (spells them out).
 *  - "kazi"    → natural-length Bangla audio. English fallback voice.
 *  - Hindi     → NO cloud voice speaks it properly → client uses device voice,
 *                so for hi we answer 501 and the client falls back gracefully. */
function pickVoice(lang: string): string | null {
  if (lang === "bn") return "kazi";
  if (lang === "hi") return null; // no usable cloud voice → device fallback
  return "jam"; // en + anything else
}

function splitText(text: string): string[] {
  if (text.length <= MAX_LEN) return [text];
  const sentences = text.match(/[^.!?।]+[.!?।]*/g) || [text];
  const chunks: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + s).length <= MAX_LEN) {
      cur += s;
    } else {
      if (cur) chunks.push(cur.trim());
      cur = s;
    }
  }
  if (cur) chunks.push(cur.trim());
  return chunks;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const clean = String(body?.text || "").trim();
    if (!clean) return NextResponse.json({ error: "text required" }, { status: 400 });

    const lang = ["bn", "en", "hi"].includes(String(body?.lang)) ? String(body.lang) : "en";
    const voice = pickVoice(lang);
    if (!voice) {
      // Client protocol: 501 → fall back to the device voice (never silent)
      return NextResponse.json({ error: "no cloud voice for language" }, { status: 501 });
    }

    const spd = Math.min(2, Math.max(0.5, Number(body?.speed) || 1.0));
    const chunks = splitText(clean).slice(0, 4);

    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const zai = await ZAI.create();
    const buffers: Buffer[] = [];

    for (const chunk of chunks) {
      let arrayBuffer: ArrayBuffer | null = null;
      // retries to smooth over transient rate limits
      for (let attempt = 0; attempt < 3 && !arrayBuffer; attempt++) {
        try {
          const response = await zai.audio.tts.create({
            input: chunk,
            voice,
            speed: spd,
            response_format: "wav",
            stream: false,
          });
          arrayBuffer = await response.arrayBuffer();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const retriable = msg.includes("429") || msg.toLowerCase().includes("too many") || msg.includes("ECONNRESET");
          if (attempt < 2 && retriable) {
            await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          } else {
            throw err;
          }
        }
      }
      if (!arrayBuffer) return NextResponse.json({ error: "TTS failed" }, { status: 502 });
      buffers.push(Buffer.from(new Uint8Array(arrayBuffer)));
    }

    const merged = Buffer.concat(buffers);
    return new NextResponse(new Uint8Array(merged), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": merged.length.toString(),
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    console.error("tts route error:", e);
    // Client protocol: any failure → client falls back to the device voice
    return NextResponse.json({ error: "TTS failed" }, { status: 500 });
  }
}
