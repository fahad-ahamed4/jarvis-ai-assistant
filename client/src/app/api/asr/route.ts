import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { spawn } from "child_process";
import { writeFile, readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024; // 12MB audio cap

// Normalize any audio (webm/opus, mp4/aac, ogg…) to 16kHz mono WAV via ffmpeg.
function toWav(input: string, output: string): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", input,
      "-ac", "1", "-ar", "16000",
      "-f", "wav", output,
    ]);
    p.on("error", () => resolve(false)); // ffmpeg not installed
    p.on("close", (code) => resolve(code === 0));
  });
}

async function transcribe(base64: string): Promise<string> {
  const zai = await ZAI.create();
  const asr = await zai.audio.asr.create({ file_base64: base64 });
  return String(asr.text || "").trim();
}

export async function POST(req: NextRequest) {
  try {
    const buf = Buffer.from(await req.arrayBuffer());
    if (buf.length === 0) {
      return NextResponse.json({ error: "empty audio" }, { status: 400 });
    }
    if (buf.length > MAX_BYTES) {
      return NextResponse.json({ error: "audio too large" }, { status: 413 });
    }

    const id = crypto.randomUUID();
    const rawPath = path.join(tmpdir(), `jarvis-asr-${id}.raw`);
    const wavPath = path.join(tmpdir(), `jarvis-asr-${id}.wav`);
    await writeFile(rawPath, buf);

    let text = "";
    try {
      const ok = await toWav(rawPath, wavPath);
      if (ok) {
        const wav = await readFile(wavPath);
        text = await transcribe(wav.toString("base64"));
      } else {
        // no ffmpeg on the host — try the raw bytes directly
        text = await transcribe(buf.toString("base64"));
      }
    } finally {
      unlink(rawPath).catch(() => {});
      unlink(wavPath).catch(() => {});
    }

    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "asr failed", text: "" },
      { status: 500 }
    );
  }
}
