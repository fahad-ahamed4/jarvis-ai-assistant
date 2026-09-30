import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { broadcast } from "@/lib/device-bus";

export const dynamic = "force-dynamic";

const ONLINE_WINDOW_MS = 90_000;

async function listDevices() {
  const rows = await db.device.findMany({ orderBy: { lastSeen: "desc" } });
  const now = Date.now();
  return rows.map((d) => ({
    ...d,
    online: now - new Date(d.lastSeen).getTime() < ONLINE_WINDOW_MS,
  }));
}

export async function GET() {
  try {
    return NextResponse.json({ devices: await listDevices() });
  } catch {
    return NextResponse.json({ devices: [] });
  }
}

type Body = {
  action: "register" | "heartbeat" | "forget";
  id: string;
  name?: string;
  platform?: string;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { action, id } = body;
  if (!id || !action) {
    return NextResponse.json({ error: "id and action required" }, { status: 400 });
  }

  try {
    if (action === "forget") {
      await db.device.deleteMany({ where: { id } });
      broadcast("devices", { devices: await listDevices() });
      return NextResponse.json({ ok: true });
    }

    const name = (body.name || "Unknown device").slice(0, 60);
    const platform = ["web", "windows", "android"].includes(body.platform || "")
      ? (body.platform as string)
      : "web";

    await db.device.upsert({
      where: { id },
      update: { lastSeen: new Date(), name, platform },
      create: { id, name, platform },
    });

    broadcast("devices", { devices: await listDevices() });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "device store failed" },
      { status: 500 }
    );
  }
}
