/* JARVIS Device Hub — optional standalone relay server (zero dependencies).
 *
 * The website (client/) already contains this hub built-in via its API routes.
 * Use THIS standalone server only if you deploy the JARVIS client to a
 * serverless platform (e.g. Vercel) where Server-Sent Events are unavailable.
 *
 *   node server/device-hub.mjs          # PORT=4000 by default
 *   PORT=5000 node server/device-hub.mjs
 *
 * Endpoints mirror the built-in ones:
 *   GET  /health
 *   GET  /api/devices
 *   POST /api/devices            { action: register|heartbeat|forget, id, name?, platform? }
 *   GET  /api/devices/stream?deviceId=X     (SSE: devices / command / response)
 *   POST /api/devices/command    { fromId, fromName?, targetId?, text }
 *   POST /api/devices/response   { fromId, toId, text }
 */
import http from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT || 4000);
const ONLINE_WINDOW_MS = 90_000;

/** @type {Map<string, {id:string,name:string,platform:string,lastSeen:number}>} */
const devices = new Map();
/** @type {Map<string, Set<(event:string,data:unknown)=>void>>} */
const listeners = new Map(); // deviceId → subscriber senders

function sseHeaders(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "X-Accel-Buffering": "no",
  });
}
function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
function listDevices() {
  const now = Date.now();
  return [...devices.values()]
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .map((d) => ({ ...d, online: now - d.lastSeen < ONLINE_WINDOW_MS }));
}
function broadcastDevices(exceptId) {
  const payload = { devices: listDevices() };
  for (const [devId, subs] of listeners) {
    if (devId === exceptId) continue;
    for (const fn of subs) fn("devices", payload);
  }
}
function emitTo(deviceId, event, data) {
  const subs = listeners.get(deviceId);
  if (!subs) return 0;
  let n = 0;
  for (const fn of subs) {
    try {
      fn(event, data);
      n++;
    } catch {
      subs.delete(fn);
    }
  }
  return n;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 1024 * 512) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    return res.end();
  }

  try {
    /* ---------- health ---------- */
    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json", ...cors });
      return res.end(
        JSON.stringify({ ok: true, service: "jarvis-device-hub", devices: devices.size, ts: Date.now() })
      );
    }

    /* ---------- device list ---------- */
    if (url.pathname === "/api/devices" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json", ...cors });
      return res.end(JSON.stringify({ devices: listDevices() }));
    }

    /* ---------- register / heartbeat / forget ---------- */
    if (url.pathname === "/api/devices" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const { action, id } = body;
      if (!id || !action) {
        res.writeHead(400, { "Content-Type": "application/json", ...cors });
        return res.end(JSON.stringify({ error: "id and action required" }));
      }
      if (action === "forget") {
        devices.delete(id);
        broadcastDevices();
      } else {
        const platform = ["web", "windows", "android"].includes(body.platform) ? body.platform : "web";
        devices.set(id, {
          id,
          name: String(body.name || "Unknown device").slice(0, 60),
          platform,
          lastSeen: Date.now(),
        });
        broadcastDevices();
      }
      res.writeHead(200, { "Content-Type": "application/json", ...cors });
      return res.end(JSON.stringify({ ok: true }));
    }

    /* ---------- SSE stream ---------- */
    if (url.pathname === "/api/devices/stream" && req.method === "GET") {
      const deviceId = url.searchParams.get("deviceId") || "anonymous";
      sseHeaders(res);
      send(res, "hello", { deviceId, ts: Date.now() });
      const fn = (event, data) => send(res, event, data);
      if (!listeners.has(deviceId)) listeners.set(deviceId, new Set());
      listeners.get(deviceId).add(fn);
      const keepAlive = setInterval(() => res.write(`: ping ${Date.now()}\n\n`), 25_000);
      req.on("close", () => {
        clearInterval(keepAlive);
        listeners.get(deviceId)?.delete(fn);
        if (listeners.get(deviceId)?.size === 0) listeners.delete(deviceId);
      });
      return;
    }

    /* ---------- relay command ---------- */
    if (url.pathname === "/api/devices/command" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const text = String(body.text || "").trim().slice(0, 500);
      if (!text || !body.fromId) {
        res.writeHead(400, { "Content-Type": "application/json", ...cors });
        return res.end(JSON.stringify({ error: "text and fromId required" }));
      }
      const payload = {
        id: randomUUID(),
        text,
        fromId: body.fromId,
        fromName: body.fromName || "Website",
        ts: Date.now(),
      };
      let sent = 0;
      if (body.targetId) {
        sent = emitTo(body.targetId, "command", payload);
        if (sent === 0) {
          res.writeHead(409, { "Content-Type": "application/json", ...cors });
          return res.end(JSON.stringify({ sent: 0, error: "device is offline (no live connection)" }));
        }
      } else {
        for (const [devId, subs] of listeners) {
          if (devId === body.fromId) continue;
          for (const fn of subs) fn("command", payload);
          sent++;
        }
      }
      res.writeHead(200, { "Content-Type": "application/json", ...cors });
      return res.end(JSON.stringify({ sent, payload }));
    }

    /* ---------- relay response ---------- */
    if (url.pathname === "/api/devices/response" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const text = String(body.text || "").slice(0, 400);
      if (!text || !body.toId || !body.fromId) {
        res.writeHead(400, { "Content-Type": "application/json", ...cors });
        return res.end(JSON.stringify({ error: "text, toId, fromId required" }));
      }
      const sent = emitTo(body.toId, "response", { fromId: body.fromId, text, ts: Date.now() });
      res.writeHead(200, { "Content-Type": "application/json", ...cors });
      return res.end(JSON.stringify({ sent }));
    }

    res.writeHead(404, { "Content-Type": "application/json", ...cors });
    res.end(JSON.stringify({ error: "not found" }));
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json", ...cors });
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : "hub error" }));
  }
});

server.listen(PORT, () => {
  console.log(`🛰️  JARVIS device hub listening on http://localhost:${PORT}`);
  console.log(`    SSE stream : /api/devices/stream?deviceId=YOUR_ID`);
  console.log(`    Register   : POST /api/devices { action:"register", id, name, platform }`);
});
