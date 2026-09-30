import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const tasks = await db.task.findMany({ orderBy: { createdAt: "asc" } });
    return NextResponse.json({ tasks });
  } catch (e) {
    console.error("tasks GET error:", e);
    return NextResponse.json({ tasks: [] }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { title } = await req.json();
    const clean = String(title || "").trim().slice(0, 200);
    if (!clean) return NextResponse.json({ error: "title required" }, { status: 400 });
    const task = await db.task.create({ data: { title: clean } });
    return NextResponse.json({ task });
  } catch (e) {
    console.error("tasks POST error:", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, done } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const task = await db.task.update({ where: { id }, data: { done: Boolean(done) } });
    return NextResponse.json({ task });
  } catch (e) {
    console.error("tasks PATCH error:", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      await db.task.deleteMany({ where: { id } });
    } else {
      await db.task.deleteMany({ where: { done: true } });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("tasks DELETE error:", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
