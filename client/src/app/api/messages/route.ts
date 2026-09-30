import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const messages = await db.message.findMany({
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return NextResponse.json({ messages });
  } catch (e) {
    console.error("messages GET error:", e);
    return NextResponse.json({ messages: [] }, { status: 200 });
  }
}

export async function DELETE() {
  try {
    await db.message.deleteMany({});
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("messages DELETE error:", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
