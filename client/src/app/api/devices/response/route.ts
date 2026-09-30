import { NextRequest, NextResponse } from "next/server";
import { emitTo } from "@/lib/device-bus";

export const dynamic = "force-dynamic";

type Body = {
  fromId: string; // device that executed the command
  toId: string; // website that sent the command
  text: string;
};

// Device → website reply after executing a relayed command.
export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const text = (body.text || "").slice(0, 400);
  if (!text || !body.toId || !body.fromId) {
    return NextResponse.json({ error: "text, toId, fromId required" }, { status: 400 });
  }

  const sent = emitTo(body.toId, "response", { fromId: body.fromId, text, ts: Date.now() });
  return NextResponse.json({ sent });
}
