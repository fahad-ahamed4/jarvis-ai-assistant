import { NextRequest, NextResponse } from "next/server";
import { broadcast, emitTo } from "@/lib/device-bus";

export const dynamic = "force-dynamic";

type Body = {
  fromId: string;
  fromName?: string;
  targetId?: string | null; // null → broadcast to ALL other devices
  text: string;
};

// Relay a command to one device (or all devices).
export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const text = (body.text || "").trim().slice(0, 500);
  if (!text || !body.fromId) {
    return NextResponse.json({ error: "text and fromId required" }, { status: 400 });
  }

  const payload = {
    id: crypto.randomUUID(),
    text,
    fromId: body.fromId,
    fromName: body.fromName || "Website",
    ts: Date.now(),
  };

  let sent = 0;
  if (body.targetId) {
    sent = emitTo(body.targetId, "command", payload);
  } else {
    broadcast("command", payload, body.fromId);
  }

  if (sent === 0 && body.targetId) {
    return NextResponse.json(
      { sent: 0, error: "device is offline (no live connection)" },
      { status: 409 }
    );
  }

  return NextResponse.json({ sent, payload });
}
