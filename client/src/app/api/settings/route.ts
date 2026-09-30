import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const DEFAULTS = {
  id: "main",
  soul: "",
  speed: 1.0,
  orbColor: "green",
  lang: "auto",
  wakeWord: false,
  volume: 1.0,
  voiceMode: "auto",
  voiceInput: "auto",
};

export async function GET() {
  try {
    let settings = await db.setting.findUnique({ where: { id: "main" } });
    if (!settings) {
      settings = await db.setting.create({ data: DEFAULTS });
    }
    return NextResponse.json({ settings });
  } catch (e) {
    console.error("settings GET error:", e);
    return NextResponse.json({ settings: DEFAULTS }, { status: 200 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (typeof body.soul === "string") data.soul = body.soul.slice(0, 1000);
    if (typeof body.speed === "number") data.speed = Math.min(2, Math.max(0.5, body.speed));
    if (typeof body.orbColor === "string" && ["green", "cyan", "gold", "red", "violet"].includes(body.orbColor)) data.orbColor = body.orbColor;
    if (typeof body.lang === "string" && ["auto", "bn", "en", "hi"].includes(body.lang)) data.lang = body.lang;
    if (typeof body.wakeWord === "boolean") data.wakeWord = body.wakeWord;
    if (typeof body.volume === "number") data.volume = Math.min(1, Math.max(0.1, body.volume));
    if (typeof body.voiceMode === "string" && ["auto", "cloud", "device"].includes(body.voiceMode)) data.voiceMode = body.voiceMode;
    if (typeof body.voiceInput === "string" && ["auto", "browser", "ai"].includes(body.voiceInput)) data.voiceInput = body.voiceInput;

    const settings = await db.setting.upsert({
      where: { id: "main" },
      update: data,
      create: { ...DEFAULTS, ...data },
    });
    return NextResponse.json({ settings });
  } catch (e) {
    console.error("settings PUT error:", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
